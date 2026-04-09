# Coupon System Plan

## Overview
Daily cron checks birthdays and loyalty milestones, generates a unique coupon code, emails it with an embedded QR code linking to a **public coupon status page**. POS staff apply it via manual code entry or QR camera scan in booking detail — redeems as a **$35 flat discount** order. Coupons never expire by default but the `expiresAt` field is built in for future use.

## User Flow

```
Customer receives email
        │
        ▼
┌──────────────────────────┐
│  📧 Email                │
│  "Happy Birthday! You've │
│   earned 1 hour free!"   │
│                          │
│  [QR CODE IMAGE]         │
│  Code: KGOLF-A3X9        │
│                          │
│  QR links to:            │
│  konegolf.ca/coupon/     │
│  KGOLF-A3X9              │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  🌐 Public Coupon Page   │
│  (No auth required)      │
│                          │
│  Code: KGOLF-A3X9        │
│  Type: 🎂 Birthday       │
│  Status: ✅ ACTIVE       │
│  Value: 1 Hour Free      │
│  Issued: Feb 20, 2026    │
│                          │
│  "Show this to staff     │
│   to redeem"             │
└──────────┬───────────────┘
           │
           ▼
   Staff redeems in POS
   (two options)
           │
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐ ┌──────────┐
│ Option A│ │ Option B │
│ Manual  │ │ QR Scan  │
│ Entry   │ │ (Camera) │
│ on POS  │ │ on Phone │
│ tablet  │ │ or tablet│
└────┬────┘ └────┬─────┘
     └─────┬─────┘
           ▼
  Validates → Shows coupon info
  → Apply to seat → $35 discount
```

### Multi-Device Staff Access
Staff can be logged in on **multiple devices simultaneously** (each login creates an independent DB session). Typical setup:
- **POS tablet** — main workflow, manual code entry
- **Staff phone** — camera scan QR from customer's phone/email

## Steps

### Step 1: Create `CouponType` + `Coupon` Models
**File:** `backend/prisma/schema.prisma`

#### `CouponType` Table (admin-managed)
- `id` — UUID primary key
- `name` — unique String (e.g. `"BIRTHDAY"`, `"LOYALTY"`, `"VIP"`, `"APOLOGY"`)
- `label` — display name (e.g. "Birthday", "Loyalty Reward", "VIP Perk")
- `defaultDescription` — default coupon message (e.g. "1 Hour Free — Happy Birthday!")
- `defaultAmount` — Decimal, default discount amount (e.g. `35.00`)
- `active` — Boolean, default `true` (soft-delete/disable types)
- `createdAt` — DateTime

Relations: `CouponType.coupons[]`

**Seed with initial types:**
| name | label | defaultDescription | defaultAmount |
|---|---|---|---|
| BIRTHDAY | Birthday | 1 Hour Free — Happy Birthday! | 35.00 |
| LOYALTY | Loyalty Reward | 1 Hour Free — Thank You! | 35.00 |
| CUSTOM | Custom | Complimentary 1 Hour | 35.00 |

