# Database Schema Explanation

**Created:** October 12, 2025  
**Last Updated:** April 9, 2026  
**Purpose:** Explain existing database relationships and provide quick column reference

> **⚠️ MAINTENANCE RULE:** If any code change touches `backend/prisma/schema.prisma` (adding/removing/renaming columns, adding models, changing types), **you MUST update this file** to keep the Quick Column Reference and model documentation in sync. Also update `docs/bank_reconciliation_investigation.md` if Invoice, Booking, User, or Payment tables are affected.

---

## 🔑 Quick Column Reference (for queries)

PostgreSQL uses **exact casing** with double quotes for camelCase columns. Lowercase columns don't need quotes.

### User
| Column | PG Quoting | Type | Notes |
|--------|-----------|------|-------|
| id | `id` | UUID | PK |
| email | `email` | String? | Nullable, unique |
| **name** | `name` | String | **Single field — NOT firstName/lastName** |
| phone | `phone` | String | Unique, required |
| dateOfBirth | `"dateOfBirth"` | Date? | |
| role | `role` | Enum | CUSTOMER, SALES, ADMIN, STAFF |
| registrationSource | `"registrationSource"` | String | ONLINE, WALK_IN, PHONE |
| registeredBy | `"registeredBy"` | UUID? | FK → User |
| passwordHash | `"passwordHash"` | String? | |
| createdAt | `"createdAt"` | Timestamptz | |
| updatedAt | `"updatedAt"` | Timestamptz | |

### Booking
| Column | PG Quoting | Type | Notes |
|--------|-----------|------|-------|
| id | `id` | UUID | PK |
| roomId | `"roomId"` | UUID | FK → Room |
| userId | `"userId"` | UUID? | FK → User (nullable for guests) |
| customerName | `"customerName"` | String | Denormalized snapshot |
| customerPhone | `"customerPhone"` | String | Denormalized snapshot |
| customerEmail | `"customerEmail"` | String? | |
| **startTime** | `"startTime"` | Timestamptz | **Use for bank reconciliation** |
| endTime | `"endTime"` | Timestamptz | |
| players | `players` | Int | |
| price | `price` | Decimal(10,2) | Total booking price |
| bookingStatus | `"bookingStatus"` | String | BOOKED, COMPLETED, CANCELLED, EXPIRED |
| paymentStatus | `"paymentStatus"` | String | UNPAID, PAID |
| paidAt | `"paidAt"` | Timestamptz? | When staff closed payment |
| completedAt | `"completedAt"` | Timestamptz? | |
| tipAmount | `"tipAmount"` | Decimal? | |
| bookingSource | `"bookingSource"` | String | ONLINE, WALK_IN, PHONE |
| createdBy | `"createdBy"` | UUID? | FK → User (admin) |
| internalNotes | `"internalNotes"` | Text? | |
| createdAt | `"createdAt"` | Timestamptz | |

### Invoice
| Column | PG Quoting | Type | Notes |
|--------|-----------|------|-------|
| id | `id` | UUID | PK |
| bookingId | `"bookingId"` | UUID | FK → Booking |
| seatIndex | `"seatIndex"` | Int | 1–4 |
| **subtotal** | `subtotal` | Decimal(10,2) | **Lowercase — no quotes needed** |
| **tax** | `tax` | Decimal(10,2) | **Lowercase — no quotes needed** |
| **tip** | `tip` | Decimal?(10,2) | **Lowercase — no quotes needed** |
| totalAmount | `"totalAmount"` | Decimal(10,2) | subtotal + tax + tip |
| status | `status` | String | UNPAID, PAID |
| paymentMethod | `"paymentMethod"` | String? | CARD, CASH, GIFT_CARD, SPLIT |
| paidAt | `"paidAt"` | Timestamptz? | When payment was collected |
| createdAt | `"createdAt"` | Timestamptz | |

### Payment (split payments)
| Column | PG Quoting | Type | Notes |
|--------|-----------|------|-------|
| id | `id` | UUID | PK |
| invoiceId | `"invoiceId"` | UUID | FK → Invoice |
| method | `method` | String | CARD, CASH, GIFT_CARD, COUPON |
| amount | `amount` | Decimal(10,2) | $0 allowed for COUPON method |
| receiptPath | `"receiptPath"` | String? | Google Drive path (e.g. `receipts/2026-04-07/{bookingId}/{paymentId}.jpg`) |
| createdAt | `"createdAt"` | Timestamptz | |

