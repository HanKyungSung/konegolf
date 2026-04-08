# Payment Integration Plan

> **Ultimate Goal:** Connect the Ingenico Move/5000 card terminal directly to the web POS for automated payment processing and reconciliation.
>
> **Current Constraint:** Remote-only support — no physical access to the terminal hardware, so direct integration is deferred.

---

## Phase 1 — Receipt Photo Upload & Reconciliation (Near-term) ⬅️ START HERE

**Problem:** Staff complete card payments on the Move/5000 terminal, then send receipt photos via messaging app. Han manually cross-checks each receipt photo against bookings — time-consuming and error-prone.

**Solution:** Staff photograph the card receipt on the store tablet and attach it directly to the payment inside the POS. An admin reconciliation view shows which card payments have receipts and which don't.

---

### How It Works Today (Pain Points)

```
Terminal processes card → staff gets paper receipt
  → Staff takes phone photo → sends to Han via text/WhatsApp
  → Han opens photo, reads amount/date
  → Han searches bookings, finds the matching one
  → Han mentally marks it as "verified"
  → No audit trail, easy to miss receipts
```

### Proposed Flow

```
Terminal processes card → staff gets paper receipt → keeps receipt aside

  ... later, during downtime ...

  → Staff opens "Pending Receipts" queue in POS
  → Sees list of card payments missing receipts
  → Taps [ 📸 Add ] → camera opens → snaps receipt → uploads
  → Item disappears from queue → repeat until queue is empty

  ... or from booking detail ...

  → Staff opens specific booking → taps 📷 next to CARD payment → uploads

  ... admin checks remotely ...

  → Admin opens Reconciliation view → sees all card payments
  → Green = receipt attached, Red = missing → click to view photo
```

---

### Architecture Decisions

#### 1. Where to attach the receipt?

| Option | Pros | Cons |
|--------|------|------|
| **Payment record** ✅ | 1:1 with card swipe; most accurate | Split payments = multiple records |
| Invoice | Simpler (one per seat) | Doesn't map to individual card swipes |
| Booking | Simplest | Too coarse — booking has multiple seats/payments |

**Decision:** Attach to the **Payment** model. Each card swipe = one Payment record = one receipt photo. This matches reality: staff swipes card, gets one receipt, uploads one photo.

#### 2. File storage strategy

| Option | Pros | Cons |
|--------|------|------|
| Local filesystem | Simple, no config, already works for screenshots | Lost if server dies, no remote access |
| **Google Cloud Storage (GCS)** ✅ | Durable, accessible from anywhere, auto-backup, cheap | Requires service account setup |
| AWS S3 | Industry standard | Extra vendor (already using Google) |

**Decision:** Use **Google Cloud Storage** (GCS). The user already has a GCP project. Receipt images upload to a private GCS bucket. The backend uses a service account key. Locally and in dev, fall back to local filesystem so no GCS dependency during development.

**Setup required:**
1. Create a GCS bucket (e.g., `konegolf-receipts`)
2. Create a service account with `Storage Object Admin` role on that bucket
3. Download the JSON key file
4. Add env vars: `GCS_BUCKET=konegolf-receipts`, `GCS_KEY_FILE=/path/to/key.json`
5. In production Docker: mount key file or use workload identity

**Storage path:** `receipts/{YYYY-MM-DD}/{paymentId}.jpg`
**Access:** Backend generates signed URLs (valid ~15 min) for the frontend to display images. No public access to the bucket.

#### 3. When does staff upload?

| Option | Pros | Cons |
|--------|------|------|
| During payment dialog | Fewest steps | Slows down payment flow; camera on every card swipe |
| Immediately after payment | Fresh context | Still interrupts workflow during busy periods |
| **Later, from booking detail** ✅ | Non-disruptive; staff does it during downtime | Receipts pile up if forgotten |
| Batch upload (separate page) | Upload many at once | Needs auto-match logic; more complex |

**Decision:** Staff uploads receipts **later when free** — they open the booking, tap the 📷 icon next to the CARD payment, snap a photo. To help them find bookings that need receipts, the POS booking list shows a "needs receipt" badge, and a dedicated **Pending Receipts** queue lets them work through unmatched card payments quickly.

---

### Data Model Changes

```prisma
model Payment {
  id          String   @id @default(uuid())
  invoice     Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  invoiceId   String
  method      String   // CARD | CASH | GIFT_CARD
  amount      Decimal  @db.Decimal(10, 2)
  receiptPath String?  // NEW — relative path: "receipts/2026-04-02/abc123.jpg"
  createdAt   DateTime @default(now()) @db.Timestamptz

  @@index([invoiceId])
}
```

**Migration:** One new nullable column — zero downtime, no data loss.

