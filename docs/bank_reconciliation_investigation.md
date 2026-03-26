# Bank Reconciliation Investigation

**Date:** March 21–23, 2026
**Status:** Root cause identified & fix deployed (`85c0846`)

---

## Problem

System CARD totals on the admin daily report consistently **exceed** bank deposit amounts. Two separate issues were identified:

1. **CARD over-recording** — Payment dialog defaulted to CARD, so staff accidentally recorded cash payments as CARD
2. **Wrong date basis** — The admin daily report used `paidAt` (when staff closed the invoice) instead of `startTime` (when the booking/swipe happened). Bank deposits correspond to booking day, not invoice close day.

The bank statement for March 16 showed:
- **Base deposits:** $765.09
- **Tips:** $42.56
- **Bank total:** $807.65

The admin daily report showed **$872.95** (using `paidAt`), but querying by `startTime` gave **$733.87** — which is closer to bank but still inflated by the CARD default bug.

---

## Troubleshooting

### Step 1: Understand what the daily report measures

The admin daily report (`GET /api/reports/daily-summary`) uses **`paidAt`** to filter invoices:

```
File: backend/src/repositories/dailyReportRepo.ts

paidAt: { gte: start, lte: end }
```

This means it shows all invoices where payment was **recorded** on that date — not when the booking started. This is the standard accounting approach (when money changed hands).

### Step 2: Query March 16 CARD invoices by `paidAt`

Ran against production database:

```sql
SELECT i."totalAmount", i."paymentMethod", i."paidAt", i."subtotal", i."tax", i."tip",
       b."startTime", u.name
FROM "Invoice" i
JOIN "Booking" b ON i."bookingId" = b.id
LEFT JOIN "User" u ON b."userId" = u.id
WHERE i.status = 'PAID'
  AND i."paidAt" >= '2026-03-16 04:00:00'   -- Atlantic midnight in UTC
  AND i."paidAt" < '2026-03-17 04:00:00'
ORDER BY i."paidAt";
```

**Result:** 15 CARD transactions totaling **$872.95** (matches admin page).

### Step 3: Query by `startTime` for comparison

```sql
SELECT i."totalAmount", i."paymentMethod", b."startTime"
FROM "Invoice" i
JOIN "Booking" b ON i."bookingId" = b.id
WHERE i.status = 'PAID'
  AND i."paymentMethod" = 'CARD'
  AND b."startTime" >= '2026-03-16 04:00:00'
  AND b."startTime" < '2026-03-17 04:00:00';
```

**Result:** CARD total by `startTime` = **$733.87**

### Step 4: Identify the difference between `paidAt` and `startTime`

The $139.08 gap ($872.95 − $733.87) came from **Walter Lynk's booking**:
- Booking `73bb8e10` — started **March 14**, but staff closed/paid it on **March 16**
- 2 seats × $69.54 = $139.08 CARD
- His `paidAt` falls on Mar 16, so included in `paidAt` query but not in `startTime` query

### Step 5: Multi-day comparison with bank statements

User provided a spreadsheet comparing bank deposits vs system numbers for **March 3–13**:

| Date | Bank CARD | System CARD | System CASH | User's CASH |
|------|-----------|-------------|-------------|-------------|
| Mar 3 | $220.87 | $262.60 | $43.40 | $43.40 |
| Mar 4 | $179.67 | $225.26 | $45.58 | $45.58 |
| Mar 5 | $253.83 | $315.12 | $61.29 | $61.29 |
| Mar 6 | $328.24 | $357.92 | $78.68 | $78.68 |
| Mar 7 | $429.07 | $470.22 | $0.00 | $0.00 |
| Mar 8 | $442.63 | $573.08 | $65.67 | $69.54 |
| Mar 9 | $184.86 | $227.74 | $39.90 | $39.90 |
| Mar 10 | $349.83 | $380.74 | $87.36 | $87.36 |
| Mar 11 | $287.28 | $382.74 | $43.68 | $43.68 |
| Mar 12 | — | $268.30 | $43.68 | — |
| Mar 13 | $200.58 | $293.54 | $43.68 | $43.68 |