### Order
| Column | PG Quoting | Type | Notes |
|--------|-----------|------|-------|
| id | `id` | UUID | PK |
| bookingId | `"bookingId"` | UUID | FK → Booking |
| menuItemId | `"menuItemId"` | UUID? | FK → MenuItem (null for custom) |
| customItemName | `"customItemName"` | String? | |
| customItemPrice | `"customItemPrice"` | Decimal? | |
| discountType | `"discountType"` | String? | FLAT or PERCENT |
| taxExempt | `"taxExempt"` | Boolean | Default false. True for gift cards and tax-inclusive coupon discounts |
| seatIndex | `"seatIndex"` | Int? | 1–4 or null (shared) |
| quantity | `quantity` | Int | |
| unitPrice | `"unitPrice"` | Decimal(10,2) | |
| totalPrice | `"totalPrice"` | Decimal(10,2) | |
| createdAt | `"createdAt"` | Timestamptz | |

### Room
| Column | PG Quoting | Type | Notes |
|--------|-----------|------|-------|
| id | `id` | UUID | PK |
| name | `name` | String | Unique |
| bayNumber | `"bayNumber"` | Int? | Unique |
| capacity | `capacity` | Int | Default 4 |
| active | `active` | Boolean | Legacy; prefer status |
| status | `status` | Enum | ACTIVE, MAINTENANCE, CLOSED |

### Coupon
| Column | PG Quoting | Type | Notes |
|--------|-----------|------|-------|
| id | `id` | UUID | PK |
| code | `code` | String | Unique (e.g. KGOLF-A3X9) |
| userId | `"userId"` | UUID | FK → User |
| couponTypeId | `"couponTypeId"` | UUID | FK → CouponType |
| description | `description` | String | |
| discountAmount | `"discountAmount"` | Decimal(10,2) | |
| status | `status` | Enum | ACTIVE, REDEEMED, EXPIRED |
| expiresAt | `"expiresAt"` | Timestamptz? | null = never expires |
| redeemedAt | `"redeemedAt"` | Timestamptz? | |
| redeemedBookingId | `"redeemedBookingId"` | UUID? | FK → Booking |
| redeemedSeatNumber | `"redeemedSeatNumber"` | Int? | |
| milestone | `milestone` | Int? | e.g. 10 = loyalty milestone |

### MenuItem
| Column | PG Quoting | Type | Notes |
|--------|-----------|------|-------|
| id | `id` | UUID | PK |
| name | `name` | String | |
| description | `description` | Text? | |
| price | `price` | Decimal(10,2) | |
| category | `category` | Enum | HOURS, FOOD, DRINKS, APPETIZERS, DESSERTS |
| hours | `hours` | Int? | Only for HOURS category |
| available | `available` | Boolean | |
| sortOrder | `"sortOrder"` | Int | |

### ScoreCapture
| Column | PG Quoting | Type | Notes |
|--------|-----------|------|-------|
| id | `id` | UUID | PK |
| bayNumber | `"bayNumber"` | Int | |
| roomId | `"roomId"` | UUID? | FK → Room |
| bookingId | `"bookingId"` | UUID? | FK → Booking |
| status | `status` | String | ACTIVE, NEEDS_REVIEW, DELETED |
| courseName | `"courseName"` | String? | |
| screenshotPath | `"screenshotPath"` | String? | |
| capturedAt | `"capturedAt"` | Timestamptz | |

### ScoreCapturePlayer
| Column | PG Quoting | Type | Notes |
|--------|-----------|------|-------|
| id | `id` | UUID | PK |
| captureId | `"captureId"` | UUID | FK → ScoreCapture |
| seatIndex | `"seatIndex"` | Int? | |
| ocrName | `"ocrName"` | String | |
| ocrTotalScore | `"ocrTotalScore"` | Int | |
| ocrOverPar | `"ocrOverPar"` | Int? | |

### Employee
| Column | PG Quoting | Type | Notes |
|--------|-----------|------|-------|
| id | `id` | UUID | PK |
| name | `name` | String | Display name |
| pin | `pin` | String? | Plaintext PIN (4-6 digits) for lookup |
| pinHash | `"pinHash"` | String? | scrypt hash for verification |
| role | `role` | String | `STAFF` (default) or `MANAGER` |
| active | `active` | Boolean | Default true; deactivated employees can't clock in or unlock manager panel |
| autoClockOut | `"autoClockOut"` | Boolean | Default false; set true by stale shift cleanup cron |
| createdAt | `"createdAt"` | Timestamptz | |
| updatedAt | `"updatedAt"` | Timestamptz | |

