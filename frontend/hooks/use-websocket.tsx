import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './use-auth'

// ---------------------------------------------------------------------------
// Event envelope shared with backend (see backend/src/services/eventBus.ts)
// ---------------------------------------------------------------------------

export interface WsEvent<T = any> {
  type: string
  version: 1
  timestamp: string
  payload: T
  actor?: { userId: string; role: string }
  scope?: { bookingId?: string; roomId?: string; customerId?: string }
  audience?: 'staff' | 'admin'
}

export type WsStatus = 'connecting' | 'open' | 'closed' | 'reconnecting'

type Listener = (evt: WsEvent) => void

interface WebSocketContextValue {
  status: WsStatus
  /** True when WS has been disconnected >60s; consumers may resume their polling fallback. */
  isPollingFallback: boolean
  /** Subscribe to an event type. Returns an unsubscribe function. */
  subscribe: (type: string, listener: Listener) => () => void
}

const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined)

// ---------------------------------------------------------------------------
// URL resolution
// ---------------------------------------------------------------------------

function resolveWsUrl(): string {
  // Derive from API base (http(s):// -> ws(s)://). The REACT_APP_API_BASE literal
  // is the only `process.env.*` reference webpack's DefinePlugin replaces — any
  // other reference would ReferenceError in the browser.
  const apiBase =
    process.env.REACT_APP_API_BASE !== undefined
      ? process.env.REACT_APP_API_BASE
      : 'http://localhost:8080'

  try {
    const u = new URL(apiBase, window.location.href)
    const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${wsProto}//${u.host}${u.pathname.replace(/\/$/, '')}/ws`
  } catch {
    return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
  }
}

// Roles that are eligible for the staff realtime channel. Customers do not
// open a WS connection (the backend would reject them with 403).
const WS_ELIGIBLE_ROLES = new Set(['ADMIN', 'STAFF', 'SALES'])

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const MAX_BACKOFF_MS = 30_000
const INITIAL_BACKOFF_MS = 1000
const FALLBACK_TRIGGER_MS = 60_000

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [status, setStatus] = useState<WsStatus>('closed')
  const [isPollingFallback, setIsPollingFallback] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const listenersRef = useRef<Map<string, Set<Listener>>>(new Map())
  const backoffRef = useRef<number>(INITIAL_BACKOFF_MS)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldReconnectRef = useRef<boolean>(true)
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable subscribe API
  const subscribe = useMemo(() => {
    return (type: string, listener: Listener) => {
      const map = listenersRef.current
      if (!map.has(type)) map.set(type, new Set())
      map.get(type)!.add(listener)
      return () => {
        map.get(type)?.delete(listener)
      }
    }
  }, [])

  // Connect/disconnect driven by auth state
  useEffect(() => {
    // Only connect when authenticated staff/admin/sales. Customers are rejected
    // at the server anyway — don't even attempt (avoids reconnect loops).
    const role = (user?.role ?? '').toString().toUpperCase()
    if (!user || !WS_ELIGIBLE_ROLES.has(role)) {
      shouldReconnectRef.current = false
      if (wsRef.current) {
        try { wsRef.current.close() } catch { /* ignore */ }
        wsRef.current = null
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      setStatus('closed')
      return
    }

    shouldReconnectRef.current = true

    const connect = () => {
      if (!shouldReconnectRef.current) return
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return
      }
      setStatus((prev) => (prev === 'closed' ? 'connecting' : 'reconnecting'))
      const url = resolveWsUrl()
      let ws: WebSocket
      try {
        ws = new WebSocket(url)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[WS] construct failed', err)
        scheduleReconnect()
        return
      }
      wsRef.current = ws

      ws.onopen = () => {
        backoffRef.current = INITIAL_BACKOFF_MS
        setStatus('open')
        setIsPollingFallback(false)
        if (fallbackTimerRef.current) {
          clearTimeout(fallbackTimerRef.current)
          fallbackTimerRef.current = null
        }
      }

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(typeof ev.data === 'string' ? ev.data : '')
          if (!data || typeof data !== 'object') return
          // Handshake messages ({type:'connected'}) & pong are harmless — listeners may still subscribe.
          const listeners = listenersRef.current.get(data.type)
          if (listeners) {
            listeners.forEach((fn) => {
              try { fn(data as WsEvent) } catch (e) {
                // eslint-disable-next-line no-console
                console.error('[WS] listener error', e)
              }
            })
          }
        } catch {
          /* ignore malformed */
        }
      }

      ws.onclose = () => {
        wsRef.current = null
        if (shouldReconnectRef.current) scheduleReconnect()
        else setStatus('closed')
      }

      ws.onerror = () => {
        // close will follow; reconnect handled there
      }
    }

    const scheduleReconnect = () => {
      setStatus('reconnecting')
      // Arm polling-fallback timer on first disconnect; stays armed until reconnect.
      if (!fallbackTimerRef.current && !isPollingFallback) {
        fallbackTimerRef.current = setTimeout(() => {
          setIsPollingFallback(true)
        }, FALLBACK_TRIGGER_MS)
      }
      const delay = Math.min(backoffRef.current, MAX_BACKOFF_MS)
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = setTimeout(connect, delay)
    }

    connect()

    return () => {
      shouldReconnectRef.current = false
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current)
        fallbackTimerRef.current = null
      }
      if (wsRef.current) {
        try { wsRef.current.close() } catch { /* ignore */ }
        wsRef.current = null
      }
      setStatus('closed')
      setIsPollingFallback(false)
    }
  }, [user?.id, user?.role])

  const value = useMemo<WebSocketContextValue>(() => ({ status, isPollingFallback, subscribe }), [status, isPollingFallback, subscribe])

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Consumer hooks
// ---------------------------------------------------------------------------

export function useWebSocket(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext)
  if (!ctx) {
    // Soft fallback so pages can be rendered outside provider (e.g. tests)
    return {
      status: 'closed',
      isPollingFallback: false,
      subscribe: () => () => {},
    }
  }
  return ctx
}

/**
 * Subscribe to a specific event type with automatic unsubscribe on unmount.
 *
 * @example
 *   useWsEvent('booking.status_changed', (evt) => {
 *     refetchBooking(evt.payload.bookingId)
 *   })
 */
export function useWsEvent<T = any>(
  type: string,
  handler: (evt: WsEvent<T>) => void,
): void {
  const { subscribe } = useWebSocket()
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  }, [handler])
  useEffect(() => {
    const unsub = subscribe(type, (evt) => handlerRef.current(evt as WsEvent<T>))
    return unsub
  }, [type, subscribe])
}
