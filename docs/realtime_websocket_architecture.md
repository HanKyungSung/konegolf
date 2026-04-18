# Realtime WebSocket Architecture

> Staff/admin dashboards are push-updated over a single authenticated WebSocket
> connection. This document explains how the system is wired end-to-end, how
> events are categorized, and how it degrades gracefully when the socket drops.

**Status:** Phase 2 complete (commit `c0796de`) — POS dashboard and time-management
no longer poll while WS is healthy.

---

## 1. Big picture — the push-on-mutate pattern

```
┌─────────────┐      HTTP POST /api/bookings/:id/status      ┌──────────────────┐
│   Staff A   │ ──────────────────────────────────────────►  │    Backend       │
│  (browser)  │                                              │    (express)     │
└─────────────┘                                              └────────┬─────────┘
                                                                      │
                                                        1. DB write   │
                                                        2. emit event │
                                                                      ▼
                                                             ┌──────────────────┐
                                                             │    eventBus      │  (in-process)
                                                             │  EventEmitter    │
                                                             └────────┬─────────┘
                                                                      │ '*' fan-out
                                                                      ▼
                                                             ┌──────────────────┐
                                                             │   WS manager     │
                                                             │  (broadcast +    │
                                                             │  audience filter)│
                                                             └────────┬─────────┘
                                                                      │ ws.send()
                                                  ┌───────────────────┼───────────────────┐
                                                  ▼                   ▼                   ▼
                                          ┌─────────────┐    ┌─────────────┐     ┌─────────────┐
                                          │   Staff A   │    │   Staff B   │     │   Admin C   │
                                          │             │    │             │     │             │
                                          └─────────────┘    └─────────────┘     └─────────────┘
```

**Key rule:** WS never replaces the HTTP route. Mutations stay `POST/PATCH`. WS
only pushes a "something changed" ping so other clients can refetch **without
polling**.

---

## 2. Connection lifecycle

```
┌─── FRONTEND (WebSocketProvider in App.tsx) ─────────────────────────────┐
│                                                                         │
│   auth.user   ─────►   role ∈ {ADMIN, STAFF, SALES}?                    │
│                                 │                                       │
│                   ┌─── NO ──────┤─── YES ───┐                           │
│                   ▼                         ▼                           │
│               do nothing           new WebSocket(resolveWsUrl())        │
│               (customers don't connect)       │                         │
│                                               ▼                         │
│                                    cookie auth handshake                │
└───────────────────────────────────────────────┬─────────────────────────┘
                                                │
                                                ▼
┌─── BACKEND (server.on('upgrade')) ───────────────────────────────────────┐
│                                                                          │
│   parse cookie ──► verify session ──► check role                         │
│        │                │                │                               │
│        │                │                ├─── CUSTOMER ─► 403 close      │
│        │                │                └─── ADMIN/STAFF/SALES ──┐      │
│        │                └─── invalid ─► 401 close                 │      │
│        └─── no cookie ─► accept as PRINT client (legacy POS rail) │      │
│                                                                   ▼      │
│                                                    attach to staff map   │
│                                                    send {type:'connected'}
│                                                    start 30s heartbeat   │
└──────────────────────────────────────────────────────────────────────────┘
```

Two client pools are kept separate:

- **`printClients`** — legacy, anonymous, for the receipt-printer bridge
  (backward compat, no cookie required).
- **`staffClients`** — authenticated; each entry carries `{ userId, role }`.

Heartbeat: server pings every 30 s; client that misses a pong is closed so the
reconnect loop kicks in.

---

## 3. Event envelope — the universal shape

Every event the server pushes follows this structure:

```ts
{
  type:      "booking.status_changed",   // dotted category.action
  version:   1,
  timestamp: "2026-04-18T…",
  payload:   { bookingId, fromStatus, toStatus, roomId },
  actor:     { userId, role },           // who caused it
  scope:     { bookingId, roomId },      // what it affects (future topic routing)
  audience:  "staff"                     // "staff" → STAFF+ADMIN+SALES
                                         // "admin" → ADMIN only
}
```

The envelope is defined in `backend/src/services/eventBus.ts` and mirrored in
`frontend/hooks/use-websocket.tsx`. Bumping `version` is how we'll evolve the
payload shape without breaking older clients.

---

## 4. Event catalogue — how things are categorized

Events are grouped by **domain** (prefix) and **action** (suffix):