### TimeEntry
| Column | PG Quoting | Type | Notes |
|--------|-----------|------|-------|
| id | `id` | UUID | PK |
| employeeId | `"employeeId"` | UUID | FK → Employee |
| clockIn | `"clockIn"` | Timestamptz | |
| clockOut | `"clockOut"` | Timestamptz? | Null while shift is open |
| autoClockOut | `"autoClockOut"` | Boolean | Default false; true if closed by stale shift cron |
| createdAt | `"createdAt"` | Timestamptz | |
| updatedAt | `"updatedAt"` | Timestamptz | |

---

## 📊 Current Schema - Existing Relations

### **User Model Relations** (Already in database)

```prisma
model User {
  id                     String                  @id @default(uuid())
  email                  String                  @unique
  name                   String
  phone                  String
  
  // Relations (these are NOT columns, they're relationships)
  bookings               Booking[]                // ✅ One user has many bookings
  authProviders          AuthProvider[]           // ✅ One user can have multiple auth methods (Google, Facebook, etc.)
  sessions               Session[]                // ✅ One user can have multiple active sessions
  emailVerificationToken EmailVerificationToken?  // ✅ One user has one verification token
  settingsUpdates        Setting[]                // ✅ Track which settings this user updated
}
```

### **What These Relations Mean:**

#### 1️⃣ **`bookings Booking[]`**
- **Purpose:** Link user to their bookings
- **Type:** One-to-Many (one user has many bookings)
- **NOT a column:** This is a Prisma relation field
- **Actual foreign key:** Lives in `Booking` table as `userId`

**Example:**
```typescript
// Get user with all their bookings
const user = await prisma.user.findUnique({
  where: { id: 'user-123' },
  include: { bookings: true }  // ← This uses the 'bookings' relation
});

// Returns:
{
  id: 'user-123',
  name: 'John Doe',
  bookings: [
    { id: 'booking-1', startTime: '...', roomId: '...' },
    { id: 'booking-2', startTime: '...', roomId: '...' }
  ]
}
```

---

#### 2️⃣ **`authProviders AuthProvider[]`**
- **Purpose:** Support multiple login methods (Google, Facebook, Email/Password)
- **Type:** One-to-Many
- **Use Case:** User can log in via Google OR Email/Password

**Example:**
```typescript
// User created via email/password
const user = await prisma.user.create({
  data: {
    email: 'john@example.com',
    name: 'John Doe',
    passwordHash: '...',
    authProviders: {
      create: {
        provider: 'password',
        providerUserId: null  // Not needed for password auth
      }
    }
  }
});

// Later, user links Google account
await prisma.authProvider.create({
  data: {
    userId: user.id,
    provider: 'google',
    providerUserId: 'google-user-id-123'
  }
});

// Now user can log in with EITHER email/password OR Google
```

**AuthProvider Table:**
```
| id   | userId   | provider | providerUserId      |
|------|----------|----------|---------------------|
| ap-1 | user-123 | password | null                |
| ap-2 | user-123 | google   | google-user-id-123  |
```

---

#### 3️⃣ **`sessions Session[]`**
- **Purpose:** Track active login sessions (for JWT/session-based auth)
- **Type:** One-to-Many
- **Use Case:** User can be logged in on multiple devices

**Example:**
```typescript
// User logs in on phone
await prisma.session.create({
  data: {
    userId: user.id,
    sessionToken: 'token-abc-phone',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  }
});

// User logs in on laptop
await prisma.session.create({
  data: {
    userId: user.id,
    sessionToken: 'token-xyz-laptop',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  }
});

// User is now logged in on both devices
```

**Session Table:**
```
| id   | userId   | sessionToken      | expiresAt           |
|------|----------|-------------------|---------------------|
| s-1  | user-123 | token-abc-phone   | 2025-10-19 10:00:00 |
| s-2  | user-123 | token-xyz-laptop  | 2025-10-19 11:00:00 |
```

---

