import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer, IncomingMessage } from 'http';
import pino from 'pino';
import { parse as parseCookie } from 'cookie';

import { getSession } from './authService';
import { eventBus, WsEvent } from './eventBus';

const logger = pino({ name: 'WebSocketManager' });

export interface ThermalCommand {
  type: 'text' | 'bold' | 'align' | 'size' | 'line' | 'cut' | 'newline';
  value?: string | number | boolean;
}

export interface PrintJob {
  id: string;
  type: 'receipt' | 'seat-bill';
  commands: ThermalCommand[];
}

export interface JobStatusMessage {
  type: 'job-status';
  jobId: string;
  status: 'completed' | 'failed';
  error?: string;
}

type ClientRole = 'STAFF' | 'ADMIN' | 'SALES' | 'PRINT';

const WS_ALLOWED_USER_ROLES = new Set(['ADMIN', 'STAFF', 'SALES']);

interface ClientMeta {
  role: ClientRole;
  userId?: string;
  email?: string;
  /** Liveness flag for heartbeat sweep. */
  isAlive: boolean;
}

const HEARTBEAT_MS = 30_000;

export class WebSocketManager {
  private wss: WebSocketServer;
  private printClients: Set<WebSocket> = new Set();
  private staffClients: Map<WebSocket, ClientMeta> = new Map();
  private heartbeatTimer: NodeJS.Timeout;