```
booking.*         ── created, status_changed, cancelled, completed, updated
  │
  └── when: any booking mutation in booking.ts / bookingSimple.ts
  └── subscribers: POS dashboard, future admin calendar

payment.*         ── status_changed
invoice.*         ── paid, unpaid, payment_added
  │
  └── when: invoice pay/unpay/add-payment / booking payment-status
  └── subscribers: POS dashboard tiles, receipts rail badge

order.*           ── created, updated, deleted
  │
  └── when: menu items added/removed from a seat
  └── subscribers: POS dashboard (booking totals)

receipt.*         ── uploaded, deleted, analysis_complete
  │
  └── when: staff uploads photo / admin deletes / OCR finishes on Pi
  └── subscribers: pending-receipts badge, admin/receipt-analysis (Phase 3)

timeclock.*       ── clocked_in, clocked_out, edited
  │
  └── when: kiosk PIN punch / admin edits an entry
  └── subscribers: POS time-management active list

room.*            ── updated (status: ACTIVE/MAINTENANCE/CLOSED)
  │
  └── when: admin toggles room status
  └── subscribers: POS dashboard room grid
```

Each category has a **typed emit helper** in `wsEvents.ts` so routes stay
one-liners:

```ts
// backend/src/services/wsEvents.ts
emitBookingCreated(user, { bookingId, roomId });
emitOrderChanged(user, { bookingId, orderId, change: 'updated' });
emitInvoicePaid(user, { bookingId, invoiceId, status: 'ALL_PAID' });
```

All helpers wrap the call in `safeEmit()` — emission failures are logged but
never break the HTTP response.

---

## 5. The emit → deliver pipeline (single event)

```
  ┌─────────────────────────────────┐
  │  routes/booking.ts              │
  │  router.patch('/:id/status',…)  │
  │    await updateStatus(id)       │
  │    emitBookingStatusChanged(…)  │◄── one-line call; never awaited
  └───────────────┬─────────────────┘
                  │
                  ▼
  ┌─────────────────────────────────┐
  │  services/wsEvents.ts           │
  │  safeEmit(() =>                 │   catches errors → logs, never throws
  │    eventBus.emit({type, payload,│
  │      actor, scope, audience}))  │
  └───────────────┬─────────────────┘
                  │
                  ▼
  ┌─────────────────────────────────┐
  │  services/eventBus.ts           │
  │  EventEmitter.emit(type, evt)   │   ◄── typed-name listeners
  │  EventEmitter.emit('*',   evt)  │   ◄── wildcard for WS manager
  └───────────────┬─────────────────┘
                  │
                  ▼
  ┌─────────────────────────────────┐
  │  services/websocket-manager.ts  │
  │  on('*', evt => broadcast(evt)) │
  │                                 │
  │  broadcast(evt):                │
  │    for client in staffClients:  │
  │      if allowed(evt.audience,   │
  │                 client.role):   │
  │        client.ws.send(JSON…)    │
  └───────────────┬─────────────────┘
                  │
                  ▼
  ┌─────────────────────────────────┐
  │  browser                        │
  │  ws.onmessage → dispatch to     │
  │  listenersRef.get(evt.type)     │
  │      ↓                          │
  │  useWsEvent('booking.status_…', │
  │             (evt) => refetch()) │
  └─────────────────────────────────┘
```

---

## 6. Audience filtering (who hears what)

```
            audience = 'staff'                    audience = 'admin'
                   │                                     │
                   ▼                                     ▼
         ┌─────────────────┐                    ┌─────────────────┐
         │   STAFF   ✓     │                    │   STAFF   ✗     │
         │   SALES   ✓     │                    │   SALES   ✗     │
         │   ADMIN   ✓     │                    │   ADMIN   ✓     │
         └─────────────────┘                    └─────────────────┘
         (most events)                          (reserved for
                                                 admin-only signals
                                                 like settings changes)
```

All current Phase 2 events use `audience: 'staff'`. Admin-only audience is
reserved for Phase 4 notification events (e.g. employee/settings changes).

---

## 7. Frontend subscription pattern

```tsx
// App.tsx
<AuthProvider>
  <WebSocketProvider>        //  opens socket after login, role-gated
    <Routes>… </Routes>
  </WebSocketProvider>
</AuthProvider>

// Any page that wants live updates:
function PosDashboard() {
  const refetch = useCallback(() => loadData(false), [deps])

  useWsEvent('booking.created',        refetch)   // each = independent listener
  useWsEvent('booking.status_changed', refetch)
  useWsEvent('order.created',          refetch)
  useWsEvent('order.updated',          refetch)
  // … etc
}
```

`useWsEvent` registers into a `Map<eventType, Set<listener>>` held by the
provider and auto-unsubscribes on unmount. The provider also exposes:

- `status` — `'connecting' | 'open' | 'closed' | 'reconnecting'`
- `isPollingFallback` — flips `true` after 60 s of disconnect, `false` on
  reconnect. Consumers gate their polling `setInterval` behind it.