#### 4️⃣ **`emailVerificationToken EmailVerificationToken?`**
- **Purpose:** Email verification during signup
- **Type:** One-to-One (one user has one token at a time)
- **Use Case:** Send verification email, user clicks link

**Example:**
```typescript
// User signs up
const user = await prisma.user.create({
  data: {
    email: 'john@example.com',
    name: 'John Doe',
    emailVerificationToken: {
      create: {
        tokenHash: 'hashed-token-123',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }
    }
  }
});

// Send email with verification link
sendEmail(user.email, 'Click here: /verify?token=abc123');

// User clicks link
const token = await prisma.emailVerificationToken.findFirst({
  where: {
    tokenHash: hashToken('abc123'),
    expiresAt: { gte: new Date() }
  }
});

if (token) {
  // Mark as verified
  await prisma.user.update({
    where: { id: token.userId },
    data: { emailVerifiedAt: new Date() }
  });
  
  // Delete token (single use)
  await prisma.emailVerificationToken.delete({
    where: { id: token.id }
  });
}
```

---

#### 5️⃣ **`settingsUpdates Setting[]`**
- **Purpose:** Audit trail - track which admin changed which settings
- **Type:** One-to-Many
- **Use Case:** Know who changed the tax rate

**Example:**
```typescript
// Admin changes tax rate
await prisma.setting.update({
  where: { key: 'global_tax_rate' },
  data: {
    value: '10',
    updatedBy: adminUser.id  // ← Track who made the change
  }
});

// Later, check who changed settings
const admin = await prisma.user.findUnique({
  where: { id: 'admin-123' },
  include: { settingsUpdates: true }
});

// Returns:
{
  id: 'admin-123',
  name: 'Admin User',
  settingsUpdates: [
    { key: 'global_tax_rate', value: '10', updatedAt: '2025-10-12' },
    { key: 'booking_fee', value: '5', updatedAt: '2025-10-10' }
  ]
}
```

---

## 🆕 Proposed Changes for v1.0

### **Question 1: Track User Registration Source**

You asked: *"How about record where the user comes from like 'online/walkin/phone' etc"*

**Answer:** Great idea! Let's add this to the User model.

#### **Option A: Registration Source Field** ⭐ **Recommended**

```prisma
model User {
  id                String    @id @default(uuid())
  email             String?   @unique
  phone             String    @unique
  name              String
  
  // ✨ NEW: Track how user registered
  registrationSource String  @default("ONLINE")  // "ONLINE" | "WALK_IN" | "PHONE" | "ADMIN"
  registeredBy       String?  // Admin user ID if registered by admin
  
  // ... existing fields
}
```

**Use Cases:**
```typescript
// Online registration (user self-signs up)
await prisma.user.create({
  data: {
    email: 'john@example.com',
    name: 'John Doe',
    phone: '+821012345678',
    registrationSource: 'ONLINE',
    registeredBy: null
  }
});

// Walk-in registration (admin creates at front desk)
await prisma.user.create({
  data: {
    name: 'Jane Smith',
    phone: '+821098765432',
    email: null,  // Optional for walk-in
    registrationSource: 'WALK_IN',
    registeredBy: adminUserId  // Track which admin created it
  }
});

// Phone registration (admin creates during call)
await prisma.user.create({
  data: {
    name: 'Bob Johnson',
    phone: '+821055555555',
    registrationSource: 'PHONE',
    registeredBy: adminUserId
  }
});

// Analytics query
const walkInCustomers = await prisma.user.count({
  where: { registrationSource: 'WALK_IN' }
});

const phoneCustomers = await prisma.user.count({
  where: { registrationSource: 'PHONE' }
});

console.log(`Walk-in: ${walkInCustomers}, Phone: ${phoneCustomers}`);
```

**Benefits:**
- ✅ **Marketing Analytics:** Know which channel brings most customers
- ✅ **Staff Performance:** Track which admin registers most customers
- ✅ **Customer Behavior:** Compare retention rates by source
- ✅ **Audit Trail:** Know who created each account

---

#### **Option B: More Detailed Tracking** (Future Enhancement)