---

### API Endpoints

#### Upload Receipt
```
POST /api/payments/:paymentId/receipt
Content-Type: multipart/form-data
Body: { image: File (JPEG/PNG, max 5MB) }
Auth: requireAuth + requireStaffOrAdmin

Flow: multer memoryStorage → upload to GCS bucket → save GCS path to Payment.receiptPath
Response 200: { receiptPath: "receipts/2026-04-02/abc123.jpg" }
Response 404: Payment not found
Response 400: No image / invalid format / file too large
```

#### View Receipt
```
GET /api/payments/:paymentId/receipt
Auth: requireAuth + requireStaffOrAdmin

Flow: read Payment.receiptPath → generate GCS signed URL (15 min TTL) → redirect/return URL
Response 200: { url: "https://storage.googleapis.com/..." } (signed URL)
Response 404: No receipt attached
```

#### Delete Receipt
```
DELETE /api/payments/:paymentId/receipt
Auth: requireAuth + requireAdmin

Flow: delete object from GCS → clear Payment.receiptPath
Response 200: { success: true }
```

#### Reconciliation Report
```
GET /api/reports/receipt-reconciliation?startDate=&endDate=
Auth: requireAuth + requireAdmin

Response 200: {
  summary: { total: 42, withReceipt: 35, missing: 7 },
  payments: [
    {
      paymentId, method, amount, createdAt, hasReceipt,
      invoice: { id, seatIndex, status },
      booking: { id, customerName, startTime, roomName }
    }
  ]
}
```

#### Pending Receipts (for staff queue)
```
GET /api/payments/pending-receipts?date=2026-04-02
Auth: requireAuth + requireStaffOrAdmin

Response 200: [
  {
    paymentId, method, amount, createdAt,
    booking: { id, customerName, startTime, roomName }
  }
]
```

Returns CARD/GIFT_CARD payments with no `receiptPath`. Defaults to today.

---

### POS UI Changes

#### 1. Booking List — "Needs Receipt" Badge (dashboard / booking list)

Card-paid bookings without receipt photos show a small badge so staff can spot them:

```
┌─────────────────────────────────────────────────┐
│  Today's Bookings                                │
│                                                  │
│  10:00  Room 1  Bob Lee      $45.00  PAID ✅     │
│  11:30  Room 2  Alice Kim    $90.00  PAID ✅     │
│  2:00   Room 1  John Smith   $45.00  PAID 📷    │  ← needs receipt
│  3:30   Room 2  Walk-in      $45.00  PAID 📷    │  ← needs receipt
│  5:00   Room 1  Jane Doe     $67.50  UNPAID      │
└─────────────────────────────────────────────────┘
```

- 📷 badge = at least one CARD/GIFT_CARD payment has no receipt
- ✅ = all card payments have receipts (or payment was cash-only)
- Tapping the booking opens detail → staff can attach receipt there

#### 2. Pending Receipts Queue (new page or tab)

A dedicated view so staff can batch-process receipts during downtime:

