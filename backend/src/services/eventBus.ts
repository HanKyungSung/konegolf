import { EventEmitter } from 'node:events';
import pino from 'pino';

const logger = pino({ name: 'EventBus' });

export type WsEventScope = 'staff' | 'admin';

export interface WsEventActor {
  userId: string;
  role: 'STAFF' | 'ADMIN' | 'CUSTOMER' | string;
}

export interface WsEvent<T = unknown> {
  type: string;
  version: 1;
  timestamp: string;
  payload: T;
  actor?: WsEventActor;
  scope?: {
    bookingId?: string;
    roomId?: string;
    customerId?: string;
  };
  /**
   * Audience — which client group should receive this event.
   * - 'staff'  -> staff + admin
   * - 'admin'  -> admin only
   * Default: 'staff'
   */
  audience?: WsEventScope;
}

type Listener<T = unknown> = (evt: WsEvent<T>) => void;

class TypedEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Large default limit — many routes + WS manager will subscribe.
    this.emitter.setMaxListeners(100);
  }

  emit<T = unknown>(evt: Omit<WsEvent<T>, 'version' | 'timestamp'> & { version?: 1; timestamp?: string }): void {
    const envelope: WsEvent<T> = {
      version: 1,
      timestamp: evt.timestamp ?? new Date().toISOString(),
      audience: evt.audience ?? 'staff',
      ...evt,
    } as WsEvent<T>;

    logger.debug({ type: envelope.type, audience: envelope.audience }, 'event emitted');
    this.emitter.emit(envelope.type, envelope);
    this.emitter.emit('*', envelope);
  }

  on<T = unknown>(type: string, listener: Listener<T>): void {
    this.emitter.on(type, listener as Listener);
  }

  off<T = unknown>(type: string, listener: Listener<T>): void {
    this.emitter.off(type, listener as Listener);
  }
}

export const eventBus = new TypedEventBus();