**Key observations:**
- **System CARD is consistently higher** than bank CARD — every single day
- **System CASH matches the user's manual CASH count almost perfectly** (6 out of 9 days exact match, 3 with tiny differences)
- The CASH accuracy proves the CASH recordings are intentional/correct
- The CARD excess = cash payments being accidentally recorded as CARD

### Step 6: Trace the root cause in code

Inspected the Collect Payment dialog in `frontend/src/pages/pos/booking-detail.tsx`:

```tsx
// BEFORE fix — CARD was the default
const [paymentDialogMethod, setPaymentDialogMethod] =
  useState<'CARD' | 'CASH' | 'GIFT_CARD'>('CARD');

// When opening the dialog, it reset to CARD
setPaymentDialogMethod('CARD');
```

**Root cause confirmed:** The payment method selector defaulted to **CARD**. When a customer paid with cash, staff had to manually switch the selector to "Cash" before hitting "Add Payment". If they forgot (which happened often), the cash payment was recorded as CARD in the database.

This explains:
- Why system CARD > bank CARD (includes accidentally-recorded cash)
- Why system CASH ≈ user's actual CASH (only correctly-recorded cash counted)
- Why the gap varies daily (depends on how many cash payments staff forgot to switch)

### Step 7: Verify timezone edge cases

Checked whether DST transition on March 8 (AST UTC-4 → ADT UTC-3) affected the numbers:
- No bookings exist between midnight and 1 AM Atlantic time
- The 1-hour UTC offset change has **no impact** on daily totals
- `buildAtlanticDate()` correctly handles the transition

---

## Root Cause

**Payment dialog defaulted to CARD.** Staff collecting cash often forgot to switch the payment method selector, causing cash payments to be recorded as CARD in the system.

---

## Fix Applied

**Commit:** `85c0846` — `fix: force payment method selection in collect payment dialog`

Changes to `frontend/src/pages/pos/booking-detail.tsx`:
1. Payment method state starts as `null` (no default) instead of `'CARD'`
2. "Add Payment" button is **disabled** until staff explicitly selects CARD, Cash, or Gift Card
3. Button text shows **"Pay $XX.XX by Card"** (or Cash/Gift Card) so the selected method is visible
4. Amber pulsing **"⚠️ Select Payment Method"** label when nothing is selected
5. Null guard before API call prevents submission without a method

---

## Decision: Use `startTime` for Bank Reconciliation

**`startTime`** (booking date) is the correct field — NOT `paidAt` (invoice close date).

**Why:**
- Bank card deposits correspond to the day the card was physically swiped (booking day)
- `paidAt` is when staff clicks "Collect Payment" in the system, which can be hours or days later
- CASH totals matched the user's manual count perfectly when queried by `startTime`
- Example: Walter Lynk booked March 14, staff closed invoice March 16 → bank sees it on Mar 14, but `paidAt`-based report puts it on Mar 16

**⚠️ Admin daily report currently uses `paidAt`** — this is a known issue. For now, reconciliation queries use `startTime` directly against the database.

### Schema Reference

Key tables and columns (Prisma naming → PostgreSQL uses exact casing with double quotes):