#### `Coupon` Table
- `id` — UUID primary key
- `code` — unique, short alphanumeric (e.g. `KGOLF-A3X9`)
- `userId` — FK → User
- `couponTypeId` — FK → CouponType
- `description` — String (copied from type's default, editable per coupon)
- `discountAmount` — Decimal (copied from type's default, editable per coupon)
- `status` — enum: `ACTIVE`, `REDEEMED`, `EXPIRED`
- `expiresAt` — DateTime?, **null = never expires**
- `redeemedAt` — DateTime?
- `redeemedBookingId` — FK → Booking?
- `redeemedSeatNumber` — Int?
- `milestone` — Int?, e.g. `10` — tracks which milestone triggered it, enables scalable tiers
- `createdAt` — DateTime

Relations: `User.coupons[]`, `Booking.redeemedCoupons[]`, `CouponType.coupons[]`

### Step 2: Cron Infrastructure + Daily Job
**File:** `backend/src/jobs/couponScheduler.ts`

- Install `node-cron`
- Runs daily at 8 AM Atlantic
- **Birthday check:** query users whose `dateOfBirth` month/day = today AND no existing `BIRTHDAY` coupon for this year
- **Loyalty check:** query users with ≥ 10 completed bookings (`bookingStatus = 'COMPLETED'`) AND no existing `LOYALTY` coupon with `milestone = 10`
- For each match: generate unique code, insert `Coupon` row, call `sendCouponEmail()`
- Milestone field stored so future tiers (20, 30…) just need a config array

### Step 3: Email + QR Code Generation
**File:** `backend/src/services/email.ts`

- Install `qrcode` (npm)
- New function `sendCouponEmail()` following existing email pattern (HTML + plain text)
- QR code content = **URL**: `https://konegolf.ca/coupon/KGOLF-A3X9` (not just the code string)
- Generate QR as base64 PNG, embed inline via `cid:` attachment in HTML email
- Email body: greeting, reason ("Happy Birthday!" / "Thank you for 10 visits!"), "You've earned 1 hour free!", QR code image, text code fallback, expiry info if set

### Step 4: Public Coupon Status Page
**Files:** `backend/src/routes/coupons.ts` + `frontend/src/pages/coupon.tsx`

**Public API endpoint** (no auth):
- `GET /api/coupons/public/:code` — Returns safe fields only: code, type, status, discount description, issued date. **No user PII** (no name, email, phone).

**Public frontend route** (no auth):
- `/coupon/:code` — Simple branded page showing coupon status (ACTIVE ✅ / REDEEMED ❌ / EXPIRED ⚠️)
- Minimal UI: K-Golf logo, code, type badge, status, value, issued date
- If ACTIVE: "Show this to staff to redeem"
- If REDEEMED: "This coupon has been used" + redeemed date
- Customer can check anytime by scanning their email QR or visiting the URL

### Step 5: Coupon API Routes (Authenticated)
**File:** `backend/src/routes/coupons.ts`

- `GET /api/coupons/validate/:code` — Returns full coupon details (type, description, amount, status, user name) + `isValid` boolean. **Requires auth** (staff/admin).
- `POST /api/coupons/:code/redeem` — Body: `{ bookingId, seatNumber }`. Marks coupon REDEEMED, sets `redeemedAt`, links to booking/seat, creates discount Order (negative $35, `discountType: 'FLAT'`, name from coupon description). All in one transaction. **Requires auth**.
- `POST /api/coupons` — **Admin manual creation.** Body: `{ userId, couponTypeId, description?, discountAmount?, expiresAt? }`. Generates unique code, creates `Coupon` row, sends coupon email with QR. **Requires admin**.
- `GET /api/coupons` — Admin list with filters (status, type, user search). Optional for v1. **Requires auth**.
- `GET /api/coupon-types` — List all active coupon types (for dropdown). **Requires staff/admin**.
- `POST /api/coupon-types` — Create new type. **Requires admin**.
- `PATCH /api/coupon-types/:id` — Edit type (name, label, defaults, active flag). **Requires admin**.

### Step 5b: Admin Manual Coupon Creation UI
**File:** `frontend/src/pages/admin/customers.tsx` (customer detail modal)

- Add "Send Coupon" button in customer detail modal footer (next to Edit Customer)
- Opens dialog with:
  - **Type** — dropdown populated from `CouponType` table (fetched via `GET /api/coupon-types`)
  - **Description** — auto-filled from selected type's `defaultDescription`, editable
  - **Amount** — auto-filled from selected type's `defaultAmount`, editable
  - **Expiry** — optional date picker (null = never expires)
- On submit: calls `POST /api/coupons` → generates code → sends email to customer
- Use cases: apology coupons, VIP perks, manual birthday catch-up, promos

### Step 5c: Admin Coupon Type Management (Optional)
**File:** `frontend/src/pages/admin/customers.tsx` or separate settings area

- Admin can add/edit/disable coupon types from UI
- API: `GET /api/coupon-types`, `POST /api/coupon-types`, `PATCH /api/coupon-types/:id`
- Each type defines: name, label, default description, default amount, active flag
- New types instantly available in coupon creation dropdown — no code deploy needed

### Step 6: POS "Apply Coupon" UI
**File:** `frontend/src/pages/pos/booking-detail.tsx`

- Install `@yudiel/react-qr-scanner`
- Add 🎟️ button next to existing discount button
- Opens dialog with **two tabs**:
  - **Manual** — text input + "Validate" button (for POS tablet)
  - **Scan** — `<Scanner />` component using rear camera (for phone/tablet)
- QR scanner parses the URL (`https://konegolf.ca/coupon/KGOLF-A3X9`) to extract the code
- On scan/validate: call `/api/coupons/validate/:code`, display coupon info (type, amount, recipient name)
- On "Apply": call `/api/coupons/:code/redeem` with current booking + selected seat → backend creates discount order → reload seat data
- Scanner uses `paused` prop tied to dialog open state (camera only runs when visible)
- Falls back gracefully if camera denied — manual tab always available

### Step 7: Migration, Wiring & Deploy
- Run `prisma migrate`
- Register coupons router in `backend/src/index.ts`
- Add public `/coupon/:code` route in frontend router
- Start cron on server boot
- Install npm packages: `node-cron`, `qrcode`, `@yudiel/react-qr-scanner`
- Update Docker build

## Design Decisions
| Decision | Choice | Notes |
|---|---|---|
| Coupon value | Fixed $35 (base), tax-inclusive at redemption | Email says "1 Hour Free (Tax Included)". At redeem: `$35 × (1 + taxRate)` = $39.90 at 14% HST. Discount order marked `taxExempt: true` |
| Expiry | null (never expires) | `expiresAt` field ready for future use |
| Coupon type | Separate `CouponType` table | Admin adds new types from UI — no code changes, no migration |
| Manual creation | Admin can create & send | From customer detail modal, type dropdown + editable description/amount |
| Loyalty tiers | Single (10 bookings) | `milestone` field enables future tiers (20, 30…) |
| QR content | URL (`konegolf.ca/coupon/:code`) | Opens public status page; POS scanner extracts code from URL |
| QR scanning | Both manual + camera | `@yudiel/react-qr-scanner` (385KB, React-native API, actively maintained) |
| Discount mechanism | Negative-price Order row | Same pattern as existing ad-hoc discounts |
| Multi-device auth | Supported | DB-backed sessions, login doesn't invalidate others, 24h TTL |
| Public coupon page | No auth required | Shows only safe fields (no user PII) |
| COUPON payment method | $0 Payment record | When coupon covers full amount, invoice auto-marked PAID with `paymentMethod: 'COUPON'` |
| Auto-PAID | After coupon redeem | If invoice total ≤ $0 after redeem → auto-create $0 COUPON payment, mark PAID, update booking paymentStatus |
| Coupon removal revert | UNPAID on coupon delete | If discount order deleted and invoice was PAID by COUPON → revert to UNPAID |

## Payment Method: COUPON

When a birthday/loyalty coupon fully covers the invoice (total ≤ $0):

1. **Backend auto-marks PAID** — after `recalculateInvoice()`, creates $0 COUPON payment record and sets `invoice.status = 'PAID'`, `invoice.paymentMethod = 'COUPON'`
2. **Booking paymentStatus** — updated to PAID if all invoices are paid
3. **Frontend** — shows 🎟️ Coupon button in payment method selector (only when total ≤ $0)
4. **Revert** — deleting the coupon discount order reverts invoice to UNPAID and deletes $0 COUPON payment

When a coupon only partially covers the invoice (total > $0), customer pays remaining via CARD/CASH/GIFT_CARD normally.

## Open Questions
- **Admin coupon list/management page** — Dedicated tab to view all issued coupons, filter by status/type, revoke active coupons. Can be added later as a tab on Customers page.
- **Guest booking counting** — Loyalty coupons tied to `userId`. Consider also counting by `customerPhone` to capture walk-in regulars who never registered.