```prisma
model User {
  id                    String    @id @default(uuid())
  
  // Registration tracking
  registrationSource    String    @default("ONLINE")
  registrationChannel   String?   // "website" | "mobile-app" | "pos" | "phone-call"
  registrationLocation  String?   // "front-desk-1" | "online-homepage" | "booking-page"
  registeredBy          String?   // Admin user ID
  registeredAt          DateTime  @default(now()) @db.Timestamptz
  
  // First interaction tracking
  firstBookingId        String?   // Link to first booking
  acquisitionCampaign   String?   // UTM campaign if from marketing
  
  // ... existing fields
}
```

**Use Cases:**
- Track which marketing campaign brought user
- A/B testing different registration flows
- Location-based analytics (which front desk converts best)

---

### **Booking Source vs User Source**

**Important Distinction:**

```
User.registrationSource  → How the USER ACCOUNT was created
Booking.bookingSource    → How the BOOKING was created
```

**Why both?**

**Example Scenario:**
1. User registers **online** → `User.registrationSource = "ONLINE"`
2. User makes first booking **online** → `Booking.bookingSource = "ONLINE"`
3. User walks into store later → Admin creates booking → `Booking.bookingSource = "WALK_IN"`
4. User's account stays → `User.registrationSource = "ONLINE"` (doesn't change)

**Analytics Value:**
```typescript
// Question: "How many online-registered users book via walk-in?"
const onlineUsersWalkInBookings = await prisma.booking.count({
  where: {
    bookingSource: 'WALK_IN',
    user: {
      registrationSource: 'ONLINE'
    }
  }
});

// Insight: "30% of online users later visit in person!"
```

---

## 📋 Updated Schema Proposal for v1.0

```prisma
model User {
  id                     String                  @id @default(uuid())
  email                  String?                 @unique  // ⚠️ NULLABLE
  phone                  String                  @unique  // ⚠️ REQUIRED & UNIQUE
  name                   String
  
  // ✨ NEW: Registration tracking
  registrationSource     String                  @default("ONLINE")  // "ONLINE" | "WALK_IN" | "PHONE"
  registeredBy           String?                 // Admin user ID who created account
  registeredByUser       User?                   @relation("UserRegistrations", fields: [registeredBy], references: [id])
  usersRegistered        User[]                  @relation("UserRegistrations")  // Admin's created users
  
  emailVerifiedAt        DateTime?               @db.Timestamptz
  phoneVerifiedAt        DateTime?               @db.Timestamptz  // ✨ NEW (Phase 2)
  passwordHash           String?
  passwordUpdatedAt      DateTime?               @db.Timestamptz
  role                   UserRole                @default(CUSTOMER)
  createdAt              DateTime                @default(now()) @db.Timestamptz
  updatedAt              DateTime                @updatedAt @db.Timestamptz
  
  // Existing relations
  bookings               Booking[]
  authProviders          AuthProvider[]
  sessions               Session[]
  emailVerificationToken EmailVerificationToken?
  settingsUpdates        Setting[]
  bookingsCreated        Booking[]               @relation("BookingCreatedBy")  // ✨ NEW: Admin's created bookings
}

model Booking {
  id            String   @id @default(uuid())
  room          Room     @relation(fields: [roomId], references: [id])
  roomId        String
  user          User?    @relation(fields: [userId], references: [id])  // ⚠️ NULLABLE
  userId        String?  // ⚠️ NULLABLE for guest bookings
  
  // Denormalized customer data (always filled)
  customerName  String
  customerPhone String
  customerEmail String?  // ✨ NEW
  
  // ✨ NEW: Tracking fields
  isGuestBooking Boolean  @default(false)  // True if no userId
  bookingSource  String   @default("ONLINE")  // "ONLINE" | "WALK_IN" | "PHONE"
  createdBy      String?  // Admin user ID who created (if manual)
  createdByUser  User?    @relation("BookingCreatedBy", fields: [createdBy], references: [id])
  internalNotes  String?  // Admin-only notes
  
  // Existing fields
  startTime     DateTime @db.Timestamptz
  endTime       DateTime @db.Timestamptz
  players       Int
  price         Decimal  @db.Decimal(10, 2)
  status        String   @default("CONFIRMED")
  createdAt     DateTime @default(now()) @db.Timestamptz
  updatedAt     DateTime @updatedAt @db.Timestamptz

  @@index([roomId, startTime])
  @@index([userId, startTime])
  @@index([customerPhone])  // ✨ NEW: For guest lookups
  @@index([bookingSource])  // ✨ NEW: For analytics
}
```

---

## 📊 Analytics Queries Enabled

### **User Registration Analytics**