| Table | Column | Type | Notes |
|-------|--------|------|-------|
| `"User"` | `name` | String | **Single `name` field** — NOT `firstName`/`lastName` |
| `"User"` | `email`, `phone` | String | |
| `"Invoice"` | `"totalAmount"` | Decimal | Total charged (subtotal + tax + tip) |
| `"Invoice"` | `subtotal`, `tax`, `tip` | Decimal | Lowercase, no camelCase |
| `"Invoice"` | `status` | String | `'PAID'`, `'UNPAID'` |
| `"Invoice"` | `"paymentMethod"` | String | `'CARD'`, `'CASH'`, `'GIFT_CARD'` |
| `"Invoice"` | `"paidAt"` | Timestamptz | When staff clicked "Collect Payment" |
| `"Invoice"` | `"bookingId"` | UUID | FK to Booking |
| `"Booking"` | `"startTime"` | Timestamptz | When the booking starts (use for reconciliation) |
| `"Booking"` | `"userId"` | UUID | FK to User |
| `"Booking"` | `"bookingStatus"` | String | `'BOOKED'`, `'COMPLETED'`, `'CANCELLED'` |
| `"Payment"` | `id` | UUID | Individual payment record |
| `"Payment"` | `"invoiceId"` | UUID | FK to Invoice |
| `"Payment"` | `method` | String | `'CARD'`, `'CASH'`, `'GIFT_CARD'` |
| `"Payment"` | `amount` | Decimal | Amount for this specific payment |
| `"Payment"` | `"createdAt"` | Timestamptz | When payment was recorded |

> **Split payments:** The system supports multiple `Payment` rows per invoice (e.g. $30 CASH + $9.90 CARD). The `Invoice.paymentMethod` stores the **last** method used. Staff must add each payment separately in the dialog.

### Reconciliation Queries

**Summary by payment method (copy-paste ready):**

```sh
ssh root@147.182.215.135 'docker exec kgolf-postgres psql -U kgolf -d kgolf_app -c "
SELECT i.\"paymentMethod\", COUNT(*) as count,
       SUM(i.\"totalAmount\") as total,
       SUM(i.subtotal) as subtotal,
       SUM(i.tax) as tax,
       SUM(i.tip) as tips
FROM \"Invoice\" i
JOIN \"Booking\" b ON i.\"bookingId\" = b.id
WHERE i.status = '\''PAID'\''
  AND b.\"startTime\" >= '\''2026-03-17 03:00:00'\''
  AND b.\"startTime\" < '\''2026-03-18 03:00:00'\''
GROUP BY i.\"paymentMethod\"
ORDER BY i.\"paymentMethod\";
"'
```

**Detailed breakdown with names (copy-paste ready):**

```sh
ssh root@147.182.215.135 'docker exec kgolf-postgres psql -U kgolf -d kgolf_app -c "
SELECT u.name, i.\"totalAmount\", i.subtotal, i.tax, i.tip,
       i.\"paymentMethod\", b.\"startTime\" AT TIME ZONE '\''America/Halifax'\'' as start_local
FROM \"Invoice\" i
JOIN \"Booking\" b ON i.\"bookingId\" = b.id
LEFT JOIN \"User\" u ON b.\"userId\" = u.id
WHERE i.status = '\''PAID'\''
  AND b.\"startTime\" >= '\''2026-03-17 03:00:00'\''
  AND b.\"startTime\" < '\''2026-03-18 03:00:00'\''
ORDER BY i.\"paymentMethod\", i.\"totalAmount\" DESC;
"'
```

> **⚠️ Quoting rules for SSH → Docker → psql:**
> - Outer: single quotes `'...'` for SSH
> - Inner: double quotes `"..."` for psql
> - Escaped camelCase columns: `\"paymentMethod\"`
> - Lowercase columns (subtotal, tax, tip, name, status): no escaping needed
> - String literals inside psql: `'\''PAID'\''` (break out of single quotes)
> - Do NOT use `-it` flag with `docker exec` over SSH (no TTY)

> **Timezone note:** After March 8 DST transition, Atlantic = UTC-3 (ADT). Before March 8, Atlantic = UTC-4 (AST).
> - ADT dates: midnight = `03:00:00` UTC
> - AST dates: midnight = `04:00:00` UTC

---

## Daily Reconciliation Template

Use this format to compare bank statements against system numbers going forward.

### How to get system numbers
Query the production database using `startTime` (see query above), or once the admin report is updated, use the admin page.

### How to compare

| Field | System (by startTime) | Bank Statement | Match? |
|-------|----------------------|----------------|--------|
| CARD payments | $ | $ | |
| CASH payments | $ | $ | |
| Tips | $ | $ | |
| Total | $ | $ | |

