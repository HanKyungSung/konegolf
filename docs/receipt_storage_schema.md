# Receipt Photo Storage — Database Schema

## Overview

Receipt photos are attached to **Payment** records in the database and stored in **Google Drive**. The `receiptPath` field on the Payment model links the DB record to the actual image file.

## Data Model

```
┌──────────────────────────────────────┐
│  BOOKING                             │
│  id, customerName, room, startTime   │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  INVOICE  (1 per seat)         │  │
│  │  seatIndex, subtotal, tax,     │  │
│  │  tip, totalAmount, status      │  │
│  │                                │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │ PAYMENT                  │  │  │
│  │  │ method: CARD             │  │  │
│  │  │ amount: $30.00           │  │  │
│  │  │ receiptPath: ────────────┼──┼──┼─→ Google Drive
│  │  │  receipts/2026-04-07/    │  │  │   📸 {paymentId}.jpg
│  │  │  {paymentId}.jpg         │  │  │
│  │  └──────────────────────────┘  │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │ PAYMENT                  │  │  │
│  │  │ method: CASH             │  │  │
│  │  │ amount: $18.99           │  │  │
│  │  │ receiptPath: null        │  │  │
│  │  │ (cash = no card receipt) │  │  │
│  │  └──────────────────────────┘  │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  INVOICE  (Seat 2) ...         │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

## Relationship Chain

| From | → | To | Relationship |
|------|---|-----|-------------|
| Booking | → | Invoice[] | 1 booking has 1-4 invoices (1 per seat) |
| Invoice | → | Payment[] | 1 invoice can have multiple payments (split pay) |
| Payment | → | receiptPath | String pointing to Google Drive file |

## Prisma Schema (relevant fields)

```prisma
model Booking {
  id           String    @id @default(uuid())
  customerName String
  invoices     Invoice[]
}

model Invoice {
  id          String    @id @default(uuid())
  booking     Booking   @relation(...)
  bookingId   String
  seatIndex   Int       // 1-4
  subtotal    Decimal
  tax         Decimal
  totalAmount Decimal
  status      String    // UNPAID | PAID
  payments    Payment[]
}

model Payment {
  id          String   @id @default(uuid())
  invoice     Invoice  @relation(...)
  invoiceId   String
  method      String   // CARD | CASH | GIFT_CARD | COUPON
  amount      Decimal  // $0 allowed for COUPON method
  receiptPath String?  // null = no receipt uploaded
  createdAt   DateTime
  analysis    ReceiptAnalysis?  // 1:1 Ollama extraction result
}

model ReceiptAnalysis {
  id              String   @id @default(uuid())
  payment         Payment  @relation(...)
  paymentId       String   @unique
  extractedAmount Decimal?
  cardLast4       String?
  cardType        String?
  transactionDate String?
  transactionTime String?
  terminalId      String?
  approvalCode    String?
  rawResponse     String?  @db.Text
  matchStatus     String   // PENDING | MATCHED | MISMATCH | UNREADABLE
  mismatchReason  String?
  analyzedAt      DateTime
  modelUsed       String?
}
```

> **Note:** COUPON payments ($0) do not require receipts. The pending-receipts endpoint only lists CARD and GIFT_CARD payments.

## Storage Details

| Setting | Value |
|---------|-------|
| **Provider** | Google Drive (via service account with domain-wide delegation) |
| **Impersonates** | `general@konegolf.ca` |
| **Root folder** | "Konegolf Uploaded Receipts" |
| **File path** | `receipts/{YYYY-MM-DD}/{paymentId}.jpg` |
| **Fallback** | Local filesystem (`backend/uploads/`) when env vars not set |
| **Max file size** | 5 MB |
| **Accepted types** | Images only (`image/*`) |

## Environment Variables

```env
GDRIVE_KEY_FILE=./konegolf-490707-03831ca082e8.json
GDRIVE_FOLDER_ID=1rSVnb08VhC5msi_PSJJwZSneHyBvs6wd
GDRIVE_IMPERSONATE=general@konegolf.ca
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/payments/:paymentId/receipt` | Upload receipt photo (auto-triggers Ollama analysis) |
| `GET` | `/api/payments/:paymentId/receipt` | Get receipt URL/file |
| `DELETE` | `/api/payments/:paymentId/receipt` | Delete receipt (admin) |
| `GET` | `/api/payments/pending-receipts?date=YYYY-MM-DD` | List card payments missing receipts |
| `GET` | `/api/receipt-analysis?date=YYYY-MM-DD` | List receipt analyses for a date (admin) |
| `GET` | `/api/receipt-analysis/summary?startDate=&endDate=` | Aggregate match/mismatch counts (admin) |
| `POST` | `/api/receipt-analysis/:paymentId/reanalyze` | Re-trigger Ollama analysis (admin) |

## Receipt Analysis (Ollama)

Receipt photos are automatically analyzed via the Raspberry Pi Ollama worker after upload.

| Setting | Value |
|---------|-------|
| **Worker** | Raspberry Pi via Tailscale |
| **Tailnet IP** | `100.83.253.110:11434` |
| **Model** | `gemma4:e2b` |
| **Trigger** | Auto on upload + manual re-analyze |
| **Match Status** | `PENDING` → `MATCHED` / `MISMATCH` / `UNREADABLE` |
| **Tolerance** | ±$0.02 for amount matching |

### Environment Variables (Analysis)

```env
OLLAMA_HOST=http://100.83.253.110:11434
OLLAMA_MODEL=gemma4:e2b
OLLAMA_TIMEOUT=60000
```