```typescript
// Registration sources breakdown
const registrationStats = await prisma.user.groupBy({
  by: ['registrationSource'],
  _count: true
});

// Result:
[
  { registrationSource: 'ONLINE', _count: 450 },
  { registrationSource: 'WALK_IN', _count: 120 },
  { registrationSource: 'PHONE', _count: 80 }
]

// Admin performance (who registers most customers?)
const adminPerformance = await prisma.user.findMany({
  where: {
    role: 'ADMIN'
  },
  include: {
    usersRegistered: {
      where: {
        createdAt: {
          gte: new Date('2025-10-01'),
          lte: new Date('2025-10-31')
        }
      }
    }
  }
});

// Result:
[
  { name: 'Admin Alice', usersRegistered: [/* 45 users */] },
  { name: 'Admin Bob', usersRegistered: [/* 32 users */] }
]
```

---

### **Booking Source Analytics**

```typescript
// Booking sources breakdown
const bookingStats = await prisma.booking.groupBy({
  by: ['bookingSource'],
  _count: true,
  _sum: { price: true }
});

// Result:
[
  { bookingSource: 'ONLINE', _count: 800, _sum: { price: 64000 } },
  { bookingSource: 'WALK_IN', _count: 250, _sum: { price: 20000 } },
  { bookingSource: 'PHONE', _count: 150, _sum: { price: 12000 } }
]

// Cross-channel analysis
const crossChannel = await prisma.booking.findMany({
  where: {
    user: {
      registrationSource: 'ONLINE'
    },
    bookingSource: 'WALK_IN'
  }
});

// Insight: "How many online users book in person?"
```

---

### **Admin Performance Tracking**

```typescript
// Which admin creates most bookings?
const adminBookingPerformance = await prisma.user.findMany({
  where: { role: 'ADMIN' },
  include: {
    bookingsCreated: {
      where: {
        createdAt: {
          gte: new Date('2025-10-01')
        }
      }
    }
  }
});

// Revenue attribution by admin
const adminRevenue = await prisma.booking.groupBy({
  by: ['createdBy'],
  where: {
    createdAt: {
      gte: new Date('2025-10-01')
    }
  },
  _sum: { price: true },
  _count: true
});
```

---

## 🎯 Summary

### **Current Schema Models**
- ✅ `User` — Single `name` field (not firstName/lastName), phone is primary identifier
- ✅ `Booking` — `startTime` for bank reconciliation, `bookingStatus` for state
- ✅ `Invoice` — Per-seat billing, lowercase `subtotal`/`tax`/`tip`, camelCase `totalAmount`/`paymentMethod`/`paidAt`
- ✅ `Payment` — Split payment records per Invoice (method + amount)
- ✅ `Order` — Menu items and discounts per seat per booking
- ✅ `Room` — Bay mapping with `bayNumber`, status enum
- ✅ `MenuItem` — Menu with categories and sorting
- ✅ `Coupon` / `CouponType` — Loyalty and promotion system
- ✅ `ScoreCapture` / `ScoreCapturePlayer` — Bay screen OCR results
- ✅ `Employee` — Staff with PIN-based identification, `role` (STAFF/MANAGER)
- ✅ `TimeEntry` — Clock in/out records per employee
- ✅ `Setting` — Global config (tax rate, etc.)

### **Key Gotchas for Queries**
- `User.name` is a **single field** — there is NO `firstName` or `lastName`
- `Invoice.subtotal`, `.tax`, `.tip` are **lowercase** — no double quotes needed in SQL
- `Invoice.totalAmount`, `.paymentMethod`, `.paidAt` are **camelCase** — need `"quotes"` in SQL
- Use `Booking.startTime` for bank reconciliation, NOT `Invoice.paidAt`
- After DST (Mar 8): Atlantic = UTC-3 (ADT), midnight = `03:00 UTC`
- Before DST: Atlantic = UTC-4 (AST), midnight = `04:00 UTC`

### **Maintenance**
> **⚠️ When changing `backend/prisma/schema.prisma`, always update:**
> 1. This file (`docs/database_schema_explanation.md`) — Quick Column Reference tables
> 2. `docs/bank_reconciliation_investigation.md` — Schema Reference section (if Invoice/Booking/User/Payment changed)
> 3. `.github/copilot-instructions.md` or `PROJECT_GUIDE.md` — if major structural changes