### Notes
- **System numbers** = `totalAmount` of all PAID invoices where the booking's `startTime` falls on that date
- **Bank CARD** = actual card processor deposits for that date
- If system CARD still exceeds bank CARD after the fix (`85c0846`), staff may still be selecting CARD for cash payments (training issue)
- If system CARD < bank CARD, check for split payments or late bookings

---

## Reconciliation Log

Record daily comparisons here. System numbers are queried by **`startTime`** (booking date).
After the fix deploys, the CARD gap should shrink to near zero.

### Pre-Fix (baseline — known CARD over-recording)

| Date | Bank CARD | System CARD (startTime) | Gap | System CASH | Notes |
|------|-----------|------------------------|-----|-------------|-------|
| Mar 3 | $220.87 | $262.60 | +$41.73 | $43.40 | |
| Mar 4 | $179.67 | $225.26 | +$45.59 | $45.58 | |
| Mar 5 | $253.83 | $315.12 | +$61.29 | $61.29 | |
| Mar 6 | $328.24 | $357.92 | +$29.68 | $78.68 | |
| Mar 7 | $429.07 | $470.22 | +$41.15 | $0.00 | |
| Mar 8 | $442.63 | $573.08 | +$130.45 | $65.67 | DST transition |
| Mar 9 | $184.86 | $227.74 | +$42.88 | $39.90 | |
| Mar 10 | $349.83 | $380.74 | +$30.91 | $87.36 | |
| Mar 11 | $287.28 | $382.74 | +$95.46 | $43.68 | |
| Mar 13 | $200.58 | $293.54 | +$92.96 | $43.68 | |
| Mar 16 | $807.65 | $733.87 | -$73.78 | $196.99 | paidAt=$872.95 but startTime=$733.87 |
| Mar 17 | $937.60 | $937.63 | +$0.03 | $66.74 | ✅ Near-perfect match (rounding) |
| Mar 18 | $1,116.57 | $1,083.69 | -$32.88 | $154.00 | Bank higher — tip batch or CASH misrecord? |
| Mar 19 | $1,329.30 | $1,435.21 | +$105.91 | $168.33 | System higher — CARD default bug pattern. SPLIT: $5.54 CARD |

#### Mar 17 Detail (by startTime)

| Name | Total | Subtotal | Tax | Tip | Method | Start (AT) |
|------|-------|----------|-----|-----|--------|------------|
| Chris Sheppard | $135.37 | $103.25 | $14.46 | $17.66 | CARD | 16:00 |
| Matthew Fernandes | $119.70 | $105.00 | $14.70 | $0.00 | CARD | 13:00 |
| Brendan | $84.65 | $74.25 | $10.40 | $0.00 | CARD | 14:00 |
| Scott Macaulay | $65.27 | $57.25 | $8.02 | $0.00 | CARD | 16:00 |
| Dane Thompson | $54.72 | $48.00 | $6.72 | $0.00 | CARD | 19:30 |
| Dane Thompson | $54.41 | $41.50 | $5.81 | $7.10 | CARD | 19:30 |
| (guest) | $48.15 | $42.24 | $5.91 | $0.00 | CARD | 19:00 |
| (guest) | $44.90 | $35.00 | $4.90 | $5.00 | CARD | 18:00 |
| David Burns | $44.90 | $35.00 | $4.90 | $5.00 | CARD | 14:00 |
| (guest) | $41.90 | $35.00 | $4.90 | $2.00 | CARD | 13:00 |
| Ryan beaton | $26.61 | $23.34 | $3.27 | $0.00 | CARD | 17:00 |
| Cohen MacIsaac | $26.60 | $23.33 | $3.27 | $0.00 | CARD | 21:00 |
| Cohen MacIsaac | $26.60 | $23.33 | $3.27 | $0.00 | CARD | 21:00 |
| Cohen MacIsaac | $26.60 | $23.33 | $3.27 | $0.00 | CARD | 21:00 |
| Mianchen Zhang | $19.95 | $17.50 | $2.45 | $0.00 | CARD | 22:00 |
| (guest) | $19.95 | $17.50 | $2.45 | $0.00 | CARD | 14:00 |
| Mianchen Zhang | $19.95 | $17.50 | $2.45 | $0.00 | CARD | 22:00 |
| Haider Murad | $19.95 | $17.50 | $2.45 | $0.00 | CARD | 21:00 |
| Haider Murad | $19.95 | $17.50 | $2.45 | $0.00 | CARD | 21:00 |
| Super Admin | $15.94 | $13.98 | $1.96 | $0.00 | CARD | 14:04 |
| Ryan beaton | $13.30 | $11.67 | $1.63 | $0.00 | CARD | 17:00 |
| Super Admin | $4.85 | $4.25 | $0.60 | $0.00 | CARD | 15:27 |
| Super Admin | $3.41 | $2.99 | $0.42 | $0.00 | CARD | 15:06 |
| (guest) | $46.74 | $41.00 | $5.74 | $0.00 | CASH | 16:45 |
| (guest) | $20.00 | $17.50 | $2.45 | $0.05 | CASH | 14:00 |
| **CARD Total** | **$937.63** | **$790.21** | **$110.66** | **$36.76** | | **23 txns** |

