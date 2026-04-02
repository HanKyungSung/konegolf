# Payment Integration Plan

> **Ultimate Goal:** Connect the Ingenico Move/5000 card terminal directly to the web POS for automated payment processing and reconciliation.
>
> **Current Constraint:** Remote-only support — no physical access to the terminal hardware, so direct integration is deferred.

---

## Phase 1 — Receipt Photo Upload & Auto-Match (Near-term) ⬅️ START HERE

**Problem:** Staff currently send receipt photos via messaging app. Han manually cross-checks each receipt against bookings — time-consuming and error-prone.

**Solution:** Staff photograph the card receipt on the store tablet, upload it through the POS, and the system auto-matches it to the corresponding booking.

### Flow
```
Staff completes card payment on Move/5000
  → Takes photo of receipt on tablet
  → Opens booking in POS → taps "Attach Receipt"
  → Uploads photo + enters amount & last 4 digits of card
  → System marks booking as paid, stores receipt image as proof
  → Admin dashboard shows matched vs unmatched receipts
```

### Implementation Tasks
- [ ] **Receipt Upload API** — `POST /api/receipts/upload` (multipart, stores image in S3 or local volume)
- [ ] **Receipt model** — `Receipt { id, bookingId, imagePath, amount, last4, authCode?, uploadedBy, createdAt }`
- [ ] **POS UI: Attach Receipt** — button on booking detail, opens camera/file picker, form for amount + last 4
- [ ] **Auto-match logic** — match receipt to booking by amount + date proximity, flag conflicts
- [ ] **Admin Reconciliation Dashboard** — list of receipts with match status (matched / unmatched / mismatch)
- [ ] **Unmatched alerts** — highlight bookings marked "CARD" with no receipt after 24h

### Benefits
- Eliminates manual photo checking via messaging apps
- Receipt images stored with booking as audit trail
- Reconciliation dashboard gives admin visibility without being on-site

---

## Phase 2 — OCR-Assisted Receipt Matching (Mid-term)

**Improvement over Phase 1:** Instead of manual entry of amount/last4, use OCR to extract fields from the receipt photo automatically.

### Flow
```
Staff photographs receipt → uploads to POS
  → OCR extracts: amount, date/time, auth code, last 4 digits
  → System auto-matches to booking (no manual entry needed)
  → Staff confirms or corrects the match
```

### Implementation Tasks
- [ ] Integrate OCR service (Tesseract.js for on-device, or Google Cloud Vision / AWS Textract for accuracy)
- [ ] Parse Chase/JPMC receipt format — extract amount, auth code, last 4, timestamp
- [ ] Auto-match confidence scoring (exact amount + time window = high confidence)
- [ ] UI: show extracted fields with edit capability before confirming

### Considerations
- Receipt print quality affects OCR accuracy
- Chase receipts have a consistent format — template-based parsing is feasible
- Tesseract.js runs client-side (no API cost) but lower accuracy; Cloud Vision is more reliable

---

## Phase 3 — Direct Terminal Integration (Long-term) 🎯 ULTIMATE GOAL

**Full automation:** POS sends payment request → terminal processes card → result flows back to POS automatically. No photos, no manual entry.

### Chase Move/5000 Technical Details

| Detail | Value |
|--------|-------|
| **Hardware** | Ingenico Move/5000 (Chase/JPMC firmware) |
| **Interface** | JSON over WebSocket |
| **Endpoint** | `ws://[TERMINAL_IP]:1338` |
| **Mode** | Semi-Integrated |
| **Processor** | Chase Merchant Services (formerly TD Merchant Solutions) |

### Transaction Flow
```
POS sends sale request via WebSocket
  → Terminal displays amount, engages customer (Tap/Chip/PIN)
  → Terminal processes with Chase
  → Terminal returns JSON: { authCode, status, amount, last4, ... }
  → POS auto-updates booking payment status
```

### Implementation Tasks
- [ ] WebSocket client service in backend (`terminalService.ts`)
- [ ] Sale, void, and refund request handlers
- [ ] Real-time transaction status UI (waiting → processing → approved/declined)
- [ ] Auto-reconciliation — no manual step needed
- [ ] Error handling — network drops, timeouts, partial approvals

### Prerequisites (requires on-site visit)
- [ ] Confirm terminal IP and network accessibility from POS server
- [ ] Enable Semi-Integrated mode on the Move/5000
- [ ] Obtain Chase JPMC SDK credentials / API keys
- [ ] Test with JPMC POS Simulator before live transactions

### Testing Protocol
- **Remote:** Use JPMC POS Simulator for logic verification; mock WebSocket server for UI/state testing
- **On-site:** End-to-end test on same local network as terminal hardware

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-04-02 | Start with Phase 1 (receipt photo upload) | Remote-only support; can't access terminal hardware |
| 2026-04-02 | Defer direct terminal integration (Phase 3) | Requires on-site visit to configure Move/5000 |
| 2026-04-02 | Receipt matching by amount + date + last4 | Simplest reliable match without terminal integration |