---

## 8. Disconnect → polling fallback (resilience)

```
 WS status:     open ──────► reconnecting ──────── (60s) ────► reconnecting
                  │              │                                 │
                  │              │                                 ▼
   isPollingFallback:   false  false                             true
                                                                   │
                                                                   ▼
                                              dashboard 5s setInterval RESUMES
                                              time-mgmt 30s setInterval RESUMES

 …when WS reconnects:
                reconnecting ──────► open
                                       │
                                       ▼
                     isPollingFallback = false  → intervals cleaned up
```

Reconnect uses exponential backoff (1 s → 2 s → 4 s → … → 30 s cap).

A small **`<WsStatusDot />`** in the POS header makes the state visible:

- 🟢 green = `open` (live)
- 🟡 amber = `connecting` / `reconnecting` / `isPollingFallback`
- 🔴 red = `closed` (after logout or hard failure)

---

## 9. File-level map

```
backend/src/
├── services/
│   ├── eventBus.ts              ← typed EventEmitter wrapper (in-process pub/sub)
│   ├── wsEvents.ts              ← typed emit helpers (emitBookingCreated, …)
│   └── websocket-manager.ts     ← upgrade handler + heartbeat + broadcast
├── routes/
│   ├── booking.ts               ← 7 emit sites
│   ├── bookingSimple.ts         ← 2 emit sites
│   ├── receipts.ts              ← 2 emit sites
│   └── timeEntries.ts           ← 3 emit sites
└── server.ts                    ← wires manager to http server

frontend/
├── hooks/
│   └── use-websocket.tsx        ← WebSocketProvider, useWebSocket, useWsEvent,
│                                   isPollingFallback
├── components/
│   └── WsStatusDot.tsx          ← connection indicator
└── src/pages/pos/
    ├── dashboard.tsx            ← 13 useWsEvent subs + fallback-gated poll
    └── time-management.tsx      ← 3 useWsEvent subs + fallback-gated poll
```

---

## 10. Why this shape (design choices)

| Choice | Why |
|---|---|
| **Single `/ws` endpoint** | Less infra; role-based filtering at server, one socket per tab |
| **In-process `eventBus`** | Zero infra cost, swap-able for Redis pub/sub when we scale to >1 server node |
| **Envelope with `version`** | Lets us evolve payload shape without breaking old clients |
| **`actor` in every event** | Future audit log, "updated by X" UI, self-echo filtering |
| **`scope` field** | Phase 5: per-booking or per-room topic subscriptions to reduce fan-out |
| **Audience enum, not ACLs** | Simple, covers current needs; could grow to per-topic ACL later |
| **Cookie auth (not token param)** | Reuses existing session; no token-in-URL security smell |
| **Fallback polling** | Graceful degradation — LAN hiccup ≠ stale dashboard |

---

## 11. Polling audit — post-Phase 2

| File | Purpose | Runs |
|---|---|---|
| `pos/dashboard.tsx` 5 s (bookings + rooms) | data | **only if `isPollingFallback`** |
| `pos/time-management.tsx` 30 s (active entries) | data | **only if `isPollingFallback`** |
| `pos/dashboard.tsx:70` 1 s | clock display | always (UI) |
| `pos/dashboard.tsx:806` 60 s | clock display | always (UI) |
| `forgot-password.tsx` | OTP cooldown countdown | one-off UI only |
| `use-auth.tsx` 5 min | auth session keepalive | not a data refresh |
| `admin/receipt-analysis.tsx` `setTimeout(_, 2000)` | one-off refetch after re-analyze click | **Phase 3 target** (replace with `receipt.analysis_complete` sub) |

**Result: zero periodic data polls run while WS is healthy.**

---

## 12. Roadmap

- **Phase 3** — Admin realtime: wire `receipt.analysis_complete` into
  `admin/receipt-analysis.tsx`; emit `ocr.pi_health_changed` from the Pi health
  loop; remove the manual `setTimeout` refetch.
- **Phase 4** — Notification bell: emit on employee/customer/menu/coupon/
  settings mutations; global bell UI with sessionStorage history; exercise the
  `audience: 'admin'` path.
- **Phase 5** — Resilience & scale: event replay via `lastEventId` ring buffer;
  rate limiting; per-room / per-booking topic subscriptions using `scope`;
  metrics & load test; Redis pub/sub when running >1 backend node.

---

## Related docs

- `docs/pos_api_polling_behavior.md` — POS Electron app sync intervals (separate
  from staff browser dashboards; unaffected by this work).
- `docs/pos_sync_interval_optimization.md` — historical context on why we ran
  multiple polling loops.