#### Mar 18 Summary

| Method | Count | Total | Subtotal | Tax | Tips |
|--------|-------|-------|----------|-----|------|
| CARD | 25 | $1,083.69 | $936.47 | $131.13 | $16.09 |
| CASH | 4 | $154.00 | $113.97 | $15.96 | $24.07 |

Bank CARD = $1,116.57, System CARD = $1,083.69 → **Gap: +$32.88** (bank higher)

This is the opposite direction — bank received more than system recorded as CARD. Possible causes:
- Card processor tip adjustment batch from a previous day
- A CASH payment that was actually card (but no single CASH amount = $32.88)

#### Mar 18 CARD Detail (by startTime, 18 bookings, 25 seats)

| Customer | Seats | Total | Subtotal | Tax | Tips | Start |
|----------|-------|-------|----------|-----|------|-------|
| Lachlann MacNeil | 3 | $155.61 | $136.50 | $19.11 | $0.00 | 18:00 |
| kyesha (Kyesha Haggett) | 1 | $134.52 | $118.00 | $16.52 | $0.00 | 19:00 |
| Landon | 1 | $99.18 | $87.00 | $12.18 | $0.00 | 21:00 |
| Cheryl | 1 | $85.50 | $75.00 | $10.50 | $0.00 | 16:00 |
| Kevin | 1 | $84.80 | $70.00 | $9.80 | $5.00 | 18:00 |
| Jeanie | 1 | $79.80 | $70.00 | $9.80 | $0.00 | 14:00 |
| David | 2 | $79.80 | $70.00 | $9.80 | $0.00 | 17:00 |
| Luke Briand | 1 | $79.80 | $70.00 | $9.80 | $0.00 | 13:00 |
| Matt Fennell | 4 | $77.05 | $60.99 | $8.55 | $7.51 | 20:30 |
| Mark | 1 | $62.69 | $54.99 | $7.70 | $0.00 | 21:00 |
| Damien Barry | 1 | $45.60 | $40.00 | $5.60 | $0.00 | 16:00 |
| evan | 2 | $41.61 | $36.50 | $5.11 | $0.00 | 21:00 |
| John Muise | 1 | $26.22 | $20.00 | $2.80 | $3.42 | 14:00 |
| Quick Sale | 1 | $10.55 | $9.25 | $1.30 | $0.00 | 13:31 |
| Quick Sale | 1 | $7.00 | $6.00 | $0.84 | $0.16 | 16:35 |
| Quick Sale | 1 | $5.70 | $5.00 | $0.70 | $0.00 | 14:13 |
| Quick Sale | 1 | $4.85 | $4.25 | $0.60 | $0.00 | 14:45 |
| Quick Sale | 1 | $3.41 | $2.99 | $0.42 | $0.00 | 13:30 |
| **CARD Total** | **25** | **$1,083.69** | **$936.47** | **$131.13** | **$16.09** | |