```
┌──────────────────────────────────────────────────────┐
│  📷 Pending Receipts                    3 remaining  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Room 1 │ 2:00 PM │ John Smith                 │  │
│  │  💳 Card  $45.00                   [ 📸 Add ]  │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Room 2 │ 3:30 PM │ Walk-in                    │  │
│  │  💳 Card  $45.00                   [ 📸 Add ]  │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Room 1 │ 5:30 PM │ Jane Doe                   │  │
│  │  💳 Card  $67.50                   [ 📸 Add ]  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

- Shows only CARD/GIFT_CARD payments missing receipts (today by default)
- One-tap to open camera → snap → upload → item disappears from queue
- Counter shows remaining — satisfying to clear to zero
- Date filter to catch older missed receipts

#### 3. Booking Detail — Receipt Attachment (booking-detail.tsx)

After a CARD payment is recorded, each payment row shows:

```
┌─────────────────────────────────────────────┐
│  💳 Card           $45.00    📷  ✅         │
│  💵 Cash (tip)      $8.00                   │
├─────────────────────────────────────────────┤
│  Total Paid        $53.00                   │
└─────────────────────────────────────────────┘
```

- 📷 = "Attach Receipt" button (opens camera/file picker)
- ✅ = receipt already uploaded (click to view full-screen)
- Only shown for CARD and GIFT_CARD payments (cash doesn't need receipts)

#### 4. Receipt Capture Modal

```
┌──────────────────────────────────┐
│  📷 Attach Receipt               │
│                                  │
│  ┌────────────────────────────┐  │
│  │                            │  │
│  │     [Camera Preview /      │  │
│  │      Photo Preview]        │  │
│  │                            │  │
│  └────────────────────────────┘  │
│                                  │
│  [ 📸 Take Photo ]  [ 📁 File ] │
│                                  │
│  [ Cancel ]         [ Upload ✓ ] │
└──────────────────────────────────┘
```

- On tablet: camera opens directly (mobile browser `capture="environment"`)
- Fallback: file picker for desktop browsers
- Preview before upload
- Compress image client-side before upload (target ~500KB)

#### 5. Admin Reconciliation View (new tab in time-management or reports)

```
┌─────────────────────────────────────────────────────────┐
│  Receipt Reconciliation          April 2, 2026          │
│  [◀ Prev Day]  [Date Picker]  [Next Day ▶]            │
│                                                         │
│  Summary: 12 card payments │ 10 receipts │ 2 missing   │
│  ████████████████████░░░░ 83% matched                   │
│                                                         │
│  ┌─ MISSING RECEIPTS ──────────────────────────────┐   │
│  │ ⚠️  Room 1 │ 2:00 PM │ John Smith │ $45.00     │   │
│  │ ⚠️  Room 2 │ 5:30 PM │ Jane Doe   │ $67.50     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ MATCHED ───────────────────────────────────────┐   │
│  │ ✅ Room 1 │ 10:00 AM │ Bob Lee    │ $45.00  👁  │   │
│  │ ✅ Room 2 │ 11:30 AM │ Alice Kim  │ $90.00  👁  │   │
│  │ ...                                              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [ Export CSV ]                                         │
└─────────────────────────────────────────────────────────┘
```

- 👁 = click to view receipt photo full-screen
- Missing receipts shown first (action needed)
- Date range filter
- CSV export for accounting

---

### File Storage Details

**Google Cloud Storage layout:**
```
gs://konegolf-receipts/
└── receipts/
    └── 2026-04-02/
        ├── abc123.jpg    # {paymentId}.jpg
        └── def456.jpg
```

**Local fallback (dev only):**
```
uploads/
├── screenshots/        # Existing — score capture screenshots
└── receipts/           # Fallback when GCS not configured
    └── 2026-04-02/
        └── abc123.jpg
```

- **Backend storage service** abstracts GCS vs local — single interface, swap via env var
- **GCS in production:** `GCS_BUCKET` + `GCS_KEY_FILE` env vars
- **Local in dev:** when `GCS_BUCKET` is not set, falls back to `uploads/receipts/`

- **Format:** JPEG (converted client-side if PNG/HEIC)
- **Max size:** 5MB upload, compressed client-side to ~500KB
- **Naming:** `{paymentId}.jpg` (guaranteed unique)
- **Docker:** Already covered by `score_uploads:/app/uploads` volume

---

### Client-Side Image Compression

Since receipt photos from a tablet camera can be 3-8MB, compress before upload:

```typescript
// Using browser canvas API (no library needed)
async function compressImage(file: File, maxWidth = 1200, quality = 0.7): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / img.width);
  const canvas = new OffscreenCanvas(img.width * scale, img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}
```

No external library needed — browser Canvas API handles it.

---

### Implementation Tasks (ordered)

| # | Task | Depends On | Effort |
|---|------|------------|--------|
| 1 | Add `receiptPath` to Payment model + migration | — | Small |
| 2 | GCS storage service (`storageService.ts`) — upload/download/delete with local fallback | — | Medium |
| 3 | Receipt upload endpoint (`POST /api/payments/:id/receipt`) | 1, 2 | Small |
| 4 | Receipt serve endpoint (`GET /api/payments/:id/receipt`) — returns signed URL | 1, 2 | Small |
| 5 | Receipt delete endpoint (`DELETE /api/payments/:id/receipt`) | 1, 2 | Small |
| 6 | Pending receipts endpoint (`GET /api/payments/pending-receipts`) | 1 | Small |
| 7 | Client-side image compression utility | — | Small |
| 8 | Receipt capture modal component | 7 | Medium |
| 9 | Pending Receipts queue page (staff view) | 6, 8 | Medium |
| 10 | "Needs receipt" badge on booking list | 6 | Small |
| 11 | Attach Receipt button in booking detail payment rows | 3, 8 | Medium |
| 12 | Reconciliation API endpoint | 1 | Medium |
| 13 | Reconciliation UI (admin view) | 12 | Medium |
| 14 | Tests (unit + e2e) | All above | Medium |

---

### What This Does NOT Cover (deferred)

- ❌ OCR / auto-extraction of receipt data (→ Phase 2)
- ❌ Auto-matching receipts to bookings (staff links manually by opening the booking)
- ❌ Auth code or last-4-digits entry (keep it simple — just the photo)
- ❌ Direct terminal integration (→ Phase 3)

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
