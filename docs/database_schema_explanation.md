# Database Schema Explanation

**Created:** October 12, 2025  
**Last Updated:** March 11, 2026  
**Purpose:** Explain existing and proposed database relationships

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

### **Existing Relations (Not columns)**
- ✅ `bookings` - User's bookings
- ✅ `authProviders` - Login methods (Google, email/password, etc.)
- ✅ `sessions` - Active login sessions
- ✅ `emailVerificationToken` - Email verification
- ✅ `settingsUpdates` - Settings changed by admin

### **New Tracking Fields**
- ✨ `User.registrationSource` - How account was created
- ✨ `User.registeredBy` - Which admin created it
- ✨ `Booking.bookingSource` - How booking was created
- ✨ `Booking.createdBy` - Which admin created it
- ✨ `Booking.isGuestBooking` - Flag for guests

### **Payment Model** *(Added 2026-03-11)*
- ✨ `Payment` - Tracks individual payment records per Invoice
  - `id` (PK, uuid)
  - `invoiceId` (FK → Invoice)
  - `method` (CARD / CASH / GIFT_CARD)
  - `amount` (Decimal — amount paid in this payment)
  - `createdAt` (DateTime)
- Supports incremental/split payments (multiple payments per invoice)
- When `sum(payments.amount) >= invoice.totalAmount` → invoice marked PAID
- When multiple payment methods → `invoice.paymentMethod = 'SPLIT'`

### **Benefits**
- 📊 Marketing analytics (which channel works best)
- 👥 Staff performance tracking
- 💰 Revenue attribution
- 🎯 Customer behavior insights
- 📈 A/B testing capabilities

---

**Would you like me to update the v1.0 specification to include these tracking fields?**