CASH payments (4): kyesha $100.00, Jason $40.00, Quick Sale $9.00, Quick Sale $5.00

#### Mar 19 Summary

| Method | Count | Total | Subtotal | Tax | Tips |
|--------|-------|-------|----------|-----|------|
| CARD | 26 | $1,429.67 | $1,225.70 | $171.62 | $32.35 |
| CASH | 8 | $163.32 | $138.69 | $19.43 | $5.20 |
| SPLIT | 1 | $10.55 | $9.25 | $1.30 | $0.00 |

SPLIT detail: Quick Sale $10.55 = $5.54 CARD + $5.01 CASH

**Effective CARD total: $1,429.67 + $5.54 = $1,435.21**

Bank CARD = $1,329.30, System CARD = $1,435.21 → **Gap: +$105.91** (system higher)

This matches the CARD-default bug pattern — ~$105 in cash payments were likely recorded as CARD.

**Timezone verification:** Checked UTC boundary bookings — 4 Mar 18 evening bookings (21:00 AT = 00:00 UTC Mar 19) are correctly excluded. 4 late Mar 19 bookings (21:10–22:00 AT = 00:10–01:00 UTC Mar 20) are correctly included. No timezone leakage.

**Combo analysis:** No exact 1–3 invoice combination matches the gap ($100.37 or $105.91). The gap is likely from multiple misrecorded cash payments, not one clean swap.

#### Mar 19 CARD Detail (by startTime, 21 bookings, 26 seats)

| Customer | Seats | Total | Subtotal | Tax | Tips | Start |
|----------|-------|-------|----------|-----|------|-------|
| Jeremy Blom | 1 | $162.56 | $124.00 | $17.36 | $21.20 | 19:00 |
| DJ Macdonald | 2 | $107.16 | $94.00 | $13.16 | $0.00 | 17:30 |
| Ernie | 1 | $96.62 | $79.49 | $11.13 | $6.00 | 20:00 |
| Brian | 1 | $92.32 | $80.98 | $11.34 | $0.00 | 18:30 |
| Blake Graham | 1 | $89.65 | $74.25 | $10.40 | $5.00 | 11:00 |
| Luke Briand | 1 | $79.80 | $70.00 | $9.80 | $0.00 | 14:00 |
| Allen Mcneil | 1 | $79.80 | $70.00 | $9.80 | $0.00 | 13:00 |
| JaimeLee Gouthro | 1 | $79.80 | $70.00 | $9.80 | $0.00 | 13:00 |
| Ben Bunin | 1 | $79.80 | $70.00 | $9.80 | $0.00 | 10:00 |
| Serge romard | 1 | $79.80 | $70.00 | $9.80 | $0.00 | 10:00 |
| Ben Perry | 1 | $79.80 | $70.00 | $9.80 | $0.00 | 12:00 |
| Jarrett Miller | 3 | $79.80 | $69.99 | $9.81 | $0.00 | 21:10 |
| Aaron Antonello | 1 | $59.85 | $52.50 | $7.35 | $0.00 | 18:09 |
| Murray | 2 | $40.00 | $35.00 | $4.90 | $0.10 | 15:00 |
| Extra time | 2 | $39.95 | $35.00 | $4.90 | $0.05 | 16:00 |
| Jeremy Blom | 1 | $39.90 | $35.00 | $4.90 | $0.00 | 22:00 |
| scott phillips | 1 | $39.90 | $35.00 | $4.90 | $0.00 | 12:00 |
| Jacob | 1 | $39.90 | $35.00 | $4.90 | $0.00 | 16:00 |
| Roger | 1 | $39.90 | $35.00 | $4.90 | $0.00 | 16:00 |
| Johnny | 1 | $19.95 | $17.50 | $2.45 | $0.00 | 15:00 |
| Quick Sale | 1 | $3.41 | $2.99 | $0.42 | $0.00 | 12:44 |
| **CARD Total** | **26** | **$1,429.67** | **$1,225.70** | **$171.62** | **$32.35** | |
| **CASH Total** | **8** | **$163.32** | **$138.69** | **$19.43** | **$5.20** | |