  constructor(server: HttpServer) {
    // noServer: we handle the upgrade manually so we can authenticate before accepting.
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket as any, head);
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage, meta: ClientMeta) => {
      if (meta.role === 'PRINT') {
        this.acceptPrintClient(ws);
        return;
      }
      this.acceptStaffClient(ws, meta);
    });

    // Subscribe event bus -> broadcast
    eventBus.on('*', (evt) => this.broadcast(evt));

    // Heartbeat ping/pong
    this.heartbeatTimer = setInterval(() => this.sweepDeadSockets(), HEARTBEAT_MS);

    logger.info('WebSocket server initialized (auth + eventBus wired)');
  }

  // ---------------------------------------------------------------------------
  // Upgrade / auth
  // ---------------------------------------------------------------------------

  private handleUpgrade(req: IncomingMessage, socket: import('net').Socket, head: Buffer): void {
    const cookieHeader = req.headers.cookie;
    const cookies = cookieHeader ? parseCookie(cookieHeader) : {};
    const token = cookies.session;

    // No cookie = legacy print server client (keeps existing behavior)
    if (!token) {
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req, { role: 'PRINT', isAlive: true });
      });
      return;
    }

    // Cookie present — authenticate it. Invalid cookie => reject.
    getSession(token)
      .then((session) => {
        if (!session) {
          logger.warn('WS upgrade rejected: invalid session');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        const userRole = String(session.user.role ?? '').toUpperCase();
        if (!WS_ALLOWED_USER_ROLES.has(userRole)) {
          // Customers are not permitted on the staff realtime channel.
          logger.warn({ userId: session.user.id, role: userRole }, 'WS upgrade rejected: role not allowed');
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
        const role = userRole as ClientRole;
        const meta: ClientMeta = {
          role,
          userId: session.user.id,
          email: session.user.email ?? undefined,
          isAlive: true,
        };
        this.wss.handleUpgrade(req, socket, head, (ws) => {
          this.wss.emit('connection', ws, req, meta);
        });
      })
      .catch((err) => {
        logger.error({ err }, 'WS upgrade auth error');
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
      });
  }

  // ---------------------------------------------------------------------------
  // Print client (legacy)
  // ---------------------------------------------------------------------------

  private acceptPrintClient(ws: WebSocket): void {
    logger.info('Print server connected');
    this.printClients.add(ws);
    (ws as any)._isAlive = true;

    ws.on('pong', () => { (ws as any)._isAlive = true; });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as JobStatusMessage;
        if (message.type === 'job-status') {
          logger.info({ jobId: message.jobId, status: message.status, error: message.error }, 'Job status received');
        }
      } catch (error) {
        logger.error({ err: error }, 'Failed to parse WebSocket message');
      }
    });

    ws.on('close', () => {
      logger.info('Print server disconnected');
      this.printClients.delete(ws);
    });

    ws.on('error', (error) => {
      logger.error({ err: error }, 'WebSocket error (print)');
      this.printClients.delete(ws);
    });

    ws.send(JSON.stringify({ type: 'connected', channel: 'print', message: 'Connected to K one Golf backend' }));
  }

  // ---------------------------------------------------------------------------
  // Staff/admin client
  // ---------------------------------------------------------------------------

  private acceptStaffClient(ws: WebSocket, meta: ClientMeta): void {
    logger.info({ userId: meta.userId, role: meta.role }, 'Staff client connected');
    this.staffClients.set(ws, meta);

    ws.on('pong', () => {
      const m = this.staffClients.get(ws);
      if (m) m.isAlive = true;
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        // Client-initiated messages (future: subscribe/unsubscribe to rooms).
        // For now just log; ping replies are handled by `pong` event.
        if (msg?.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (err) {
        logger.debug({ err }, 'Ignoring malformed staff WS message');
      }
    });

    ws.on('close', () => {
      logger.info({ userId: meta.userId }, 'Staff client disconnected');
      this.staffClients.delete(ws);
    });

    ws.on('error', (err) => {
      logger.error({ err, userId: meta.userId }, 'WebSocket error (staff)');
      this.staffClients.delete(ws);
    });

    ws.send(JSON.stringify({
      type: 'connected',
      channel: 'staff',
      role: meta.role,
      timestamp: Date.now(),
    }));
  }

  // ---------------------------------------------------------------------------
  // Event bus -> broadcast
  // ---------------------------------------------------------------------------

  private broadcast(evt: WsEvent): void {
    const audience = evt.audience ?? 'staff';
    const message = JSON.stringify(evt);
    let sent = 0;
    this.staffClients.forEach((meta, ws) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (audience === 'admin' && meta.role !== 'ADMIN') return;
      try {
        ws.send(message);
        sent++;
      } catch (err) {
        logger.error({ err, userId: meta.userId }, 'Failed to send WS event');
      }
    });
    if (sent > 0) {
      logger.debug({ type: evt.type, audience, sent }, 'event broadcast');
    }
  }

  // ---------------------------------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------------------------------

  private sweepDeadSockets(): void {
    // Staff clients
    this.staffClients.forEach((meta, ws) => {
      if (!meta.isAlive) {
        logger.info({ userId: meta.userId }, 'Staff WS dead — terminating');
        ws.terminate();
        this.staffClients.delete(ws);
        return;
      }
      meta.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    });

    // Print clients (best-effort)
    this.printClients.forEach((ws) => {
      if ((ws as any)._isAlive === false) {
        ws.terminate();
        this.printClients.delete(ws);
        return;
      }
      (ws as any)._isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    });
  }

  // ---------------------------------------------------------------------------
  // Public API (unchanged contract for print)
  // ---------------------------------------------------------------------------

  broadcastPrintJob(job: PrintJob): void {
    const message = JSON.stringify({ type: 'print-job', job });
    let sentCount = 0;
    this.printClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        sentCount++;
      }
    });
    logger.info({ jobId: job.id, type: job.type, clients: sentCount }, 'Print job broadcasted');
    if (sentCount === 0) {
      logger.warn({ jobId: job.id }, 'No print servers connected to receive job');
    }
  }

  getConnectedCount(): number {
    return Array.from(this.printClients).filter((c) => c.readyState === WebSocket.OPEN).length;
  }

  getStaffConnectedCount(): number {
    return Array.from(this.staffClients.keys()).filter((c) => c.readyState === WebSocket.OPEN).length;
  }

  close(): void {
    clearInterval(this.heartbeatTimer);
    this.printClients.forEach((c) => c.close());
    this.staffClients.forEach((_m, c) => c.close());
    this.wss.close();
    logger.info('WebSocket server closed');
  }
}

