import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import logger from './lib/logger';
import path from 'path';
import http from 'http';
import { bookingRouter } from './routes/booking';
import bookingSimpleRouter from './routes/bookingSimple';
import { authRouter } from './routes/auth';
import settingsRouter from './routes/settings';
import usersRouter from './routes/users';
import customersRouter from './routes/customers';
import menuRouter from './routes/menu';
import receiptRouter from './routes/receipt';
import { printRouter } from './routes/print';
import contactRouter from './routes/contact';
import couponsRouter from './routes/coupons';
import reportsRouter from './routes/reports';
import employeesRouter from './routes/employees';
import timeEntriesRouter from './routes/timeEntries';
import paymentReceiptsRouter from './routes/receipts';
import receiptAnalysisRouter from './routes/receiptAnalysis';
import cookieParser from 'cookie-parser';
import { WebSocketManager } from './services/websocket-manager';
import { startCouponScheduler } from './jobs/couponScheduler';
import { startBookingReportScheduler } from './jobs/bookingReportScheduler';
import { startShiftReportScheduler } from './jobs/shiftReportScheduler';
import { startStaleShiftCleanup } from './jobs/staleShiftCleanup';
import { startWeeklyHoursReportScheduler } from './jobs/weeklyHoursReport';

const app = express();

// HTTP request/response logging — auto-generates reqId, logs method/url/statusCode/responseTime
app.use(pinoHttp({
  logger: logger as any,
  autoLogging: {
    ignore: (req) => (req as any).url === '/health', // skip health check noise
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
}));

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/bookings/simple', bookingSimpleRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/users', usersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/menu', menuRouter);
app.use('/api/receipts', receiptRouter);
app.use('/api/print', printRouter);
app.use('/api/contact', contactRouter);
app.use('/api/coupons', couponsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/time-entries', timeEntriesRouter);
app.use('/api/payments', paymentReceiptsRouter);
app.use('/api/receipt-analysis', receiptAnalysisRouter);

// Serve frontend static files (after API routes to avoid conflicts)
// With rootDir='.', structure is: dist/src/server.js and dist/public/
// From dist/src/, we go ../public to reach dist/public/
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath, {
  maxAge: '1h', // Cache static assets for 1 hour
  etag: true,
}));

// Global error handler — catches unhandled route errors
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, 'Unhandled route error');
  res.status(500).json({ error: 'Internal server error' });
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

const port = process.env.PORT || 8080;

// Create HTTP server from Express app
const server = http.createServer(app);

// Initialize WebSocket server
let wsManager: WebSocketManager;
try {
  wsManager = new WebSocketManager(server);
  logger.info('WebSocket server initialized for print services');
} catch (error) {
  logger.error({ err: error }, 'Failed to initialize WebSocket server');
  process.exit(1);
}

// Export function to get WebSocket manager (for routes)
export function getWebSocketManager(): WebSocketManager {
  return wsManager;
}

// Start server
server.listen(port, () => {
  logger.info(`Backend listening on port ${port}`);
  logger.info(`Serving static files from ${publicPath}`);
  logger.info(`WebSocket available for print servers`);

  // Start daily schedulers
  startCouponScheduler();
  // startBookingReportScheduler(); // Paused — re-enable when needed
  startShiftReportScheduler();
  startStaleShiftCleanup();
  startWeeklyHoursReportScheduler();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server...');
  wsManager.close();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Crash handlers — log fatal errors before process exits
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  process.exit(1);
});