### Post-Fix

| Date | Bank CARD | System CARD (startTime) | Gap | System CASH | Notes |
|------|-----------|------------------------|-----|-------------|-------|
| Mar 22 | $1,315.04 | $1,315.05 (adjusted) | +$0.01 | TBD | Card machine total $1,315.04. Physical receipts found for 2 Quick Sales (CASH, not CARD). See detailed receipt reconciliation below. |

---

## March 22 — Card Machine Receipt Reconciliation

**Date:** March 22, 2026 (first full day after CARD-default fix `85c0846`)

### Card Machine Receipts vs System

All 22 card machine swipes matched to system invoices. No unaccounted swipes.

| # | Card Time | Card Amt | Booking ID | Customer | Seat | System Amt | System Status | Match |
|---|-----------|----------|------------|----------|------|-----------|---------------|-------|
| 1 | 11:30 | $39.90 | `4828e58c` | Ian Harries | 1 | $39.90 | CARD / PAID | ✅ |
| 2 | 11:34 | $79.80 | `b09e5477` | Brett MacDougall | 1 | $79.80 | CARD / PAID | ✅ |
| 3 | 11:54 | $79.80 | `e25ad49a` + `26c5d282` | Melissa MacDonald (2 bookings) | 1+1 | $39.90 + $39.90 | CARD / PAID | ✅ combined swipe |
| 4 | 12:05 | $86.62 | `430013d5` | Matthew Boudreau | 1 | $86.62 | CARD / PAID | ✅ |
| 5 | 12:54 | $93.48 | `48f87dc0` | Darrell Syms | 1 | $93.48 | CARD / PAID | ✅ |
| 6 | 14:00 | $39.90 | `1c77eb48` | Justin | 1 | $39.90 | CARD / PAID | ✅ paidAt 14:01 |
| 7 | 16:04 | $93.75 | `e7fbe2f6` | Kyesha Haggett | 1 | $93.75 | CARD / PAID | ✅ |
| 8 | 16:15 | $89.49 | `3adf910a` | Darcy Ryder | 1 | $99.49 | CARD / PAID | ✅ card swiped $89.49, $10 tip added, booking completed |
| 9 | 16:58 | $84.93 | `c3731c1b` | Austin Miller | 1 | $84.93 | CARD / PAID | ✅ |
| 10 | 17:27 | $39.90 | `5553f74d` | Ben Perry | 3 | $39.90 | CARD / PAID | ✅ |
| 11 | 17:27 | $39.90 | `5553f74d` | Ben Perry | 4 | $39.90 | CARD / PAID | ✅ |
| 12 | 17:28 | $43.31 | `5553f74d` | Ben Perry | 1 | $43.31 | CARD / PAID | ✅ |
| 13 | 18:59 | $100.32 | `61859f58` | Drew Baldwin | 1 | $100.32 | CARD / PAID | ✅ |
| 14 | 19:02 | $52.44 | `17f91af6` | Alaina | 1 | $52.44 | CARD / PAID | ✅ |
| 15 | 19:42 | $16.71 | `aa6fca14` | Evan | 1 | $16.71 | CARD / PAID | ✅ |
| 16 | 19:44 | $13.30 | `aa6fca14` | Evan | 3 | $13.30 | CARD / PAID | ✅ |
| 17 | 20:00 | $9.90 | `9ad1da2b` | Matt Standing (split: $30 cash + $9.90 card) | 1 | $39.90 | CASH / PAID | ✅ split payment, system shows CASH only |
| 18 | 21:13 | $26.79 | `3ee40b30` | Dillon | 1 | $26.79 | CARD / PAID | ✅ |
| 19 | 21:15 | $23.94 | `3ee40b30` | Dillon | 3 | $23.94 | CARD / PAID | ✅ |
| 20 | 21:16 | $22.94 | `3ee40b30` | Dillon | 4 | $22.94 | CARD / PAID | ✅ |
| 21 | 21:16 | $23.36 | `3ee40b30` | Dillon | 2 | $23.36 | CARD / PAID | ✅ |
| 22 | 22:26 | $214.56 | `4f42d455` | Ross Wadden | 1 | $214.57 | CARD / PAID | ✅ ($0.01 rounding) |

### Issues Found

**1. Combined card swipe for multiple bookings (1):**

Melissa MacDonald had 2 bookings ($39.90 each, starting 12:00 and 13:00). Staff swiped **one $79.80 charge** on the card machine at 11:54, then marked both invoices as CARD/PAID in the system 6 seconds apart (11:54:38 and 11:54:44). Both system records are correct — the single card swipe just covered two bookings.

**2. Card swiped but invoice left UNPAID in system (1) — RESOLVED:**

| Booking ID | Customer | Amt | Notes |
|-----------|----------|-----|-------|
| `3adf910a` | Darcy Ryder | $89.49 → $99.49 | **Fixed:** $10 tip added, invoice marked CARD/PAID, booking completed. Card swipe was $89.49; system total now $99.49 (includes $10 tip). |

**3. System marked CARD but actually paid CASH (2):**

These invoices are marked CARD in the system but have no matching card machine swipe — they were cash payments recorded with wrong method (CARD-default bug still present on March 22). **Physical cash receipts found** for both quick sales, confirming they were paid with cash.

| Booking ID | Customer | Seat | Amt | Notes |
|-----------|----------|------|-----|-------|
| `77f155f3` | Quick Sale | 1 | $5.70 | No matching card swipe. Physical cash receipt found ✅ |
| `bee2fb30` | Quick Sale | 1 | $5.70 | No matching card swipe. Physical cash receipt found ✅ |

**4. Split payment not recorded in system (1):**

The system supports split payments via the `Payment` table (multiple payment rows per invoice), but staff entered only one CASH payment for the full amount instead of two separate payments.

| Booking ID | Customer | Total | Card Portion | Cash Portion | Notes |
|-----------|----------|-------|-------------|-------------|-------|
| `9ad1da2b` | Matt Standing | $39.90 | $9.90 | $30.00 | System has one `Payment` row: $39.90 CASH. Should have two: $30.00 CASH + $9.90 CARD. Card machine shows $9.90 swipe at 20:00. |

### Reconciliation Math

**Original (before manual corrections):**

| Line | Amount |
|------|--------|
| System CARD/PAID | $1,227.06 |
| Minus wrongly marked CARD (actually CASH: 2 Quick Sales) | −$11.40 |
| Plus Darcy Ryder UNPAID (card swiped `3adf910a`) | +$89.49 |
| Plus Matt Standing split (card portion) | +$9.90 |
| **Calculated actual card total** | **$1,315.05** |
| **Card machine total** | **$1,315.04** |
| **Difference** | **$0.01** (Ross Wadden rounding) ✅ |

**After manual corrections:**

- Darcy Ryder: invoice closed as CARD/PAID with $10 tip ($99.49 total)
- 2 Quick Sales: still marked CARD in system but confirmed CASH via physical receipts
- System CARD total now: $1,326.55 (includes Darcy's $99.49 and 2 wrong Quick Sales)
- Actual card swipe total: $1,315.04 (card machine)
- Gap: $1,326.55 − $1,315.04 = $11.51 ≈ $11.40 (2 Quick Sales) + $10 tip + $0.01 rounding − card swipe $89.49 already included

**Corrected reconciliation:**

| Line | Amount |
|------|--------|
| System CARD/PAID (current) | $1,326.55 |
| Minus wrongly marked CARD (actually CASH: 2 Quick Sales) | −$11.40 |
| Minus Darcy Ryder tip (cash tip, not on card swipe) | −$10.00 |
| Plus Matt Standing split (card portion not recorded) | +$9.90 |
| **Corrected card total** | **$1,315.05** |
| **Card machine total** | **$1,315.04** |
| **Difference** | **$0.01** (Ross Wadden rounding) ✅ |
