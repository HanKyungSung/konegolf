# K one Golf Project Tasks

Consolidated task tracking for the entire K one Golf platform (Backend, Frontend, POS).

**Legend:** `[ ]` pending | `[~]` in progress | `[x]` done

---

## 📝 Table of Contents

1. [Active Issues & Bugs](#active-issues--bugs)
2. [Project Specifications](#project-specifications)
3. [Open Questions & Decisions](#open-questions--decisions)
4. [POS Electron App - Phase 0](#pos-electron-app---phase-0)
5. [Backend & Admin Features - Phase 1](#backend--admin-features---phase-1)
6. [Simplified Booking Status & Invoice System - Phase 1.3](#phase-13-simplified-booking-status--full-pos-invoice-system)
7. [Code Cleanup & Technical Debt](#code-cleanup--technical-debt)
8. [Testing & Quality Assurance](#testing--quality-assurance)
9. [Completed Tasks Archive](#completed-tasks-archive)

---

## Personal note (Do not touch)
- daily report
  - card/cash etc
- create a new / change the account phone number
- 

### 🔄 Ongoing Tasks
- [ ] **Enable DigitalOcean Droplet Backups** 🔴 HIGH PRIORITY
  - [ ] Navigate to DigitalOcean → Droplets → k-golf (147.182.215.135)
  - [ ] Enable Weekly Automatic Backups (~20% of droplet cost)
  - [ ] Create manual snapshot before domain migration: `k-golf-pre-migration-20251226`
  - [ ] Verify backup schedule and test restoration process
  - [ ] Consider database backup script to external storage (Spaces/S3)
  - **Why:** No backups currently enabled - critical for production system
  - Clean up the operation hours in Rooms table.
  - The timeline view in booking should be responsive. Which means we need to either replace the graph or adjust it
- [x] **Fix Confirmation Email Timezone Bug** - Email showed UTC time instead of Halifax time
  - [x] Issue: Email times were 4 hours ahead (e.g., 2:30 PM instead of 10:30 AM)
  - [x] Root cause: `toLocaleTimeString` on server used UTC, not Halifax timezone
  - [x] Fixed `emailService.ts` - added `timeZone: 'America/Halifax'` to formatTime functions
  - [x] Fixed `booking-confirmation.tsx` - consistent Halifax timezone display
  - [x] Verified with booking `b0c38ad0-ba04-4c69-b7f1-d38e7a80332e` (DB: 14:30 UTC = 10:30 AM Halifax)
- [x] **Timeline View Total Hours Display** - Show total booked hours per day in timeline
  - [x] Added amber badge showing total hours at corner of each day's timeline
  - [x] Added green badge showing total revenue (with tax) per day
  - [x] Updated both Web POS (`frontend/src/pages/pos/dashboard.tsx`) and Electron POS (`pos/apps/electron/src/renderer/pages/DashboardPage.tsx`)
  - [x] Uses filtered bookings (BOOKED/COMPLETED only) for accurate counting
  - [x] Revenue calculated as subtotal × (1 + taxRate/100)

### 🔄 Ongoing Tasks
- Dashboard for the users
- [ ] **Switch to Google Workspace Email** 🔴 HIGH PRIORITY
  - **Why:** Free Gmail hit daily sending limit (500/day). Need Google Workspace (2,000/day) or transactional email service.
  - **Steps:**
    1. Buy Google Workspace Business Starter ($7 USD/mo) for `konegolf.ca`
    2. Create email account (e.g. `info@konegolf.ca`)
    3. Add DNS records: MX, SPF, DKIM, DMARC for `konegolf.ca`
    4. Enable 2FA on new account → generate App Password
    5. Update `.env.production` on prod server (`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM`)
    6. Update `backend/.env` for local dev
    7. Restart backend: `docker compose -f docker-compose.release.yml restart backend`
  - **All hardcoded email references to update:**
    - **Env config files (credentials — update values only, no code change):**
      - [ ] `backend/.env` — `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM`
      - [ ] `backend/.env.example` — update example values
      - [ ] `.env.production` (on prod server) — `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM`
    - **Backend code (hardcoded `konegolf.general@gmail.com`):**
      - [ ] `backend/src/services/emailService.ts:563` — contact form recipient hardcoded as `konegolf.general@gmail.com`
      - [ ] `backend/src/services/emailService.ts:560` — comment referencing `konegolf.general@gmail.com`
      - [ ] `backend/src/jobs/bookingReportScheduler.ts:157` — fallback `konegolf.general@gmail.com`
      - [ ] `backend/src/routes/contact.ts:16` — comment referencing `konegolf.general@gmail.com`
    - **Backend code (`EMAIL_FROM` fallbacks — env-driven, no change needed unless switching away from Gmail):**
      - `backend/src/services/emailService.ts:67,88,292,333,544,625,719,825` — `process.env.EMAIL_FROM || 'K one Golf <no-reply@konegolf.ca>'`
    - **Frontend (user-facing email display):**
      - [ ] `frontend/components/policy-modal.tsx:147` — displays `konegolf.general@gmail.com` to users
    - **Test scripts:**
      - [ ] `backend/scripts/test-report-email.ts:12` — fallback `konegolf.general@gmail.com`
    - **Documentation (update references):**
      - [ ] `RECEIPT_TESTING.md:8-9,141` — Gmail setup instructions
      - [ ] `DEPLOY_DOCKER.md:123,254,306,316` — EMAIL_FROM references
      - [ ] `DEPLOYMENT_STATUS.md:103,131` — EMAIL_FROM reference
      - [ ] `backend/README.md:69,498` — EMAIL_FROM reference
  - **No code deployment needed** — env var change + restart is enough for the core switch. Hardcoded references are follow-up cleanup.
- [x] **Persistent Logging with Rotation** (2026-03-18)
  - [x] Pino logger writes to both stdout and `/app/logs/app.log` via `pino.multistream`
  - [x] Docker volume mount: `/var/log/kgolf:/app/logs` in `docker-compose.release.yml`
  - [x] Logrotate config at `/etc/logrotate.d/kgolf` — daily rotation, 30 days, compressed
  - [x] Logs now survive container redeployments
  - [x] Documented in `PROJECT_GUIDE.md` (log locations, search commands, config)
- [x] **Morning Email Report — Quick Sale Fix & POS Link** (2026-03-18)
  - [x] Quick sales now included with orange "QUICK SALE" badge in email
  - [x] Quick sale time shows as "3:23 PM (created)" instead of misleading time range
  - [x] Added `bookingSource` field to report data and logs
  - [x] Fixed POS link: `pos.konegolf.ca` → `konegolf.ca`
  - [x] Added Payment status column with colored badges (green PAID / red UNPAID)
  - [x] Added structured email content logging for audit trail
  - [x] Commit: `3923e37`
- [x] **Daily Morning Email Report for Uncompleted Bookings** (2026-03-17)
  - [x] New cron job at 7:00 AM Atlantic Time (`backend/src/jobs/bookingReportScheduler.ts`)
  - [x] Queries bookings with `bookingStatus='BOOKED'` and `startTime` within the previous day (Atlantic TZ)
  - [x] Sends HTML email with booking table (customer, room, time, seats, payment status)
  - [x] Added `sendUncompletedBookingsEmail()` to `emailService.ts`
  - [x] Wired into `server.ts` alongside existing coupon scheduler
  - [x] Recipient: `REPORT_EMAIL` env var or default `konegolf.general@gmail.com`
  - [x] DST-aware date math using `Intl.DateTimeFormat` with `America/Halifax`
  - [x] Commit: `dce9d68`
- [x] **Custom/Wild card menu item** - Can enter item name and price on-the-fly in POS
  - [x] Database schema updated (Order.customItemName, Order.customItemPrice)
  - [x] Backend API supports custom items (menuItemId nullable with XOR validation)
  - [x] Frontend "Custom Item" button with purple gradient
  - [x] Custom item dialog with name/price inputs and seat selection
  - [x] Custom items display with "Custom" badge
  - [x] Split functionality creates custom items with split prices
  - [x] Move/delete operations work with custom items
  - [x] Receipt generation includes custom items
  - [x] Scroll position preserved on data reload
  - [ ] **Future Enhancement:** Smart split recalculation on delete
    - **Analysis Done:** 3 implementation options identified
    - **Recommendation:** Option 2 (Parse Names) - ~3 hours effort
    - **Reason to defer:** Current behavior is transparent and simpler for accounting
    - **When to implement:** If staff frequently adjust splits after creation
    - **Details:** See analysis in git commit message for smart split tracking options
- [x] **Discount feature on POS billing** - Add discount (flat $ or %) per seat in booking detail
  - [x] Database: Added `discountType` (FLAT/PERCENT) to Order model + migration
  - [x] Backend: orderRepo, booking route accept `discountType`, validate negative price for discounts
  - [x] Frontend API: `pos-api.ts` passes `discountType` in createOrder
  - [x] Discount button (emerald/teal gradient) with Minus icon below Custom Item button
  - [x] Discount dialog: name input, FLAT/PERCENT toggle, amount input, preview, seat selection
  - [x] Percentage discounts auto-calculate from seat subtotal, label shows `(X%)`
  - [x] Discount orders stored as negative `customItemPrice` with `discountType`
  - [x] Green "Discount" badge for discount items, purple "Custom" for custom items
  - [x] Emerald price display for negative (discount) amounts
- [x] **Landing page contact form** - Functional contact form with email integration
  - [x] Created /api/contact endpoint with Zod validation
  - [x] Added sendContactEmail function to email service
  - [x] Form validation (all fields required, email format, 10+ char message)
  - [x] Success/error feedback UI with auto-dismiss
  - [x] Emails sent to konegolf.general@gmail.com with reply-to sender
- [x] **Landing page footer cleanup** - Show only implemented features
  - [x] Commented out Services section (Screen Golf, Lessons, Events, Tournaments)
  - [x] Commented out Help Center link
  - [x] Kept Booking Policy, Cancellations, Contact Us
  - [x] Updated grid from 3 to 2 columns
- [x] **Booking and Cancellation Policies** - Modal dialogs with comprehensive policies
  - [x] Created PolicyModal component with booking/cancellation types
  - [x] Booking policy: reservations, advance booking (30 days), groups (4 max), payment, facility rules, no-show
  - [x] Cancellation policy: 24h free cancellation, late fees ($25 <24h, $50 <2h), refund process (5-7 days)
  - [x] Modal triggers from footer links
  - [x] Includes business phone (902) 270-2259 and email
  - [x] Professional styling with Tailwind/shadcn
- Ask no cleaning time between bookings.
- [x] ~~The coupon. like every 30 times visit, free hours etc.~~ **Coupon System Implemented**
  - [x] Prisma models: CouponType + Coupon (with CouponStatus enum)
  - [x] 3 seeded types: BIRTHDAY, LOYALTY, CUSTOM (admin can add more from UI)
  - [x] Daily cron scheduler (8 AM Atlantic): birthday + loyalty (10 bookings) auto-coupons
  - [x] Branded email with inline QR code (base64 PNG via cid: attachment)
  - [x] Public coupon status page at `/coupon/:code` (no auth, no PII)
  - [x] Full API: validate, redeem, create, list, types CRUD
  - [x] Admin "Send Coupon" button in customer detail modal
  - [x] POS "Apply Coupon" button with manual code entry + validate → seat selection → redeem
  - [x] Redemption creates discount Order ($35 flat, negative price) in transaction
  - [x] **Coupon Management Phase 2:**
    - [x] Admin "Coupons" tab (3rd tab) with searchable table, status/type filters, pagination
    - [x] Coupon detail card on row click (code, status, type, amount, customer, dates, booking, milestone)
    - [x] Revoke coupon (admin) — expires active coupons via PATCH endpoint
    - [x] Coupon type management dialog (view/create/toggle active status)
    - [x] Customer detail modal: coupon history section (clickable badges)
    - [x] Customer dashboard: "My Coupons" section with card grid (active/redeemed/expired)
    - [x] `GET /api/coupons/my` endpoint for customer's own coupons
    - [x] `PATCH /api/coupons/:id/revoke` endpoint for admin
    - [x] `GET /api/coupons?userId=` filter for per-customer coupon lookup
    - [x] `PATCH /api/coupons/:id/status` endpoint — admin can change status (ACTIVE/REDEEMED/EXPIRED)
    - [x] Status dropdown in coupon detail modal replaces revoke-only button
    - [x] Clears redeemed fields when reverting coupon to ACTIVE
    - [x] Deleting a coupon discount order reverts coupon back to ACTIVE automatically
    - [x] Seeded 5 default coupon types in production (birthday, loyalty, referral, seasonal, custom)
- [x] ~~When pay button clicks — per seat payment closure~~ **Incremental Collect Payment System** (see 2026-03-11)
- User signup
  - phone number duplication
  - If that happens how user can find the email address associate with it?
  - when user sign up we should link up all bookings with associated phone number.
- Sync up with the SNS to share the experiences.
- Display remaining time on Room status
- User search functionality.
  - baed on email/phone/name (phone is probably the most reliable)

- [x] **Mobile Responsive Design Improvements** - Make admin/POS pages mobile-friendly ✅ `d04f92c`
  - [x] Shared AdminHeader component with hamburger menu for mobile navigation
  - [x] Responsive padding & grids across all admin/POS pages
  - [x] Table column hiding on small screens (customers & bookings tables)
  - [x] POS timeline scrollable container with stacked header on mobile
  - [x] Booking-detail icon-only action buttons on mobile
  - [x] POS menu tabs consolidated into single scrollable row
  - [x] MonthlyRevenueChart responsive header & stats

- **Setup Gmail "Send As" for k-golf.ca domain** 🔄 FUTURE TASK
  - Create email account on Postfix server (noreply@k-golf.ca)
  - Configure Postfix SMTP authentication
  - Set up Gmail "Send As" with k-golf.ca SMTP credentials
  - Remove "via gmail.com" notice from sent emails
  - Alternative: Consider using SendGrid (already integrated in DNS)

## 🎉 Recently Completed (2026-03-11)
- [x] **Incremental Collect Payment System** - Replace old split payment UI with collect payment dialog `a0dc92b`
  - [x] New `Payment` model in Prisma schema (id, invoiceId, method, amount, createdAt)
  - [x] Migration `20260311054101_add_payment_model` applied to prod
  - [x] `POST /api/invoices/:id/add-payment` endpoint — incremental partial payments
  - [x] `addSinglePayment()` in invoiceRepo — auto-marks PAID when total reaches invoice amount, detects SPLIT method
  - [x] Frontend: Collect Payment dialog with payment history, remaining balance, tip (% buttons), method select, amount (Full/Half)
  - [x] Removed old split payment UI, accordion payment controls, and related state
  - [x] Daily/monthly report repos updated to aggregate from Payment records
  - [x] Prod backfill: 667 Payment records created for existing paid invoices (INSERT only, no data modified)
  - [x] Booking paymentStatus correctly checks all seats before marking PAID
- [x] **Screen Capture Score Integration Plan** - Added `screen_capture/` directory
  - [x] `capture.py` v4.1 — DXGI screen capture + EasyOCR scorecard detection
  - [x] `PLAN.md` — 6-part integration plan (capture → collection → customer → deploy → monitoring → health)
  - [x] Bay PC setup scripts (setup.bat, run.bat, config.json, requirements.txt)

## 🎉 Recently Completed (2026-03-05)
- [x] **Monthly PDF Report Fix** - Grand total now matches payment types total exactly
  - [x] Derived revenue from paid invoices only (consistent with daily report)
  - [x] Verified against prod: $13,997.96 = $13,997.96 (0 diff)
- [x] **PDF Report Simplification** - Removed 3 sections from generated PDF
  - [x] Removed 'Average Tip' from Tips Summary
  - [x] Removed entire 'Operational Statistics' section
  - [x] Removed 'Total Revenue' from Report Totals
- [x] **Gift Card Report Audit** - Verified GIFT_CARD across all 6 report surfaces
  - [x] Monthly Revenue Chart, Revenue History API, Daily Report (backend+frontend), Monthly Report Repo, PDF Report
- [x] **Quick Sale Prod Bug Fix** - Fixed admin phone mismatch on production
  - [x] Updated admin@konegolf.ca phone from `+14165551000` to `+11111111111` in prod DB
- [x] **Production Log Audit** - Checked 72h of backend logs
  - [x] 0 errors (level 50), 3 warnings (all normal 401s pre-login)
  - [x] All response times fast (2-67ms)
- [x] **1GB Swap File on Droplet** - Safety net for memory spikes
  - [x] Created `/swapfile` (1GB), enabled, persisted via `/etc/fstab`
  - [x] Droplet now: 969MB RAM + 1GB swap
- [x] **Docker Log Rotation** - Added to `docker-compose.prod.yml`
  - [x] `db` and `backend` services: json-file driver, max-size 50m, max-file 5
  - [x] `docker-compose.release.yml` already had log rotation (15m/10)
- [x] **SERVER_STATUS.md Update** - Refreshed all resource metrics
  - [x] Updated memory (swap info), disk (14GB/56%), resource consumers, SSL cert status

## 🎉 Recently Completed (2026-02-23)
- [x] **Coupon Status Management** `01a7416` - Admin can change coupon status from detail modal
  - [x] New `PATCH /api/coupons/:id/status` endpoint (ACTIVE/REDEEMED/EXPIRED)
  - [x] Status dropdown replaces revoke-only button in coupon detail
  - [x] Reverting to ACTIVE clears redeemedAt/redeemedBookingId/redeemedSeatNumber
- [x] **Coupon Revert on Order Delete** `00a743d` - Deleting coupon discount order reverts coupon to ACTIVE
  - [x] Backend detects coupon orders (🎟️ prefix + negative price + FLAT discount)
  - [x] Finds matching REDEEMED coupon and resets status/fields
- [x] **Fix Scroll Jump in Booking Detail Modal** `c9d498c` - Card/Cash buttons no longer cause scroll jump
  - [x] Added `scrollContainerRef` to target modal scroll container instead of window
  - [x] Replaced Radix RadioGroup with plain div onClick (eliminates roving focus scroll)
- [x] **Seed Coupon Types in Production** - Populated CouponType table with 5 defaults
  - [x] birthday ($10), loyalty ($15), referral ($10), seasonal ($20), custom ($5)

## 🎉 Recently Completed (2026-02-20)
- [x] **Clickable Booking Rows in Customer Detail** `fb1d8a9` - Open POS booking detail from customer card
  - [x] Booking rows in customer detail modal now open full POS booking detail modal on click
  - [x] Auto-refreshes customer detail on modal close if booking was modified
- [x] **Mobile Responsive Admin/POS Pages** `d04f92c` - Full mobile responsiveness for all admin and POS pages
  - [x] Created shared `AdminHeader` component with hamburger menu (mobile) and inline nav (desktop)
  - [x] Responsive padding (`px-3 sm:px-6`, `py-4 sm:py-8`) across all pages
  - [x] Responsive grids (`grid-cols-1 sm:grid-cols-2/4`) for room cards, tabs, tip buttons
  - [x] Customer table: hide Email, Source (md), Last Booking (lg) on small screens
  - [x] Bookings table: hide Ref#, Source (lg), Phone, Room (md) on small screens
  - [x] POS timeline: scrollable container with `min-w-[700px]`, stacked header with short date format
  - [x] Booking-detail: icon-only Move/Split buttons on mobile, consolidated 5-tab scrollable row
  - [x] MonthlyRevenueChart: flex-wrap header/stats, responsive gap sizing
  - [x] Integrated AdminHeader into pos/dashboard, pos/menu-management, admin/customers, dashboard

## 🎉 Recently Completed (2026-02-18)
- [x] **Booking Modal - Phone Lookup with Booking Counts** - Two-part customer check when creating bookings
  - [x] Part 1: User existence check (Registered / No registered account)
  - [x] Part 2: Booking counts by source (Online / Walk-in / Phone) with total
  - [x] Backend `/api/users/lookup` now searches `Booking.customerPhone` via `groupBy` (works for guest bookings too)
  - [x] Lookup endpoint also allows STAFF access (was ADMIN-only)
  - [x] Single API call returns both user existence and booking counts
  - [x] Removed separate `/api/customers/:id` fetch - no longer needed
  - [x] Removed booking history list, total spent, member since (simplified UI)
  - [x] Staff can quickly see if phone number has any booking history

## 🎉 Recently Completed (2026-02-16)
- [x] **STAFF Role Implementation** - Employee POS access with limited permissions
  - [x] Created [backend/src/middleware/requireRole.ts](backend/src/middleware/requireRole.ts) with `requireAdmin` and `requireStaffOrAdmin`
  - [x] Updated booking.ts routes to use `requireStaffOrAdmin` for POS operations
  - [x] Updated menu.ts to protect POST/PATCH/DELETE with `requireAdmin` (STAFF can view only)
  - [x] Updated customers.ts POST to accept `role` parameter (CUSTOMER/STAFF)
  - [x] Updated POS routes (pos/index.tsx) to allow STAFF access
  - [x] Updated dashboard routing to show POS for STAFF users
  - [x] Added Account Type dropdown to Add Customer modal (Customer/Staff)
  - [x] Customers button in POS header visible only for ADMIN
  - [x] Revenue badge in timeline hidden (future: show only for ADMIN)
  - **STAFF can:** Access POS, create/manage bookings, control rooms, process payments
  - **STAFF cannot:** Access /admin/customers, edit menu items, change settings
- [x] **Admin Customer Form Validation** - Comprehensive validation for create/edit customer
  - [x] Phone validation with PhoneInput component (auto-format, 10-digit validation, visual indicator)
  - [x] Email validation (required field, format validation)
  - [x] Duplicate phone check before save
  - [x] Duplicate email check before save
  - [x] Red asterisks for all required fields (Name, Phone, Email)
  - [x] Real-time validation feedback with error messages
- [x] **Customer Detail Modal Total Panel** - Added Total summary panel on left side
  - [x] Shows combined booking count and total spent across all sources
  - [x] Emerald green accent styling to distinguish from source panels
  - [x] Increased panel padding to prevent ring border clipping
- [x] **Clickable Birthday Badges** - Birthday pills open customer detail modal
  - [x] Added `openBirthdayCustomerDetail()` handler in customers.tsx
  - [x] Birthday badges now have cursor pointer and hover effects
  - [x] Clicking badge loads and displays full customer profile
- [x] **Monthly Revenue Chart** - Visual bar chart showing 12-month revenue trends
  - [x] Created [MonthlyRevenueChart.tsx](frontend/components/MonthlyRevenueChart.tsx) component using Recharts
  - [x] New backend API: `GET /api/customers/revenue-history` returns 12 months of data
  - [x] Metrics per month: revenue, bookingCount, completedCount, cancelledCount, averageBookingValue
  - [x] Summary stats: totalRevenue, totalBookings, averageMonthlyRevenue, month-over-month changes
  - [x] Combined bar chart (revenue) + line chart (booking count) with dual Y-axes
  - [x] Custom tooltip showing detailed breakdown per month
  - [x] Trend badges showing % change vs last month for revenue and bookings
  - [x] Placed at top of customers page above the 5 metric cards
  - [x] Dark theme styling matching admin dashboard
- [x] **Unified Button Styles Across Admin Pages** - Created shared buttonStyles.ts for consistent UI
  - [x] Created [frontend/styles/buttonStyles.ts](frontend/styles/buttonStyles.ts) with all button style constants
  - [x] Style categories: primary, secondary, headerNav, headerLogout, ghost, pagination, destructive, success, info, warning
  - [x] Updated [admin.tsx](frontend/src/pages/admin.tsx) - Fixed Logout button (red → slate)
  - [x] Updated [dashboard.tsx](frontend/src/pages/dashboard.tsx) - Fixed Logout button (red → slate)
  - [x] Updated [pos/dashboard.tsx](frontend/src/pages/pos/dashboard.tsx) - Updated ~10 buttons (Customers, Logout, Create Booking, Manage, Book, Menu buttons, Tax Save/Cancel/Edit, Prev/Next Week)
  - [x] Updated [menu-management.tsx](frontend/src/pages/pos/menu-management.tsx) - Updated Logout, Back, Add Item, Save/Cancel, Delete dialog buttons
  - [x] Added import to [customers.tsx](frontend/src/pages/admin/customers.tsx) for future use
  - [x] Consistent dark theme: amber primary CTAs, slate secondary/cancel buttons
- [x] **Customer & Booking Management Admin Page** - Comprehensive admin page for managing customers and bookings
  - [x] New `/admin/customers` page with Customers and Bookings tabs
  - [x] Unified search: search by phone, name, email, or booking reference across both tabs
  - [x] Metrics dashboard: total customers, new this month, today's bookings, monthly revenue, upcoming birthdays
  - [x] Customers tab: sortable columns, pagination, customer detail modal with booking history
  - [x] Bookings tab: date range filter, status filter (BOOKED/COMPLETED/CANCELLED), source filter (ONLINE/WALK_IN/PHONE)
  - [x] Booking detail modal with customer info and link to customer profile
  - [x] New API: `GET /api/customers/bookings/search` with pagination, filters, and phone/name/ref search
  - [x] Backend: Added `todaysBookings` and `monthlyRevenue` to metrics endpoint
- [x] **Fixed Confirmation Email Date Bug** - Email was showing wrong date due to UTC extraction
  - [x] Issue: Booking for Feb 14 10:30 AM Halifax (Feb 14 14:30 UTC) showed as "Feb 14" in email, but booking for 7:30 PM Halifax (Feb 15 00:30 UTC) showed as "Feb 15"
  - [x] Root cause: Date extracted from UTC string without timezone conversion
  - [x] Fixed: Now extracts date in customer's timezone (America/Halifax) using date-fns-tz
  - [x] Removed players field from booking confirmation email (not needed)
- [x] **Fixed POS Timeline Booking Flickering** - Bookings were shifting position after initial load
  - [x] Issue: loadData() used UTC date split (`startTime.split('T')[0]`), polling used local timezone
  - [x] Root cause: Inconsistent date extraction between initial load and polling refresh
  - [x] Example: Booking at midnight UTC (2026-02-01T00:00:00Z) = 8PM Halifax on Jan 31
    - OLD loadData showed on Feb 1 (wrong), polling showed on Jan 31 (correct) → flickering
  - [x] Fixed: Both loadData and polling now use consistent local timezone date extraction
- [x] **Updated Copilot Instructions** - Added production environment details
  - [x] Added server access info (IP: 147.182.215.135, SSH command, domain)
  - [x] Added SSH agent setup instructions for connection troubleshooting
  - [x] Added production database access commands (container, DB name, user, timezone)
  - [x] Added deprecated notice for Electron POS
  - [x] Fixed nested `.github/.github/` folder issue → moved to `.github/copilot-instructions.md`
- [x] **Fixed Seed Script Booking Overlaps** - Mock bookings were overlapping on same room
  - [x] Added slot tracking per room per day using Map
  - [x] Helper functions to check availability and mark slots as occupied
  - [x] Skips booking creation if no available slot for that room that day
  - [x] Prevents overlapping bookings on same room in seed data
- [x] **Monthly Revenue Date Range Display** - Show date range on admin metrics panel
  - [x] Changed "This month" to show actual date range (e.g., "Feb 1 - Feb 28")
  - [x] Dynamically calculates first and last day of current month
- [x] **Booking Detail Modal Improvements** - Reusable fullscreen modal component
  - [x] Created shared `BookingDetailModal` component at [frontend/components/BookingDetailModal.tsx](frontend/components/BookingDetailModal.tsx)
  - [x] 95vw × 95vh fullscreen dialog wrapping POSBookingDetail component
  - [x] Props: `bookingId`, `open`, `onOpenChange`, `onClose` (for refresh after changes)
  - [x] Updated POS Dashboard to use modal instead of inline content replacement
  - [x] Dashboard stays visible behind modal, maintains context
  - [x] Updated Admin Customers to use shared BookingDetailModal
  - [x] Removed duplicate inline Dialog code from admin page
  - [x] Removed unused edit functionality (status/payment inline editing)
  - [x] Data auto-refreshes when modal closes

## 🎉 Recently Completed (2026-01-11)
- [x] **Migrated operating hours from Room table to Settings table** - Centralized business hours management
  - [x] Created new Settings entries: `operating_hours_open` (600 = 10:00 AM) and `operating_hours_close` (1440 = 12:00 AM)
  - [x] Added helper function getOperatingHours() to fetch from Settings with fallback defaults
  - [x] Updated all booking validation logic to use Settings instead of Room.hours
  - [x] Updated availability endpoint to use Settings-based operating hours
  - [x] Seed script now creates operating hours settings (idempotent, won't overwrite existing)
  - [x] Removed openHours/closeHours fields from Room table (deprecated)
  - [x] Architecture: Single source of truth for business hours, easier to manage via admin UI
  - [x] Backward compatible: Fallback to 10AM-12AM if settings not found
  - [x] All booking creation endpoints now validate against Settings-based operating hours
  - [x] Production deployment: Seed script runs automatically on deploy to create settings

## 🎉 Recently Completed (2026-01-05)
- [x] **Fixed invoice logic to track room booking cost as order items** - Consistent invoice handling
  - [x] Modified createBooking() to create invoices with $0 subtotal instead of pre-calculating room price
  - [x] Added addBookingOrderToSeat1() helper function to auto-create booking duration order
  - [x] Room booking cost now tracked as Order item (hour-1 through hour-5 menu items)
  - [x] All bookings start with clean invoices, seat 1 gets booking duration item
  - [x] Example: 3-hour booking for 2 players creates booking ($105), seat 1 invoice ($105 + $10.50 tax), seat 2 invoice ($0 for food/drinks)
  - [x] Updated both POST /api/bookings and POST /api/bookings/simple/create routes
  - [x] Consistent with POS manual booking flow where items are added separately
  - [x] Menu items for booking durations already exist in production (hour-1 to hour-5)
- [x] **SEO: Diagnosed Google search visibility issues**
  - [x] Site showing in Google search with old "K-Golf" branding (cached data)
  - [x] Google successfully crawled site on Jan 5, 2026 with new "K one Golf" branding
  - [x] Verified indexing allowed and page fetch successful via Search Console
  - [x] Title and metadata correct in production HTML
  - [x] Cache will refresh automatically within 24-72 hours after successful crawl
- [x] **Database maintenance: Reset test booking invoice for manual testing**
  - [x] Reset invoices for booking 8e989b92-fd09-4a28-b2d7-5a1e5c1cd8a8 to $0 subtotal
  - [x] Allowed manual testing of new order-based invoice system

## 🎉 Recently Completed (2026-01-04)
- [x] **Unified booking status to uppercase across entire system** - Consistent status handling
  - [x] Database stores uppercase: BOOKED, CANCELLED, COMPLETED
  - [x] Backend API returns uppercase status (removed presentStatus() conversion)
  - [x] Frontend dashboard updated to use uppercase comparisons
  - [x] POS dashboard getStatusColor() changed from toLowerCase() to toUpperCase()
  - [x] Room status cards now correctly exclude CANCELLED/COMPLETED bookings
  - [x] All status comparisons are case-insensitive and use uppercase
  - [x] Fixed bug: cancelled booking (eaf69568...) was showing in room status cards
  - [x] Timeline filters use uppercase for consistency
  - [x] Electron POS uses case-insensitive comparison for both bookingStatus and status fields
- [x] **Fixed timezone handling across entire platform** - Proper UTC storage with timezone-aware display
  - [x] Backend: Return ISO strings (UTC) for timezone-agnostic data transfer
  - [x] Customer frontend: Format times in user's browser timezone (PST user books 7pm, sees 7pm)
  - [x] Admin dashboard: Force Atlantic Time display for business operations
  - [x] Booking creation: Use millisecond timestamps instead of ISO strings (eliminates timezone ambiguity)
  - [x] Updated /api/bookings endpoint to accept startTimeMs instead of startTimeIso
  - [x] Updated /api/bookings/simple/create to use millisecond timestamps
  - [x] Customer booking page interprets input as Atlantic Time (business location)
  - [x] Conflict detection shows times in Atlantic Time with human-readable error messages
  - [x] Database stores all times in UTC (timezone-agnostic)
  - [x] Architecture: DB (UTC) → API (ISO strings) → Frontend (user timezone or business timezone)
- [x] **Improved booking timeline UI** - Better visibility and usability
  - [x] Added visible hour labels to customer booking timeline (10AM, 12PM, 2PM, etc.)
  - [x] Increased timeline height from 12px to 14px for better visibility
  - [x] Matched admin dashboard timeline style with clear time indicators
  - [x] Improved spacing and typography for easier reading
- [x] **Production deployment infrastructure improvements**
  - [x] Added automatic Docker cleanup before deployments in GitHub Actions
  - [x] Freed 9.28GB disk space on production server (from 99% to 54% usage)
  - [x] Added docker system prune step to prevent future "no space left on device" errors
  - [x] Deployment workflow now prunes unused images/containers/volumes before pull
- [x] **SEO metadata for Google search visibility**
  - [x] Added comprehensive meta tags (title, description, keywords)
  - [x] Geo tags for local search (Sydney, NS, Cape Breton)
  - [x] Open Graph and Twitter card metadata
  - [x] Schema.org structured data for SportsActivityLocation
  - [x] Business name: "K one Golf"
  - [x] Complete address: 45 Keltic Dr, Unit 6, Sydney, NS B1S 1P4
  - [x] Phone: (902) 270-2259
- [x] **Updated business address consistently across all pages**
  - [x] Changed from "5 Keltic Dr #6" to "45 Keltic Dr, Unit 6, Sydney, NS B1S 1P4"
  - [x] Updated in receipt footer (booking-detail.tsx)
  - [x] Updated in booking confirmation page with Google Maps link
  - [x] Updated in home page contact section
  - [x] Updated in SEO structured data

## 🎉 Recently Completed (2026-01-02)
- [x] Fixed critical receipt calculation bug - receipts now use invoice totals from database
  - [x] Removed incorrect room charge calculation (was multiplying by players incorrectly)
  - [x] Verified hours are menu items in database (1hr=$35, 2hr=$70, 3hr=$105, 4hr=$140, 5hr=$175)
  - [x] Changed receipt to sum invoice subtotals instead of calculating on-the-fly
  - [x] Set roomCharge to empty object for backwards compatibility
  - [x] System design confirmed: hours are ordered as menu items, invoices store calculated totals
- [x] Implemented seat-specific thermal printing support
  - [x] Added optional seatIndex parameter to print API endpoint
  - [x] Updated frontend to send seatIndex when printing individual seat receipts
  - [x] Receipt number uses invoice ID for seat receipts, booking ID for full receipts
- [x] Created print-server release workflow with GitHub Actions
  - [x] Builds executables for Windows (x64), macOS (ARM64), and Linux (x64) on print-v* tags
  - [x] Uses pkg to bundle with node18 runtime (node20 not yet supported by pkg)
  - [x] Creates GitHub releases with zip/tar.gz distributions
- [x] Deprecated POS Electron app release workflow
  - [x] Disabled automatic builds on push (now manual only)
  - [x] Added deprecation notice to workflow file
- [x] Implemented smart printer health checks
  - [x] Health check runs every 60 seconds
  - [x] Only logs when connection status changes (connected ↔ disconnected)
  - [x] Automatic simulation mode when printer unavailable
  - [x] Clean logs without noise

## 🎉 Recently Completed (2026-01-01)
- [x] Sorted customer dashboard bookings by newest first (descending order by start time)
- [x] Updated all room images to use high-quality versions (room1.jpeg, room2.jpeg, etc.)
  - [x] Replaced minified versions (-min.jpeg) with full-quality images
  - [x] Applied to both booking page and home page

## 🎉 Recently Completed (2025-12-31)
- [x] Implemented booking confirmation emails with ICS calendar attachments
  - [x] Send professional confirmation emails after booking creation
  - [x] Include ICS calendar file for easy calendar import
  - [x] Created dedicated booking confirmation page with clean UX
  - [x] Shows all booking details, location, and next steps
  - [x] Replaced alert popup with redirect to confirmation page
- [x] Implemented login requirement for online bookings with seamless UX
  - [x] Users can browse booking page without login
  - [x] Login/signup required only when clicking "Confirm Booking"
  - [x] Booking selections saved to sessionStorage before redirect
  - [x] Selections automatically restored after login or email verification
  - [x] Works for both login and signup → verification flows
- [x] Updated operating hours from 9AM-7PM to 10AM-12AM across system
  - [x] Updated seed files with new openMinutes (600) and closeMinutes (1440)
  - [x] Updated booking validation to use new hours
  - [x] Updated frontend labels and timeline views
  - [x] Migrated database rooms in both local and production
- [x] Implemented smart TimePicker with duration-aware time filtering
  - [x] Added maxDurationHours prop to prevent bookings past closing time
  - [x] Fixed midnight display bug (now shows "12 AM" instead of "12 PM")
  - [x] Dynamic time options based on booking duration (e.g., 1 hour max 11PM, 4 hours max 8PM)
- [x] Updated POS admin dashboard timeline view to match customer booking (10AM-12AM)
- [x] Removed auto-filled time in POS booking modal (now starts empty like customer booking)
- [x] Updated Contact section with correct business information (address, phone, hours)
- [x] Removed Virtual Tour button from landing page
- [x] Commented out newsletter section in footer (TODO: revisit styling)
- [x] Changed footer grid from 4 to 3 columns for better layout
- [x] Created new Gmail account (konegolf.general@gmail.com) and updated production environment

## 🎉 Recently Completed (2025-12-30)
- [x] Fixed booking price calculation bug (removed player multiplier, changed rate from $50 to $35/hour)
- [x] Fixed Decimal type formatting in API responses (booking prices now display correctly)
- [x] Migrated all existing bookings to correct pricing (168 bookings in production, 146 in local)
- [x] Domain migration from k-golf.ca to konegolf.ca (DNS, SSL, Nginx, environment variables)
- [x] Rebranded all "K-Golf" references to "K one Golf" across frontend, backend, and POS apps
- [x] Fixed theme system detection (forced dark mode instead of system preference)
- [x] Updated landing page pricing from $50 to $35 per hour

## 🎉 Recently Completed (2025-12-19)
- [x] Fixed critical production database connection pool issue with Prisma singleton pattern
- [x] E2E test infrastructure setup with Playwright (19 tests created)
- [x] Configured auto-server startup for E2E tests
- [x] Fixed webpack dev server crashes during test runs

## 🚨 URGENT TASKS (2025-12-19)

### 1. **Thermal Print Server System** 🔄 IN PROGRESS
- **Priority:** HIGH
- **Component:** Print Server + Backend WebSocket + Receipt Formatter
- **Status:** Core functionality complete, build system needs testing
- **Description:** Standalone print server application that connects to backend via WebSocket to print receipts on thermal printers

#### Completed ✅
- [x] Backend WebSocket server for print job broadcasting
- [x] Backend receipt formatter service (formats on server, not client)
- [x] Backend print routes (`/api/print/receipt`, `/api/print/test`)
- [x] Print server WebSocket client with auto-reconnect
- [x] Thermal printer integration with `node-thermal-printer`
- [x] Auto-discovery of network printers (mDNS + network scan)
- [x] Config auto-creation on first run
- [x] Environment variable support (.env)
- [x] Simulation mode (runs without physical printer)
- [x] Receipt formatting commands executed by print server
- [x] Graceful shutdown and error handling
- [x] Documentation (README, AUTO_DISCOVERY.md, etc.)

#### Pending 🔄
- [ ] **Test build system** - Verify pkg can bundle with node-thermal-printer
- [ ] **Test Windows .exe** - Ensure executable works on Windows
- [ ] **Test macOS executable** - Ensure executable works on macOS
- [ ] **Fix native module bundling** - If pkg fails with node-thermal-printer
- [ ] **Production deployment** - Deploy to actual store with printer
- [ ] **Integration with POS UI** - Add "Print Receipt" button in booking detail
- [ ] **Auto-update mechanism testing** - Verify update service works

#### Technical Notes
- Print server connects to `wss://k-golf.ca` or `ws://localhost:8080` (via .env)
- Receipt formatting happens on backend (easy to modify layouts)
- Print server executes thermal commands (text, bold, align, cut, etc.)
- Nginx already configured for WebSocket upgrades
- Build scripts ready: `./build.sh` creates Windows/macOS executables

---

### 2. **Email Invoice/Receipt to Customer**
- **Priority:** HIGH
- **Component:** Backend Email Service + POS Booking Detail Page
- **Status:** Pending
- **Description:** Add ability to send invoice/receipt to customer via email after booking completion or payment
- **Requirements:**
  - [ ] Backend endpoint to send receipt email
  - [ ] Email template for invoice/receipt (similar to print receipt format)
  - [ ] UI button in POS booking detail page to trigger email send
  - [ ] Customer email validation
  - [ ] Email delivery confirmation/error handling
  - [ ] Include all booking details, orders, payments, and totals in email
- **Technical Notes:**
  - Backend already has nodemailer configured
  - Can reuse existing receipt data structure from print functionality
  - Need to create HTML email template
  - Consider adding email field to booking form or payment modal

---

### 3. **Domain Migration to k-golf.ca** ✅ COMPLETED (2025-12-05)
- **Priority:** COMPLETED
- **Component:** Production Infrastructure + DNS + SSL
- **Status:** Fully migrated from k-golf.inviteyou.ca to k-golf.ca
- **Changes Made:**
  - DNS A records configured for k-golf.ca and www.k-golf.ca
  - SSL certificate obtained for k-golf.ca (expires 2026-03-05)
  - Nginx configuration created and deployed
  - Backend CORS updated to accept all domains
  - Admin email addresses updated to @k-golf.ca
  - Production and local databases updated
  - SSL auto-renewal configured (systemd timer + snap + cron)

#### Implementation Summary:

**DNS Configuration** `[x]` ✅ DONE
- [x] A record: k-golf.ca → 147.182.215.135
- [x] A record: www.k-golf.ca → 147.182.215.135
- [x] DNS propagated and verified

**SSL Certificate** `[x]` ✅ DONE
- [x] Certificate obtained via certbot for k-golf.ca and www.k-golf.ca
- [x] Certificate location: `/etc/letsencrypt/live/k-golf.ca/`
- [x] Valid until: 2026-03-05 (89 days)
- [x] Auto-renewal configured:
  - Systemd timer: runs twice daily
  - Snap timer: backup mechanism
  - Cron job: runs every 2 months
  - Renews 30 days before expiration

**Nginx Configuration** `[x]` ✅ DONE
- [x] Created `/etc/nginx/sites-available/k-golf.ca`
- [x] HTTP → HTTPS redirect configured
- [x] Security headers added (X-Frame-Options, CSP, etc.)
- [x] Proxies to port 8082 (K-Golf Docker container)
- [x] Symlinked to sites-enabled
- [x] Configuration tested and reloaded

**Backend Environment** `[x]` ✅ DONE
- [x] Updated `.env.production`:
  - CORS_ORIGIN: Added k-golf.ca, www.k-golf.ca, k-golf.inviteyou.ca
  - FRONTEND_ORIGIN: Set to https://k-golf.ca
- [x] Docker container restarted with new config
- [x] Verified container health

**Database Updates** `[x]` ✅ DONE
- [x] Updated seed file: admin@kgolf.com → admin@k-golf.ca
- [x] Updated seed file: admin2@kgolf.com → admin2@k-golf.ca
- [x] Updated local database admin emails
- [x] Updated production database admin emails
- [x] Verified both databases have correct emails

**Testing & Verification** `[x]` ✅ DONE
- [x] HTTPS access: https://k-golf.ca works
- [x] API access: https://k-golf.ca/api/* works
- [x] Frontend loads correctly
- [x] All domains accessible (k-golf.ca, www.k-golf.ca, k-golf.inviteyou.ca)
- [x] Container logs show no errors

**Documentation** `[x]` ✅ DONE
- [x] Created setup guide: `docs/setup_kgolf_ca_domain.md`
- [x] Updated SERVER_STATUS.md with:
  - New primary domain information
  - SSL certificate details
  - Auto-renewal configuration
  - Nginx server block documentation
  - Domain architecture diagram
- [x] Updated README.md with receipt printing feature
- [x] Updated TASKS.md with domain migration

**Current Domain Architecture:**
```
k-golf.ca (Primary)           → Nginx → Docker:8082 → K-Golf App
www.k-golf.ca                 → Nginx → Docker:8082 → K-Golf App
k-golf.inviteyou.ca (Legacy)  → Nginx → Docker:8082 → K-Golf App (backward compatibility)
```

---

## 🚨 URGENT TASKS (2025-12-04)

### 2. **Receipt Printing Feature** ✅ COMPLETED (2025-12-04)
- **Priority:** COMPLETED
- **Component:** POS Booking Detail Page + Receipt System
- **Status:** Fully implemented and tested
- **Features Added:**
  - Receipt preview modal before printing
  - Per-seat receipt printing with formatted layout
  - Email receipt functionality
  - Thermal/regular printer support (80mm width)
  - Backend receipt API with data aggregation

#### Implementation Summary:

**Backend Implementation** `[x]` ✅ DONE
- [x] Created `receiptRepo.ts` for receipt data generation
  - [x] `getReceiptData()` - Full receipt with all seats
  - [x] `getSeatReceiptData()` - Individual seat receipt
  - [x] Aggregates booking, invoice, order, and menu data
- [x] Created receipt API routes in `backend/src/routes/receipt.ts`
  - [x] `GET /api/receipt/:bookingId` - Get full receipt
  - [x] `GET /api/receipt/:bookingId/seat/:seatIndex` - Get seat receipt
  - [x] `POST /api/receipt/:bookingId/email` - Send receipt via email
- [x] Extended `emailService.ts` with HTML receipt template
  - [x] `sendReceiptEmail()` function with formatted HTML
  - [x] Includes business info, items, totals, payment status

**Frontend Implementation** `[x]` ✅ DONE
- [x] Created `Receipt.tsx` component
  - [x] Formatted layout optimized for 80mm receipt printers
  - [x] Shows business info, customer details, items, totals
  - [x] Conditional rendering (full receipt vs seat-specific)
  - [x] Payment status badges
- [x] Added receipt API functions to `pos-api.ts`
  - [x] `getReceipt(bookingId)` - Fetch full receipt
  - [x] `getSeatReceipt(bookingId, seatIndex)` - Fetch seat receipt
  - [x] `sendReceiptEmail(bookingId, email)` - Email receipt
- [x] Integrated into booking detail page
  - [x] Print button on each seat accordion header
  - [x] Opens modal with receipt preview
  - [x] Print button in modal opens dedicated print window
  - [x] Includes Tailwind CSS for styled output
  - [x] Removed old "Print Receipt" from Quick Actions
- [x] Created `receipt-test.tsx` page for testing
  - [x] Load receipt by booking ID
  - [x] Test full and seat-specific receipts
  - [x] Test email delivery

**Features:**
- ✅ Click print icon next to any seat to preview receipt
- ✅ Modal shows formatted receipt with all details
- ✅ Print opens new window with clean 80mm layout
- ✅ Single page output, center-aligned
- ✅ Preserves all styling from preview
- ✅ Email receipts with HTML template
- ✅ Support for both full and per-seat receipts
- ✅ Receipt number uses invoice ID for seat receipts (trackable in database)
- ✅ Receipt number uses booking ID for full receipts

---

## 🚨 URGENT TASKS (2025-12-03)

### 1. **Backend API Integration for Orders & Invoices** ✅ COMPLETED (2025-12-03)
- **Priority:** COMPLETED
- **Component:** POS Booking Detail Page + Backend APIs
- **Status:** All 6 phases implemented and tested
- **Features Added:**
  - Full backend integration for orders and invoices
  - Payment cancellation/refund functionality
  - Invoice starting at $0 (no base price)
  - Booking completion with completedAt timestamp
  - Proper Decimal/number type handling

#### Implementation Plan:

**Phase 1: Add API Functions to Frontend** `[x]` ✅ DONE
- [x] Add to `frontend/services/pos-api.ts`:
  - [x] `getInvoices(bookingId)` → `GET /api/bookings/:bookingId/invoices`
  - [x] `createOrder(bookingId, menuItemId, seatIndex, quantity)` → `POST /api/bookings/:bookingId/orders`
  - [x] `deleteOrder(orderId)` → `DELETE /api/bookings/orders/:orderId`
  - [x] `payInvoice(invoiceId, bookingId, seatIndex, paymentMethod, tip)` → `PATCH /api/invoices/:invoiceId/pay`
  - [x] `getPaymentStatus(bookingId)` → `GET /api/bookings/:bookingId/payment-status`

**Phase 2: Auto-Create Invoices** `[x]` ✅ DONE
- [x] Backend: Create empty invoices when booking is created (one per player/seat)
- [x] Invoices initialized with base room price per seat + 10% tax
- [x] Ensure seed script creates invoices for existing bookings (already done)

**Phase 3: Integrate Orders** `[x]` ✅ DONE
- [x] Load existing orders from backend on page load via `getInvoices()`
- [x] Replace localStorage `addItemToSeat()` with API call to `createOrder()`
- [x] Replace localStorage `removeOrderItem()` with API call to `deleteOrder()`
- [x] Added `updateOrder(orderId, quantity)` API function to backend and frontend
- [x] Updated `updateItemQuantity()` to use API call instead of local state
- [x] Backend auto-recalculates invoice totals after order changes
- [x] Updated calculation functions to use invoice data from backend
- [x] Removed localStorage dependency for orders (kept only UI prefs like tax rate)
- [x] Fixed menuItemId validation to accept string IDs (not just UUID)
- [x] **TESTED**: Created booking, added orders, updated quantities, all working!

**Phase 4: Integrate Payments** `[x]` ✅ DONE
- [x] Replace simulated `processPayment()` with real `payInvoice()` API call
- [x] Backend marks invoice as PAID, updates booking status if all seats paid
- [x] Refresh invoice/payment status after successful payment
- [x] Show proper loading/error states
- [x] **TESTED**: Paid 2 seats with different methods/tips, booking status→PAID

**Phase 5: Load Initial State from Backend** `[x]` ✅ DONE
- [x] On page load: fetch booking + invoices with orders
- [x] Populate `orderItems` state from backend Order data via `loadOrdersFromInvoices()`
- [x] Populate `seatPayments` state from backend Invoice data via `loadPaymentStatusFromInvoices()`
- [x] Set `numberOfSeats` based on booking.players
- [x] Removed localStorage order persistence (only UI prefs remain)

**Phase 6: Real-time Sync** `[x]` ✅ DONE
- [x] After adding order → refetch invoices to get updated totals
- [x] After deleting order → refetch invoices
- [x] After updating quantity → refetch invoices
- [x] After payment → refetch invoices and booking data
- [x] Show loading indicators during API calls (`orderLoading` state)
- [x] Handle API errors gracefully with try/catch and alerts

**Additional Features Completed:**
- [x] Payment cancellation/refund feature
  - [x] Added `PATCH /api/bookings/invoices/:invoiceId/unpay` endpoint
  - [x] "Cancel Payment" button on paid seats
  - [x] Confirmation dialog before canceling
  - [x] Resets invoice to UNPAID, clears payment data
  - [x] Updates booking paymentStatus when payment canceled
- [x] Invoice initialization improvements
  - [x] Invoices start at $0 (no base room price)
  - [x] Updated bookingSimple.ts and seed.ts
  - [x] Only order totals included in invoice calculations
- [x] Booking completion enhancements
  - [x] Sets `completedAt` timestamp when marked as COMPLETED
  - [x] Clears `completedAt` if status changes from COMPLETED
  - [x] Admin has flexibility to complete without payment validation
- [x] Type safety fixes
  - [x] Fixed Decimal to number conversions throughout
  - [x] Proper parseFloat handling for backend Decimal values
  - [x] Fixed TypeScript compilation errors in orderRepo and booking routes

#### Manual Testing Checklist:

**Test 1: Order Management** ✅ PASSED
- [x] Open booking detail page
- [x] Verify existing orders load from database (if any)
- [x] Add menu item to Seat 1 → verify POST to `/api/bookings/:id/orders`
- [x] Check database: verify Order record created with correct seatIndex
- [x] Verify invoice subtotal/tax/total updated automatically
- [x] Remove order → verify DELETE to `/api/bookings/orders/:orderId`
- [x] Check database: verify Order deleted and invoice recalculated

**Test 2: Multiple Seats & Orders** ✅ PASSED
- [x] Increase seats to 3
- [x] Add different items to each seat
- [x] Verify each order saved with correct seatIndex (1, 2, 3)
- [x] Check database Invoice table: verify 3 invoices exist (one per seat)
- [x] Verify each invoice has correct subtotal from its seat's orders

**Test 3: Payment Collection** ✅ PASSED
- [x] Add orders to Seat 1
- [x] Click "Collect Payment" on Seat 1
- [x] Select payment method (CARD/CASH), add optional tip
- [x] Click "Confirm Payment"
- [x] Verify PATCH to `/api/invoices/:invoiceId/pay`
- [x] Check database: Invoice status = 'PAID', paidAt timestamp set
- [x] Verify seat shows green "PAID" badge
- [x] Verify Payment Summary updates (paid count, progress bar)

**Test 4: Complete Booking** ✅ PASSED
- [x] Pay all seats for a booking
- [x] Verify booking paymentStatus changes to 'PAID'
- [x] Click "Complete Booking"
- [x] Verify booking bookingStatus changes to 'COMPLETED'
- [x] Verify completedAt timestamp set

**Test 5: Persistence** ✅ PASSED
- [x] Add orders and pay some seats
- [x] Close browser tab
- [x] Reopen booking detail page
- [x] Verify all orders still shown (loaded from database)
- [x] Verify paid seats still show PAID status
- [x] Verify unpaid seats still show UNPAID with correct totals

**Test 6: Error Handling** ✅ PASSED
- [x] Try adding order with invalid menuItemId → verify error message
- [x] Try paying already-paid invoice → verify error handled
- [x] Disconnect backend → verify graceful error messages
- [x] Reconnect → verify page recovers and syncs data

**Test 7: Invoice Recalculation** ✅ PASSED
- [x] Add 3 items to Seat 1
- [x] Note the invoice total
- [x] Delete 1 item
- [x] Verify invoice total decreased automatically
- [x] Add item back
- [x] Verify invoice total increased again

**Test 8: Payment Cancellation (NEW)** ✅ PASSED
- [x] Pay invoice for a seat with CARD or CASH
- [x] Verify "Cancel Payment" button appears on paid seat
- [x] Click "Cancel Payment" → verify confirmation dialog
- [x] Confirm cancellation
- [x] Verify PATCH to `/api/bookings/invoices/:invoiceId/unpay`
- [x] Check database: Invoice status = 'UNPAID', paymentMethod/paidAt/tip cleared
- [x] Verify seat shows "Collect Payment" button again
- [x] Verify booking paymentStatus updates correctly
- [x] Verify invoice totals recalculated without tip

**Test 9: Zero-Amount Invoice Creation (NEW)** ✅ PASSED
- [x] Create new booking with 2 players
- [x] Verify invoices created with $0 totals (no room price)
- [x] Verify Payment Summary shows $0 before any orders added
- [x] Add orders → verify totals calculate correctly from $0 base
- [x] Tested with booking b7f5244d-9f5b-476e-9d71-4d2bd33c5da0

---

### 2. **Printable Bill Formatting** 
- **Priority:** HIGH
- **Component:** Web POS Booking Detail Page
- **Requirement:** Each bill must be nicely formatted and printable
- **Current State:** Basic print functionality exists but formatting needs improvement
- **Tasks:**
  - [ ] Design professional receipt layout (header, itemized list, totals, footer)
  - [ ] Add business branding (K-Golf logo, address, contact info)
  - [ ] Format currency properly with $ symbol and 2 decimals
  - [ ] Add print-specific CSS (hide buttons, optimize for paper)
  - [ ] Support different receipt types:
    - [ ] Individual seat bill (per-seat orders only)
    - [ ] Combined bill (all seats together)
    - [ ] Summary bill (totals only, no item details)
  - [ ] Add receipt metadata (date, time, booking #, room, staff name)
  - [ ] Test printing on actual receipt printer or A4 paper
  - [ ] Add print preview option
  - [ ] Handle tax breakdown display
  - [ ] Add payment method fields (for future: Card/Cash/Tips)
- **Impact:** HIGH - Required for customer checkout process
- **Estimated Time:** 2-4 hours

### 1.5 **Timeline Visual Enhancements** 🔥 CRITICAL
- **Priority:** VERY URGENT
- **Component:** Web POS Dashboard Timeline View (`frontend/src/pages/pos/dashboard.tsx`)
- **Requirement:** Improve timeline visualization with real-time indicators and better status filtering
- **Current State:** Basic timeline shows all bookings in a grid
- **Tasks:**
  - [ ] **Real-time Current Time Bar**
    - [ ] Add animated vertical line indicating current time
    - [ ] Update position every minute to follow timeline
    - [ ] Move smoothly across timeline as time progresses
    - [ ] Show current time label (HH:MM format)
    - [ ] Use distinct color (e.g., red or amber) to stand out
    - [ ] Only show bar during operating hours (9 AM - 10 PM)
  
  - [ ] **Past Booking Styling**
    - [ ] Detect if booking has already ended (endTime < now)
    - [ ] Display past bookings in grey or dark color (low contrast)
    - [ ] Apply visual distinction (opacity: 0.5 or specific grey color like slate-500)
    - [ ] Apply across all room columns in timeline
    - [ ] Differentiate from active/future bookings
  
  - [ ] **Status-Based Filtering**
    - [ ] Only show "CONFIRMED" bookings on timeline
    - [ ] Hide "CANCELLED" bookings completely
    - [ ] Hide "COMPLETED" bookings (optional: or show in light grey)
    - [ ] Add filter controls (checkboxes) to toggle booking status visibility
    - [ ] Remember filter preference per session
    - [ ] Show booking count by status in legend
  
  - [ ] **Implementation Details**
    - [ ] Calculate current time position: `(currentHour - 9) / 13 * 100%`
    - [ ] Use `setInterval()` to update bar position every 60 seconds
    - [ ] Add CSS animation for smooth position transitions
    - [ ] Filter bookings by `booking.bookingStatus === 'CONFIRMED'`
    - [ ] Check `booking.endTime < new Date()` for past detection
  
  - [ ] **Testing**
    - [ ] Verify bar moves smoothly across timeline
    - [ ] Verify bar disappears after 10 PM
    - [ ] Verify past bookings appear grey
    - [ ] Verify cancelled bookings don't show
    - [ ] Test on different dates and times
    - [ ] Test with multiple rooms and bookings
  
- **Impact:** HIGH - Better UX for staff monitoring room status in real-time
- **Estimated Time:** 2-3 hours

### 2. **Payment Completion Workflow** 🟡 PLANNING
- **Priority:** HIGH (needs customer confirmation first)
- **Component:** Web POS Booking Detail + Backend
- **Requirement:** Define and implement payment completion process
- **Questions for Customer:**
  - [ ] When should payment status change? (before/after bill printed?)
  - [ ] Do you collect payment before or after service?
  - [ ] Should "Complete Booking" be blocked until payment received?
  - [ ] How do you track Card vs Cash vs Tips?
  - [ ] Do you need payment history/audit log?
  - [ ] Should payment update room status color?
  
- **Proposed Workflow Options:**
  
  **Option A: Simple Flow (Payment at End)**
  ```
  1. Customer plays → 2. Staff prints bill → 3. Customer pays → 4. Staff marks "Paid" → 5. Complete booking
  ```
  
  **Option B: Advanced Flow (Payment Before Completion)**
  ```
  1. Customer plays → 2. Issue Bill (changes room to RED) → 3. Collect Payment (Card/Cash/Tip) → 4. Mark Paid (room to BLUE) → 5. Complete Booking
  ```

### 3. **Book Keeping (Financial Records)** 🟡 HIGH
- **Priority:** HIGH - Essential for business operations and tax compliance
- **Component:** Web POS Admin Dashboard + Backend
- **Requirement:** Track and record all financial transactions for accounting and tax purposes
- **Features Needed:**
  - [ ] Daily sales report (by payment method: Card/Cash/Tips)
  - [ ] Monthly revenue summary
  - [ ] Transaction history with timestamps and staff attribution
  - [ ] Void/Refund tracking with reasons
  - [ ] Tax calculation per transaction
  - [ ] Export to CSV/Excel for accounting software
  - [ ] Reconciliation report (expected vs actual)
  - [ ] Payment method breakdown (Card vs Cash)
  - [ ] Employee/staff performance metrics (sales per staff)
  - [x] Discount/coupon tracking
  - [ ] Period-based reports (daily, weekly, monthly, custom date range)
- **Database Considerations:**
  - [ ] Ensure all transactions logged with proper timestamps
  - [ ] Add transaction ID for reconciliation
  - [ ] Track voided/cancelled bookings separately (audit trail)
  - [ ] Store payment method and staff attribution per booking
  - [ ] Add notes field for refunds/adjustments
- **Integration Points:**
  - [ ] Link to booking completion (when does revenue get recorded?)
  - [ ] Link to payment collection (when is payment final?)
  - [ ] Link to cancellation process (refund handling)
- **Impact:** HIGH - Legal/tax compliance requirement
- **Estimated Time:** 4-6 hours

### 4. **Customer Booking** 🟡 MEDIUM
- **Priority:** MEDIUM - Customer-facing feature
- **Component:** Frontend Web App `/booking` page
- **Requirement:** Customers can browse available times and make online bookings
- **Current State:** Basic booking page with custom TimePicker, real API integration
- **Features Already Complete:**
  - [x] Room selection with capacity/price info
  - [x] Calendar date picker
  - [x] Custom time picker (12-hour format, 00-59 minutes)
  - [x] Visual timeline showing existing bookings
  - [x] Real-time availability checking
  - [x] Auto-calculated end time based on players
  - [x] Booking creation via API
- **Enhancements Needed:**
  - [ ] Customer account login requirement (pre-booking)
  - [ ] Pre-populated customer info (name, phone, email)
  - [ ] Email confirmation after booking
  - [ ] Booking cancellation option (24 hours before?)
  - [ ] Booking modification (change date/time if available)
  - [ ] QR code for easy venue check-in
  - [ ] SMS reminders (24 hours before, 1 hour before)
  - [ ] Add to calendar (Google Calendar, iCal export)
  - [ ] Group booking support (multiple rooms)
  - [ ] Waitlist if no availability
  - [x] Promo code/coupon application
  - [ ] Special requests/notes field
- **Impact:** MEDIUM - Improves customer experience and reduces phone bookings
- **Estimated Time:** 3-5 hours (per feature)

### 5. **Customer Dashboard** 🟡 MEDIUM
- **Priority:** MEDIUM - Customer portal feature
- **Component:** Frontend Web App `/dashboard` (customer view)
- **Requirement:** Customers can view and manage their bookings
- **Features Needed:**
  - [ ] Upcoming bookings list (next 30 days)
  - [ ] Past bookings history
  - [ ] Booking status (confirmed, completed, cancelled)
  - [ ] Quick booking buttons (rebook same room/time)
  - [ ] Cancel booking option with deadline
  - [ ] Modify booking (if slots available)
  - [ ] View receipt/invoice for past bookings
  - [ ] Loyalty program status (visit count, rewards earned)
  - [ ] Payment method on file management
  - [ ] Notification preferences (email, SMS)
  - [ ] Account settings (name, phone, email, password)
  - [ ] Download receipt/invoice as PDF
  - [ ] Referral/invite friends section
- **Integration Points:**
  - [ ] Link to customer booking page for new bookings
  - [ ] Link to profile/settings page
  - [x] Display loyalty rewards/coupons
  - [ ] Show upcoming reminders
- **Impact:** MEDIUM - Enhances customer experience and retention
- **Estimated Time:** 4-6 hours
  
  **Option C: Flexible Flow (Payment Optional)**
  ```
  1. Customer plays → 2. Print bill (optional) → 3. Complete booking (payment tracked separately)
  ```

- **Implementation Tasks (Once Confirmed):**
  - [ ] Add payment collection UI (Card/Cash/Tip input fields)
  - [ ] Add "Mark as Paid" button with confirmation
  - [ ] Update room status based on payment (if needed)
  - [ ] Store payment details in database (paymentMethod, tipAmount, paidAt)
  - [ ] Add payment receipt option (separate from order receipt)
  - [ ] Update booking completion logic (require payment or not?)
  - [ ] Add payment status indicator in dashboard
  - [ ] Test complete payment workflow

- **Database Fields Already Available:**
  - `paymentStatus`: 'UNPAID' | 'BILLED' | 'PAID'
  - `billedAt`: DateTime?
  - `paidAt`: DateTime?
  - `paymentMethod`: 'CARD' | 'CASH'
  - `tipAmount`: Decimal?

- **Impact:** MEDIUM-HIGH - Affects daily operations
- **Estimated Time:** 4-6 hours (after requirements confirmed)

## 🐛 Active Issues & Bugs

### Priority: CRITICAL 🔥

**0a. Hardcoded 10% Tax Rate in Booking Invoice Calculation** ✅ FIXED
- **Status:** 🟢 RESOLVED (2025-03-17)
- **Reported:** 2025-03-17
- **Component:** Backend booking repository (`backend/src/repositories/bookingRepo.ts`, `backend/src/routes/booking.ts`)
- **Issue:**
  - `bookingRepo.ts` had `const TAX_RATE = 0.1` (10%) hardcoded instead of reading the 14% rate from the DB `Setting` table
  - `booking.ts` `getGlobalTaxRate()` was missing `/100` division — returned `14` instead of `0.14`
  - All invoices created since the tax rate change were calculated at 10% instead of 14%
- **Root Cause:**
  - Original code hardcoded `TAX_RATE = 0.1` in bookingRepo and never updated it when DB tax rate changed
  - Secondary bug: `getGlobalTaxRate()` in booking.ts read from DB but forgot to divide by 100
- **Fix Applied:** (2025-03-17)
  - Added `async getGlobalTaxRate()` to bookingRepo that reads `global_tax_rate` from Setting table, divides by 100, defaults to 0.13
  - Fixed booking.ts to also divide by 100
  - Corrected 45 UNPAID invoices on prod via SQL UPDATE (recalculated tax and totalAmount at 14%)
  - Commit: `794757d`
- **Impact:** All new bookings now calculate tax correctly from DB setting. 45 historical invoices corrected.

**0b. Collect Payment Dialog — Tip/Amount Sync Bugs** ✅ FIXED
- **Status:** 🟢 RESOLVED (2025-03-17)
- **Reported:** 2025-03-17
- **Component:** Web POS Booking Detail (`frontend/src/pages/pos/booking-detail.tsx`)
- **Issues Fixed:**
  1. **Tip not updating payment amount:** Entering a tip didn't recalculate the total payment amount — staff had to manually add tip to amount
  2. **Duplicate payments for tip:** Backend created two separate payment records (one for base, one for tip) instead of a single combined payment
  3. **Existing tip not visible:** If a tip was already saved on the invoice (from a prior partial payment), it wasn't shown in the dialog
- **Fix Applied:** (2025-03-17)
  - Tip `onChange` now recalculates and sets `paymentDialogAmount` dynamically
  - FE sends total amount (base + tip) as a single payment; backend `addSinglePayment()` handles tip accumulation
  - Dialog now displays existing tip from DB with "(already added)" label
  - Added invoice breakdown (subtotal, tax, tip, total) in the payment dialog
  - Commit: `abd6ca5`
- **Impact:** Staff can now enter tips without manual math; no more duplicate payment records

**0c. UNPAID Badge Bug — Empty Seats Blocking Paid Status** ✅ FIXED
- **Status:** 🟢 RESOLVED (2025-03-17)
- **Reported:** 2025-03-17
- **Component:** Backend invoice repository (`backend/src/repositories/invoiceRepo.ts`)
- **Issue:**
  - `checkAllInvoicesPaid()` counted ALL invoices with `paymentStatus != 'PAID'`, including empty seats with $0 subtotal
  - Empty seats (no orders) had `paymentStatus = 'UNPAID'` and `subtotal = 0`, which blocked the booking from being marked PAID
  - Bookings showed "UNPAID" badge even when all real seats were fully paid
- **Fix Applied:** (2025-03-17)
  - Added `subtotal: { gt: 0 }` filter to `checkAllInvoicesPaid()` so empty seats are excluded
  - Corrected 182 bookings on prod via SQL UPDATE (set empty-seat invoices to PAID, updated booking paymentStatus)
  - Commit: `f0e68bc`
- **Impact:** Bookings now correctly show PAID when all seats with orders are paid, regardless of empty seats

**1. Web POS - Booking Detail Actions Panel Empty** ✅ FIXED
- **Status:** 🟢 RESOLVED - 2025-11-25
- **Reported:** 2025-11-25
- **Component:** Web POS Booking Detail (`frontend/src/pages/pos/booking-detail.tsx`)
- **Issue:**
  - Actions panel shows no buttons for active bookings
  - Checking `booking.status === 'confirmed'` but API returns `'booked'`
  - Field mismatch: code checks `status` which has presentStatus values ('booked'/'completed'/'canceled')
  - Should check `booking.bookingStatus` for raw values ('CONFIRMED'/'COMPLETED'/'CANCELLED')
- **Root Cause:**
  - Backend `presentBooking()` returns both fields:
    - `status`: computed display value ('booked'|'completed'|'canceled')
    - `bookingStatus`: raw database value ('CONFIRMED'|'COMPLETED'|'CANCELLED')
  - Web UI checks wrong field with wrong values
- **Fix Applied:** (2025-11-25)
  - Changed all 3 conditions to use `booking.bookingStatus` instead of `booking.status`
  - Updated to uppercase values: 'CONFIRMED', 'CANCELLED', 'COMPLETED'
  - Fixed lines 843, 857, 862 in booking-detail.tsx
  - Commit: b821720 + follow-up fix commit
- **Impact:** Staff can now complete, cancel, and restore bookings from detail page
- **Testing:** Verify buttons appear and function correctly on production

**2. Web POS - Room Status Cards Showing Incorrect Bookings** ✅ FIXED
- **Status:** � RESOLVED (2025-11-25)
- **Reported:** 2025-11-23
- **Component:** Web POS Dashboard (`frontend/src/pages/pos/dashboard.tsx`)
- **Issues Fixed:**
  1. **Timezone Bug:** Used `toISOString()` which converted dates to UTC
     - Booking at 11:30pm PST Nov 24 showed as Nov 25 in UTC
     - "Today" comparison failed due to UTC/local mismatch
     - **Fix:** Use local timezone methods (`getFullYear()`, `getMonth()`, `getDate()`)
  2. **Pagination Bug:** API only returned first 10 bookings by default
     - Bookings beyond page 1 weren't loaded
     - **Fix:** Implemented separate API calls with date range filters
- **Solution Implemented:**
  - **Room Status:** Loads only today's bookings (0:00-23:59 local time)
  - **Timeline:** Loads current week's bookings (Monday-Sunday)
  - Dual API calls merged and deduplicated by booking ID
  - Backend added `startDate`/`endDate` query parameters
- **Performance Benefits:**
  - Reduced data transfer (today + week vs all bookings)
  - Typical load: 10-50 bookings instead of 100+ or 1000+
  - Independent refresh strategies for room status and timeline
- **Testing Completed:**
  - [x] Room cards show correct bookings for today
  - [x] Status colors accurate (green=empty, yellow=occupied)
  - [x] Empty rooms display "No booking"
  - [x] Bookings update on 5-second poll
  - [x] Works across all 4 rooms
- **Commits:** 
  - Timezone fix & pagination optimization (commit 5cf4243, 2025-11-25)
  - Reference: Timeline timezone fix (commit 43bbac8, 2025-11-20)

**2. POS Dashboard - Timeline and Room Status Refresh Issues** ✅ FIXED
- **Status:** 🟢 RESOLVED (2025-11-20)
- **Issues Fixed:**
  1. **Timezone bugs in date handling:**
     - Fixed `BookingContext`: Extract booking date using local timezone methods instead of `toISOString()`
     - Fixed `DashboardPage`: Compare dates using local timezone strings
     - Fixed `dateKey()`: Return local date string instead of UTC
     - Fixed `isBookingActive()`: Create Date objects using local timezone constructor
  2. **Timeline not showing bookings on initial load:**
     - Root cause: Two competing fetches (Timeline week fetch + Today fetch) overwriting each other
     - Solution: Removed duplicate Today fetch, Timeline week fetch now covers both
     - Today's bookings now filtered from week data instead of separate fetch
  3. **Timeline component not re-rendering:**
     - Added dynamic key prop to TimelineView component: `key={timeline-${length}-${firstId}}`
     - Improved day keys to include booking count: `key={dayKey}-${bookingCount}`
- **Result:** Bookings now display correctly in room status cards and timeline after restart
- **Commits:** Multiple fixes culminating in commit 43bbac8

### Priority: HIGH

**1. Customer Booking Page - Enhanced with Custom TimePicker** ✅ COMPLETED
- **Status:** 🟢 Resolved (2025-11-26)
- **Reported:** 2025-11-25 (after production database seeding)
- **Component:** Customer-facing booking page
- **Issue:** Initially no available time slots, enhanced with custom time picker
- **Solution Implemented:**
  - [x] Created custom TimePicker component with 12-hour format
  - [x] Changed from 15-minute intervals to full minute selection (00-59)
  - [x] Added scrollable minute picker with compact design
  - [x] Integrated real-time booking data from backend API
  - [x] Added visual timeline showing existing bookings and conflicts
  - [x] Replaced mock data with GET /api/bookings/by-room-date endpoint
  - [x] Auto-calculated end time based on number of players (1 hour per player)
- **Backend Changes:**
  - [x] Added GET /api/bookings/by-room-date endpoint for timeline data
  - [x] Returns bookings with HH:mm time format for frontend visualization
- **Documentation:**
  - [x] Updated SITE_FLOW.md with enhanced booking features
  - [x] Updated README.md with TimePicker and timeline API details
- **Impact:** HIGH - Improved booking UX with precise time selection and availability visualization
- **Commit:** 621b011 "Add custom TimePicker and integrate booking timeline API"

**2. Print Queue & Thermal Printer Integration** 🔮 FUTURE
- **Status:** 🟡 Deferred to Future Phase
- **Component:** POS Printing System
- **Requirement:** Backend print queue + standalone bridge service for thermal printers
- **Current State:** Using browser print dialog (works for receipts)
- **Architecture:**
  - Backend print queue service (PrintJob and PrintBridge models)
  - WebSocket for real-time job broadcasting
  - Standalone Node.js bridge service (Windows service / systemd)
  - Thermal printer support (ESC/POS, Epson/Star printers)
  - Web POS integration with queue-based printing
- **Implementation Tasks:**
  - [ ] Add PrintJob and PrintBridge models to Prisma schema
  - [ ] Create print queue service with job lifecycle management
  - [ ] Add REST API endpoints (POST /api/print/receipt, GET /api/print/jobs)
  - [ ] Implement WebSocket server for real-time job broadcasting
  - [ ] Create standalone bridge service package
  - [ ] Add thermal printer support (node-thermal-printer)
  - [ ] Format receipts with ESC/POS commands
  - [ ] Package as Windows service / systemd service
  - [ ] Update web POS to use queue-based printing
  - [ ] Install bridge service on venue computer
  - [ ] Test with real thermal printer hardware
- **Priority:** LOW - Current browser print works, implement only if thermal printer needed
- **Estimated Effort:** 10-12 days (backend 4-5 days, bridge service 3-4 days, integration 3 days)

**3. Booking Status Implementation (bookingStatus + paymentStatus)**
- **Status:** 🔴 Open
- **Component:** Full Stack (Backend + Frontend + POS)
- **Requirement:** Implement dual-status system for booking lifecycle and payment workflow tracking
- **Description:** Add `bookingStatus` (lifecycle) and `paymentStatus` (payment workflow) fields to properly track room status during operation
- **Documentation:** See README.md "Booking Status Fields" section

#### Backend Tasks
- [x] **Database Migration** ✅ COMPLETED
  - [x] Rename `status` column to `bookingStatus` in Booking model
  - [x] Add `paymentStatus` column (String, default "UNPAID")
  - [x] Add `billedAt` column (DateTime?, nullable)
  - [x] Add `paidAt` column (DateTime?, nullable)
  - [x] Add `paymentMethod` column (String?, nullable)
  - [x] Add `tipAmount` column (Decimal?, nullable)
  - [x] Create Prisma migration file (20251118075727_add_booking_payment_status)
  - [x] Generate Prisma client with new fields
  - [x] Update seed script to use new field names (past bookings = COMPLETED/PAID)

- [x] **API Updates** ✅ COMPLETED
  - [x] Update booking creation endpoints (all 3) to set `bookingStatus=CONFIRMED`, `paymentStatus=UNPAID`
  - [x] Create `PATCH /api/bookings/:id/payment-status` endpoint (admin only)
    - [x] Accept paymentStatus, paymentMethod, tipAmount
    - [x] Set `billedAt` timestamp when changing to BILLED or PAID
    - [x] Set `paidAt` timestamp when changing to PAID
    - [x] Use updatePaymentStatus() repository method
  - [x] Update presentBooking() to include all payment fields in response
  - [x] Update cancellation check to use `bookingStatus` field (CANCELLED spelling)
  - [x] Update room hours validation to use `bookingStatus` field
  - [x] Update presentStatus() helper to use `bookingStatus` parameter

- [x] **Repository Layer** ✅ COMPLETED
  - [x] Update `bookingRepo.ts` to handle new fields
  - [x] Add `updatePaymentStatus()` method
  - [x] Add `updateBookingStatus()` method
  - [x] Update TypeScript interfaces (CreateBookingInput, UpdatePaymentStatusInput)

- [ ] **Testing**
  - [ ] Unit tests for payment status transitions
  - [ ] Integration tests for booking workflow
  - [ ] Test payment status validation rules
  - [ ] Test backward compatibility with existing bookings

#### Frontend Web App Tasks
- [x] **Type Updates** ✅ COMPLETED
  - [x] Update Booking interface (ApiBooking) to include payment fields
  - [x] Add paymentStatus, billedAt, paidAt, paymentMethod, tipAmount fields
  - [x] Backend already sends 'status' (computed from bookingStatus) for UI compatibility

- [ ] **UI Updates**
  - [ ] Update booking display to show payment status
  - [ ] Add payment status badges/indicators
  - [ ] Update admin dashboard to filter by payment status
  - [ ] Add payment status column to booking tables
  - [ ] Add payment status update UI (admin only)

- [ ] **Testing**
  - [ ] Test UI with new status fields
  - [ ] Test status display and filtering

#### POS Electron App Tasks
- [x] **SQLite Schema** ✅ COMPLETED
  - [x] Add schema versioning system (PRAGMA user_version)
  - [x] Create migration 1: Add bookingStatus and payment columns
  - [x] Migrate existing data (status → bookingStatus, CANCELED → CANCELLED)
  - [x] Set paymentStatus=PAID for completed bookings
  - [x] Update sync.ts to upsert new fields from backend
  - [x] Update bookings.ts to create with bookingStatus/paymentStatus
  - [x] Update main.ts IPC handler to use bookingStatus

- [x] **Type Updates** ✅ COMPLETED
  - [x] Update BookingContext.tsx Booking interface with payment fields
  - [x] Add backward compatibility for old 'status' field in mapper
  - [x] Handle both CANCELED and CANCELLED spellings
  - [x] Add paymentStatus, billedAt, paidAt, paymentMethod, tipAmount fields

- [ ] **Sync Engine**
  - [ ] Update `bookings:pull` to sync new fields
  - [ ] Update `bookings:push` (if needed) for payment status
  - [ ] Test bidirectional sync of payment status

- [x] **Dashboard UI - Basic Display** ✅ COMPLETED
  - [x] Add getPaymentStatusColor() helper function
  - [x] Display payment status badges in booking list (Unpaid/Billed/Paid with icons)
  - [x] Show payment status in booking detail page header

- [x] **Booking Detail Page - Display** ✅ COMPLETED
  - [x] Add Payment Information card
  - [x] Display payment status badge
  - [x] Show payment method (CARD/CASH)
  - [x] Show billedAt and paidAt timestamps
  - [x] Display tip amount

- [ ] **Payment Workflow UI (Future Enhancement)**
  - [ ] Add "Issue Bill" button in detail page (UNPAID → BILLED)
  - [ ] Add payment collection modal:
    - [ ] Payment method selector (CARD | CASH)
    - [ ] Tip amount input
    - [ ] "Mark as Paid" button (BILLED → PAID)
  - [ ] Update room status colors based on payment status
  - [ ] Add payment action buttons to room cards in dashboard
    - [ ] "Mark as Paid" button (updates to PAID, sets paidAt)
  - [ ] Show payment history (billedAt, paidAt timestamps)
  - [ ] Disable "Complete Booking" until paymentStatus=PAID

- [ ] **IPC Bridge**
  - [ ] Add `bookings:update-payment-status` IPC handler
  - [ ] Expose payment status update method in preload.ts
  - [ ] Add proper error handling and validation

- [ ] **Testing**
  - [ ] Test payment workflow: UNPAID → BILLED → PAID
  - [ ] Test room card color changes
  - [ ] Test action buttons on dashboard
  - [ ] Test payment method and tip amount capture
  - [ ] Test sync of payment status across terminals
  - [ ] Test offline mode (queue payment updates)

#### Documentation
- [x] Document status fields in README.md
- [ ] Update API documentation with new endpoints
- [ ] Add payment workflow diagram to docs
- [ ] Document payment status transition rules
- [ ] Add examples for common scenarios

#### Rollout Plan
1. **Phase 1: Backend**
   - Create migration and update API
   - Deploy to staging, test with existing data
   - Verify backward compatibility

2. **Phase 2: Frontend Web**
   - Update types and UI
   - Deploy to staging
   - Test booking display and status updates

3. **Phase 3: POS App**
   - Update local schema and sync
   - Update dashboard UI with new workflow
   - Test on development POS terminal

4. **Phase 4: Production**
   - Deploy backend migration during maintenance window
   - Deploy frontend and POS updates
   - Monitor for issues
   - Train staff on new payment workflow

**Impact:** HIGH - Core feature affecting all booking operations and room status tracking
**Priority:** HIGH - Needed for proper POS workflow implementation
**Estimated Effort:** 3-5 days across all components

---

## Phase 1.3: Simplified Booking Status & Full POS Invoice System

> **Started:** November 30, 2025
> **Scope:** Simplify booking lifecycle + implement per-seat invoicing with menu items
> **Estimated Effort:** 22-32 hours across 5 phases
> **Priority:** HIGH - Foundation for core POS workflow

### Overview
Replace complex booking status with simplified states (BOOKED/COMPLETED/CANCELLED/EXPIRED) and implement full POS invoice system with per-seat billing, order tracking, and payment collection.

### ✅ Phase 1.3.1: Database Schema Foundation (2-3 hours)
- [x] **Update Booking Model**
  - Keep: `price` field (total price: players × hours × $50/hour)
  - Keep: `invoices: Invoice[]`, all payment fields
  
- [x] **Create Order Model (NEW)**
  - Fields: id, bookingId, menuItemId, seatIndex, quantity, unitPrice, totalPrice
  - Relations: Booking (FK), MenuItem (FK)
  - Indexes: bookingId, seatIndex
  
- [x] **Simplify Invoice Model**
  - Remove: customerName, refundedAt, refundReason, notes, recordedBy
  - Keep: seatIndex, status (UNPAID/PAID), paymentMethod, paidAt
  - Add: subtotal, tax, tip, totalAmount (calculated from orders)
  
- [x] **Update MenuItem Model**
  - Add relation: `orders: Order[]`

- [x] **Testing**
  - Validate schema syntax with `prisma validate`
  - Generate updated Prisma client

### ✅ Phase 1.3.2: Database Migration (1 hour)
- [x] **Create Migration File**
  - File: `backend/prisma/migrations/20251130_add_orders_and_simplify_invoices/migration.sql`
  - Actions:
    - [x] Create Order table with indexes
    - [x] Drop unused Invoice fields (customerName, refundedAt, refundReason, notes, recordedBy)
    - [x] Add new Invoice fields (subtotal, tax, tip, totalAmount)
    - [x] Update existing bookingStatus: CONFIRMED → BOOKED
    - [x] Update existing bookings: ensure price field is populated

- [x] **Run Migration Locally**
  - [x] Test migration with `prisma db push --force-reset`
  - [x] Verify no data loss
  - [x] Check all indexes created

### ✅ Phase 1.3.3: Backend Repository Layer (4-6 hours)

#### BookingRepo Updates
- [x] **createBooking()**
  - Auto-create N invoices (1 per seat)
  - Divide total price equally among seats: `price / players` per seat
  - Set each invoice subtotal to seat price
  - Calculate tax from global setting
  
- [x] **New Functions:**
  - [x] `completeBooking(id)` - Mark COMPLETED with completedAt timestamp
  - [x] `markBookingExpired(id)` - Set status EXPIRED (for scheduled job)
  - [x] `updateBookingStatus(id, status)` - Admin override
  - [x] `cancelBooking(id)` - Only allows BOOKED → CANCELLED

#### Create OrderRepo (NEW)
- [x] **createOrder(bookingId, menuItemId, seatIndex, quantity)**
  - Create order record
  - Recalculate associated invoice totals
  
- [x] **deleteOrder(id)**
  - Remove order
  - Recalculate invoice
  
- [x] **getOrdersByBooking(bookingId)**
  - Return all orders for booking
  
- [x] **getOrdersBySeat(bookingId, seatIndex)**
  - Return orders for specific seat

#### Create InvoiceRepo (NEW)
- [x] **getInvoiceBySeat(bookingId, seatIndex)**
  - Return single invoice with all line items
  
- [x] **getAllInvoices(bookingId)**
  - Return all invoices for booking
  
- [x] **updateInvoicePayment(bookingId, seatIndex, paymentMethod, tip?)**
  - Update invoice status, paymentMethod, paidAt, tip
  - Check if all invoices now paid → update Booking.paymentStatus
  
- [x] **recalculateInvoice(bookingId, seatIndex)**
  - Sum all orders for that seat
  - Add tax calculation
  - Update subtotal, tax, totalAmount

### 🔜 Phase 1.3.4: Backend API Routes (3-4 hours)

#### Update Existing Endpoints
- [x] **POST /api/bookings** 
  - Keep price calculation: `players * hours * $50/hour`
  - Auto-generate invoices on creation (1 per seat)
  - Split total price equally: `price / players` per seat
  - Return: booking with invoices
  
- [x] **PATCH /api/bookings/:id/cancel**
  - Only allows BOOKED status
  - Cannot cancel COMPLETED
  - Return: updated booking
  
- [x] **GET /api/bookings/:id**
  - Include invoices with orders
  - Include payment status

#### Create New Endpoints
- [x] **POST /api/bookings/:bookingId/orders**
  - Body: `{ menuItemId, seatIndex, quantity }`
  - Auto-lookup menuItem for unitPrice
  - Recalculate invoice totals
  - Return: `{ order, updatedInvoice }`
  
- [x] **DELETE /api/bookings/orders/:orderId**
  - Recalculate associated invoice
  - Return: `{ success, updatedInvoice }`
  
- [x] **GET /api/bookings/:bookingId/invoices**
  - Return: `[{ seatIndex, subtotal, tax, tip, totalAmount, status, paymentMethod, orders[] }]`
  
- [x] **PATCH /api/invoices/:invoiceId/pay**
  - Body: `{ bookingId, seatIndex, paymentMethod, tip? }`
  - Update invoice status to PAID
  - Check if all invoices paid → update booking.paymentStatus
  - Return: `{ invoice, bookingPaymentStatus }`
  
- [x] **GET /api/bookings/:bookingId/payment-status**
  - Return: `{ seats: [{ seatIndex, paid, totalAmount, paymentMethod }], allPaid, remaining, totalRevenue }`
  
- [x] **POST /api/bookings/:bookingId/complete**
  - Requires: All invoices PAID
  - Updates: bookingStatus = COMPLETED, completedAt = now
  - Return: updated booking

### ✅ Phase 1.3.5: Database Seeding (1-2 hours)
- [x] **Update seed.ts**
  - [x] Create sample orders for existing bookings
  - [x] Generate invoices with line items (booking fee + orders)
  - [x] Split invoice totals equally per seat
  - [x] Create mix of paid/unpaid invoices
  - [x] Test different payment methods
  - [x] Update bookingStatus from CONFIRMED → BOOKED
  - [x] Ensure price field calculations are correct

- [x] **Test Seed**
  - Ready to run: `npm run db:seed`
  - Schema validated
  - Data generation logic implemented

### ✅ Phase 1.3.6: Frontend Components (6-8 hours)

#### Create New Components
- [x] **OrderForm.tsx** (NEW)
  - Select menu items
  - Choose seat (1-4)
  - Set quantity
  - Add to cart per seat
  - Show running total
  
- [x] **InvoiceDisplay.tsx** (NEW)
  - Show per-seat invoice breakdown
  - Display booking fee + orders as line items
  - Show subtotal, tax, total
  - Color-code by payment status
  
- [x] **PaymentForm.tsx** (NEW)
  - Accept payment per invoice
  - Payment method selection (CARD/CASH)
  - Tip entry
  - Mark as paid button
  - Show payment status
  
- [x] **PaymentSummary.tsx** (NEW)
  - Show all seats with status
  - Display total paid vs remaining
  - Show payment breakdown per seat

#### Update Existing Components
- [ ] **Dashboard Timeline**
  - Update to use new bookingStatus (BOOKED/EXPIRED)
  - Update filtering to only show BOOKED (hide CANCELLED/EXPIRED)
  
- [ ] **Booking Creation Modal**
  - Use price instead of basePrice
  - Auto-generate invoices on submit
  
- [ ] **Booking Detail View**
  - Show invoices instead of just payment status
  - Add order entry UI
  - Add payment UI
  - Show completion button (only if all paid)

### ⏳ Phase 1.3.7: Testing & Validation (3-4 hours)

#### Unit Tests
- [ ] **bookingRepo.test.ts**
  - Create booking auto-generates invoices
  - Invoice totals calculate correctly
  - Status transitions work properly
  
- [ ] **orderRepo.test.ts**
  - Create order updates invoice
  - Delete order recalculates invoice
  - Multi-order calculations
  
- [ ] **invoiceRepo.test.ts**
  - Mark paid updates booking
  - All paid detection works
  - Tax calculations correct

#### E2E Tests
- [~] **E2E Test Infrastructure (Playwright)** 🔄 IN PROGRESS (2025-12-19)
  - [x] Playwright installed and configured
  - [x] 4 test suites created (19 tests total):
    - `01-signup-flow.spec.ts` - User registration (4 tests)
    - `02-booking-flow.spec.ts` - Booking creation (4 tests)
    - `03-pos-order-flow.spec.ts` - POS orders (4 tests)
    - `04-admin-management.spec.ts` - Admin functions (7 tests)
  - [x] Auto-server startup configured (`test:e2e:full` command)
  - [x] GitHub Actions workflow created (disabled)
  - [x] Fixed webpack dev server crashes during test runs
  - [x] Fixed test selectors to match actual UI
  - [ ] **PAUSED** - Need to debug signup flow (backend not receiving request)
  - [ ] Fix login flow for booking/POS/admin tests
  - [ ] Update selectors to match real UI components
  - [ ] Consider adding data-testid attributes to components
  
- [ ] **booking-workflow.test.ts**
  - Create booking → invoices created
  - Add order → invoice updated
  - Pay invoice → marked PAID
  - Complete booking → requires all paid
  
- [ ] **payment-workflow.test.ts**
  - Partial payment scenarios
  - Multiple orders per seat
  - Payment method tracking
  - Tip handling

#### Manual Testing
- [ ] Create booking with 3 seats
- [ ] Add different orders to each seat
- [ ] Mark each paid individually
- [ ] Verify booking only completes when all paid
- [ ] Test dashboard filtering
- [ ] Test print functionality

### 📋 Checklist Before Starting

Answer these before implementation:

- [ ] Confirm tax calculation: Fixed global % or per-item?
- [ ] Confirm shared orders: Can one order apply to multiple seats?
- [ ] Confirm partial payments: Allow incomplete payment continuation?
- [ ] Confirm expiration threshold: 30 days OK?
- [ ] Confirm base price: $50/seat still correct?
- [ ] Confirm menu items: Any items excluded from invoices?
- [ ] Confirm print format: Receipt format for thermal printer?

---

**2. API Security & Authentication**
- **Status:** 🔴 Open
- **Component:** Backend API (`backend/src/`)
- **Requirement:** Protect API endpoints to ensure only authorized clients (POS, Frontend) can access
- **Current State:** APIs are accessible without proper authentication/authorization
- **Security Concerns:**
  - No API key mechanism
  - No rate limiting
  - No request validation for client source
- **Implementation Options:**
  1. API Key authentication for POS client
  2. JWT tokens with proper validation
  3. IP whitelisting for known clients
  4. Request signature validation
- **Next Steps:**
  - [ ] Choose authentication strategy (API keys vs JWT)
  - [ ] Implement middleware for API protection
  - [ ] Add API key management system
  - [ ] Document authentication flow
  - [ ] Update POS client to include credentials

**2. Logging System**
- **Status:** � Mostly Complete
- **Component:** Backend + POS (`backend/src/`, `pos/apps/electron/src/`)
- **Requirement:** Comprehensive logging for debugging, monitoring, and audit trails
- **Current State:** pino v9.9.0 + pino-http v11.0.0 with structured JSON logging
- **Completed:**
  - [x] Chose pino as logging library (commit d9ab4d9)
  - [x] Added request/response middleware logging (pino-http)
  - [x] Log authentication events (register, login, verify, password reset)
  - [x] Log all mutation operations — 33 success logs across 7 route files (commit e3bbc3f)
  - [x] Structured log format (timestamp, level, component, message)
  - [x] Error logging in all catch blocks
- **Remaining:**
  - [ ] Log rotation and retention policy
  - [ ] Searchable log storage
  - [ ] Error tracking integration (e.g., Sentry)
- **POS Logging:**
  - [ ] Implement electron-log configuration
  - [ ] Log sync operations with timestamps
  - [ ] Log IPC communication errors
  - [ ] Add crash reporting
- **Next Steps:**
  - [ ] Define log retention policy
  - [ ] Create log monitoring dashboard

**3. Fix Print Functionality - Seat-Specific Printing**
- **Status:** � In Progress
- **Component:** POS Admin Dashboard Print Feature (`pos/apps/electron/src/renderer/pages/BookingDetailPage.tsx`)
- **Requirement:** Make print functionality customizable per seat/room
- **Current Implementation:**
  - ✅ Added IPC handler `print:bill` in main.ts
  - ✅ Exposed `window.kgolf.printBill()` in preload.ts
  - ✅ Updated `handlePrintSeat()` to use Electron IPC approach
  - ✅ Creates hidden window with custom HTML for each seat
  - ✅ Filters orders by seat ID before printing
  - ✅ Shows seat items, subtotal, tax, and total
- **Features Implemented:**
  - Seat-specific bill generation with customer info
  - Professional receipt layout with K-GOLF header
  - Automatic calculation of seat subtotal, tax, and total
  - Print dialog for printer selection
- **Testing Needed:**
  - [ ] Test printing with multiple seats and orders
  - [ ] Verify calculations are correct
  - [ ] Test with different printers
  - [ ] Test error handling when no items on seat
- **Future Enhancements:**
  - [ ] Add print template customization (header, footer, logo)
  - [ ] Support batch printing (multiple seats at once)
  - [ ] Add silent printing option (skip dialog)
  - [ ] Add print preview functionality
  - [ ] Store print preferences per user
- **Impact:** High - critical for kitchen order management and workflow

**4. Thermal Printer Integration**
- **Status:** 🔴 Open
- **Component:** POS Printing System
- **Requirement:** Build connection to thermal printer for kitchen orders
- **Current State:** No thermal printer support, using browser print dialog
- **Technical Requirements:**
  - [ ] Research thermal printer protocols (ESC/POS, Star Line Mode)
  - [ ] Choose thermal printer library (node-thermal-printer, escpos)
  - [ ] Implement printer discovery and connection
  - [ ] Add printer status monitoring (paper out, offline, error)
  - [ ] Design receipt format for thermal printers (58mm or 80mm width)
  - [ ] Handle printer-specific ESC/POS commands
  - [ ] Add fallback to PDF/browser print if thermal printer unavailable
- **Printer Models to Support:**
  - [ ] Determine target thermal printer models
  - [ ] Test with common brands (Epson TM-series, Star TSP series)
  - [ ] Add USB and network (Ethernet/WiFi) printer support
- **Features:**
  - [ ] Auto-connect to configured printer on app startup
  - [ ] Queue print jobs if printer busy
  - [ ] Retry logic for failed prints
  - [ ] Print job history and logging
  - [ ] Settings UI for printer configuration
- **Impact:** High - essential for production kitchen workflow
- **Next Steps:**
  - [ ] Research and select thermal printer library
  - [ ] Acquire test thermal printer hardware
  - [ ] Implement proof-of-concept for USB thermal printing
  - [ ] Design kitchen receipt layout

**5. Dynamic Time Slot Suggestion Logic**
- **Status:** 🔴 Open
- **Component:** Frontend Booking System
- **Requirement:** Dynamic time slot suggestions based on actual booking end times
- **Example:** Walk-in books 1:22pm - 2:22pm → Suggest 2:27pm - 3:27pm (with 5min buffer)
- **Current State:** Not implemented (using fixed intervals or manual entry)
- **Impact:** Medium - affects booking efficiency and user experience
- **Implementation Notes:**
  - Backend: Calculate available slots from existing booking end times
  - Add configurable buffer time (5-15 minutes for cleanup)
  - Frontend: Display suggested time slots dynamically
- **Related:** Booking Availability & Time Slots (Project Specifications)
- **Next Steps:**
  - [ ] Create backend endpoint: GET /api/bookings/available-slots?roomId=X&date=Y
  - [ ] Add buffer time configuration to settings
  - [ ] Update frontend booking form with time slot suggestions
  - [ ] Add validation to prevent overlapping bookings

**6. User Lookup Feature (Missing)**
- **Status:** 🔴 Open
- **Component:** Admin Dashboard / Customer Management
- **Requirement:** Ability to search and view customer details
- **Current State:** Basic phone lookup exists in POS, needs enhancement
- **Features Needed:**
  - [ ] Search by phone, email, or name
  - [ ] Display customer booking history
  - [ ] Show total spent and last visit
  - [ ] Quick access to create booking for customer
  - [ ] Edit customer details
- **Impact:** Medium - affects customer service efficiency
- **Related:** Phase 1.3 (User Lookup API exists but limited UI)
- **Next Steps:**
  - [ ] Design user lookup UI (search bar + results list)
  - [ ] Add to admin dashboard as new tab/page
  - [ ] Integrate with existing GET /api/users/lookup endpoint
  - [ ] Add customer detail modal/page

### Priority: MEDIUM

**5. Web POS Input Styling Issue**
- **Status:** 🟡 Known Issue (Non-Critical)
- **Component:** Web POS Booking Modal (`frontend/src/pages/pos/booking-modal.tsx`)
- **Issue:** Input fields (customer name, email, duration, players) missing padding despite explicit className
- **Current State:**
  - Added explicit `h-9 px-3 py-2` classes to all Input components
  - Styling fix not working in browser (functionality unaffected)
  - Users can still enter data and create bookings successfully
- **Technical Details:**
  - Base Input component has `px-3 py-1` in shadcn/ui
  - Custom classes added: `h-9 px-3 py-2 bg-slate-900/50 border-slate-600 text-white focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500`
  - Potential Tailwind CSS specificity or merging issue
- **Next Steps:**
  - [ ] Investigate Tailwind className merging behavior
  - [ ] Try using cn() utility to properly merge classes
  - [ ] Check if custom bg color overrides padding
  - [ ] Consider using inline styles as workaround
  - [ ] Test with different Tailwind JIT compilation settings
- **Impact:** LOW - Cosmetic only, does not affect functionality
- **Priority:** Low - Can be fixed in future maintenance release

**6. Print Functionality Issues**
- **Status:** 🟡 Needs Refinement
- **Component:** POS Booking Detail (`pos/apps/electron/src/renderer/pages/BookingDetailPage.tsx`)
- **Issues:**
  - Print formatting needs improvement
  - Receipt layout inconsistent
  - Print preview not always accurate
- **Next Steps:**
  - [ ] Review CSS print styles
  - [ ] Test across different printers
  - [ ] Add print settings configuration

**6. Split Functionality Bug**
- **Status:** 🟡 Open
- **Component:** POS Booking Detail (Seat Management)
- **Symptom:** When deleting one split item, it doesn't merge back
- **Question:** Is this intended behavior or bug?
- **Next Steps:**
  - [ ] Clarify expected behavior with stakeholders
  - [ ] Document current split/merge logic
  - [ ] Implement merge-back if needed

**7. Booking Status Update Buttons Not Persisting**
- **Status:** 🟡 Open
- **Component:** POS Admin Dashboard (`pos/apps/electron/src/renderer/app/BookingContext.tsx`)
- **Symptom:** Reset/Complete/Cancel buttons only update UI, changes don't persist
- **Current Behavior:**
  - Buttons update React state (optimistic update)
  - Changes revert after page refresh
  - No database update or sync to backend
- **Root Cause:** `updateBookingStatus` only calls `setBookings()`, doesn't call IPC handler
- **Expected Behavior:**
  - Update local SQLite database
  - Mark booking as dirty for sync
  - Enqueue sync operation to backend
  - Persist across app restarts
- **Fix Required:** Make `updateBookingStatus` call `window.kgolf.updateBookingStatus()` like `updateRoomStatus` does
- **Impact:** Medium - booking status changes are lost, confusing for staff
- **Next Steps:**
  - [ ] Update `BookingContext.updateBookingStatus` to call IPC handler
  - [ ] Add optimistic update with rollback on error
  - [ ] Test status changes persist after refresh
  - [ ] Verify sync to backend works

**8. Menu Item Addition Not Updating SQLite**
- **Status:** 🟡 Open
- **Component:** POS Menu Management
- **Symptom:** Adding menu items doesn't persist to SQLite table
- **Impact:** Menu changes lost on app restart
- **Next Steps:**
  - [ ] Verify IPC handler for menu:create is called
  - [ ] Check SQLite write permissions
  - [ ] Add error logging for menu operations

### Priority: LOW

**8. Guest Checkout Data Collection**
- **Status:** 🟢 Enhancement
- **Component:** POS Booking Modal
- **Requirement:** Collect name and phone number for guest checkouts
- **Current State:** Guest bookings supported but minimal data collection
- **Next Steps:**
  - [ ] Add required fields validation for guest mode
  - [ ] Update guest booking flow with data collection form

---

## 📋 Project Specifications

### Business Requirements

**Overall Goal:** Simplify POS to focus only on essential operations (reference: NARU POS has many unused features)

**Core Operations:**
- **Centralized Booking Management:** All booking sources (Online/Phone/Walk-in) in one view
- **Room-Based Workflow:** Complete order-to-payment per room
  - View room status
  - Take orders per room/seat
  - Issue bills (per seat or combined)
  - Mark payment received (card/cash/tip)
  - Close out transactions
- **Monthly Sales Reporting:** Card sales / Cash sales / Tips

**Room Status Workflow (inspired by NARU POS):**
- 🟢 Green: Empty/Available
- 🟡 Yellow: Booked/Orders entered
- 🔴 Red: Bill issued (awaiting payment)
- 🟢 Green: Payment received & closed out

**Room Configuration:**
- Room 4: Supports both left-hand and right-hand players
- Rooms 1-3: Right-hand players only

**Booking Duration & Menu:**
- [x] Hours added as menu category (1-5 hours, $30-$150)
- [x] Auto-add booking hours to seat 1 on new bookings
- [x] Menu data migrated to SQLite for persistence

**Seat Management:**
- [x] Seats decoupled from player count
- [x] Max 10 seats with color coding
- [x] Validation prevents orphaning items when reducing seats

**Late Arrival Promotion:** Customers arriving 20+ minutes late get 1 hour free

**Score System:**
- Admin can manually enter player scores
- Track: Total hits, golf course name, final score
- Standard: 18 holes, 72 hits baseline (par)
- Scoring: Under 72 = negative score (e.g., -2)

**Authentication:** Phone number only (login/register for both online and POS)

**Billing:** 
- [x] Printing bill functionality (seat-specific)
- [ ] Payment tracking (card/cash/tip)
- [ ] Database schema for payment data

**Menu POS:**
- Will need checklist of what was served or not

**Booking Availability & Time Slots:**
- [x] **DECISION:** Unified time slot system (exact times for availability)
  - Walk-in bookings: Allow exact time selection (e.g., 1:12 PM)
  - Online booking availability: Based on actual end times (e.g., if walk-in ends 2:12 PM, next slot is 2:12 PM)
  - No rounding to standard intervals (:00, :30) - show real availability
- [ ] Cleaning/buffer time: Decide if gaps needed between bookings (e.g., 15 min cleaning time)
- [ ] Implementation: Backend availability endpoint should return exact available start times based on existing booking end times

### POS Dashboard Restructuring (Client Requirements)

**Current Layout:** Bookings / Timeline / Room / Menu / Tax
**New Layout:** Timeline / Room / Menu / Tax (remove Bookings section)

**Rationale:** Move booking functionality into Room section for unified workflow

**Timeline Section (Overview Only):**
- [x] Display one week of bookings for all rooms ✅ COMPLETED
- [x] Grid view: Days (columns) × Rooms (rows) ✅ COMPLETED
- [x] Different color per room for easy identification ✅ COMPLETED
- [x] Read-only, no interactions needed ✅ COMPLETED
- [ ] Real-time updates when bookings change

**Room Section (Primary Workspace - move Bookings functionality here):**
- [x] Display all rooms with current status color ✅ COMPLETED (Room Status Overview cards)
- [x] Click room to view/manage booking details ✅ COMPLETED (Manage/Book buttons)
- [x] Room Data Display with today's bookings ✅ COMPLETED
- [ ] Add orders per seat within room
- [ ] Issue bill (per seat or combined)
- [ ] Mark payment received (card/cash/tip)
- [ ] Close out transaction (returns room to available)
- [ ] Real-time status updates across all POS terminals

**Room Data Display:**
- [x] Booking time and duration ✅ COMPLETED
- [x] Customer name ✅ COMPLETED
- [x] Number of players/seats ✅ COMPLETED
- [x] Current status (empty/ordered/billed) ✅ COMPLETED
- [ ] Current orders by seat
- [ ] Bill status
- [ ] Payment status

**Implementation Priorities:**
- **Phase 1:** Dashboard restructure (remove Bookings, expand Room section) ✅ COMPLETED
  - [x] Changed tab structure from 5 to 4 tabs (Timeline/Room/Menu/Tax)
  - [x] Added Room Status Overview section with color-coded cards
  - [x] Implemented status legend (green=empty, yellow=ordered, red=billed)
  - [x] Enhanced Room Management tab with detailed room info
- **Phase 2:** Room workflow with status color coding ✅ PARTIALLY COMPLETED
  - [x] Color-coded room status borders and indicators
  - [x] Room status dropdown in Room Management tab
  - [ ] Backend integration for status persistence
- **Phase 3:** Payment tracking (card/cash/tip) 🟡 MEDIUM
- **Phase 4:** Monthly sales report ✅ COMPLETED
  - [x] Added Monthly Sales Report to Tax tab
  - [x] Month navigation controls
  - [x] Card/Cash/Tips breakdown display
  - [x] Daily breakdown for 31 days (scrollable)
  - [ ] Connect to real transaction data

**Database Changes Needed:**
- Add `roomStatus` enum: 'available' | 'ordered' | 'billed' | 'paid'
- Add `paymentMethod` field: 'card' | 'cash' | null
- Add `tipAmount` field: number
- Add `paidAt` timestamp
- Add `closedBy` user reference

### Open questions
- [x] ~~When the number of seats changes, does number of players also should changes?~~ → Decoupled: seats and players are independent
- [x] ~~How can we handle the "cached" data? for instance, menu added to the running booking etc in case of the restart the app.~~ → Menu now persists in SQLite, orders saved in localStorage

---

## 🤔 Open Questions & Decisions

### 1. Guest Mode vs Auto-Registration

**Question:** Should we auto-register all walk-in customers or keep "Guest" mode?

**Current Behavior:**
- **3 customer modes:** Existing Customer, New Customer, Guest
- **Guest mode:** Creates booking without user account (`userId: null`)
- **New Customer mode:** Creates user account + booking

**Considerations:**
| Pro Auto-Register | Pro Keep Guest |
|-------------------|----------------|
| ✅ Builds customer database | ✅ Privacy protection |
| ✅ Enables loyalty programs | ✅ Data quality (avoid fake info) |
| ✅ Returning customer lookup | ✅ Clear distinction |
| ✅ Simpler UX (2 modes vs 3) | ✅ Customer choice |

**Options:**
1. Remove Guest → Auto-register all walk-ins
2. Keep Guest as-is (anonymous bookings)
3. Middle ground: Add "Convert to customer" post-booking

**Status:** ⏸️ Awaiting team decision

---

### 2. Denormalized Customer Data in Bookings

**Question:** Should we keep customer info (name/phone/email) denormalized in Booking table or normalize via userId reference?

**Current Implementation:**
```prisma
model Booking {
  userId        String?  // FK to User (nullable for guest bookings)
  customerName  String   // Denormalized for display
  customerPhone String   // Denormalized for contact
  customerEmail String?  // Denormalized (optional)
}
```

**Considerations:**

| Pro Denormalization (Current) | Pro Normalization (Join to User) |
|-------------------------------|-----------------------------------|
| ✅ Guest bookings supported (`userId: null`) | ❌ Complex handling for guest bookings |
| ✅ Fast queries (no JOIN needed) | ❌ Slower queries (JOIN required) |
| ✅ Historical accuracy (snapshot at booking time) | ❌ Data changes affect past bookings |
| ✅ Customer data immutable after booking | ❌ User.name change → all bookings show new name |
| ✅ Simple API responses | ❌ Additional query complexity |
| ✅ Point-in-time records (audit trail) | ❌ Lost historical context |
| ✅ Works offline (POS use case) | ❌ Requires user data sync |
| ❌ Data duplication | ✅ Single source of truth |
| ❌ Update complexity if customer changes info | ✅ Updates propagate automatically |

**Business Context:**
- **Bookings are historical records** (like invoices/receipts)
- Customer info should reflect what was known **at booking time**
- Guest bookings (`userId: null`) need customer data without User account
- POS app needs offline-first design (denormalized = no JOIN, faster)

**Recommendation:** **Keep denormalized** for this domain because:
1. Bookings are immutable historical records (like financial transactions)
2. Guest bookings are a core feature (can't reference User if no account)
3. Performance-critical (admin dashboard lists 100+ bookings)
4. Offline-first POS requirements (minimize JOINs)

**Alternative:** If normalization needed, consider:
- Keep denormalized fields for guest bookings only (`userId IS NULL`)
- Add computed fields: `displayName` = `User.name ?? customerName`
- Hybrid approach with versioning/snapshots

**Status:** ⏸️ Open for discussion

---

## 🖥️ POS Electron App - Phase 0

> **Goal:** Offline-first POS system for front desk operations

### 0.6b Admin Dashboard & Booking Detail (Base UI) – ✅ Completed
<details>
<summary>View tasks (19 completed)</summary>

[x] Tabs (Bookings / Rooms / Weekly Calendar / Timeline) switch content
[x] Booking list row click → navigate `/booking/:id`
[x] Booking list status buttons (Complete / Cancel / Reset)
[x] Room status select (updates in‑memory state)
[x] Weekly Calendar week navigation (Prev / Next)
[x] Timeline week navigation (Prev / Next)
[x] Timeline booking block click → detail navigation
[x] Booking Detail actions (Back / Complete / Cancel / Restore)

</details>

### 0.6c Booking Detail Ordering + Menu Management – ✅ Completed
<details>
<summary>View tasks (39 completed)</summary>

[x] Local menu mock (12 items across 4 categories)
[x] Category toggle & scrollable list
[x] Add item → increment quantity if existing
[x] Update quantity (± buttons) & remove item
[x] Receipt panel with subtotal, tax, grand total
[x] Print-friendly styles & print action
[x] Menu Management Page with CRUD operations
[x] Filter, search, and stats functionality

</details>

### 0.6e Advanced POS Booking Detail with Seat Management – ✅ Completed
<details>
<summary>View tasks (72 completed)</summary>

**Features:**
[x] Seat Management: Dynamic 1-4 seat configuration
[x] Order Operations: Add to seat, move items, split costs
[x] Per-Seat Billing: Individual totals and grand total
[x] Print Functionality: Individual seat and complete order receipts
[x] Data Persistence: localStorage for orders and seat config
[x] UI Components: Dialog, Separator, Enhanced Button, Tabs

**Implementation:**
- Seat Colors: Blue/Green/Purple/Orange
- Tax Rate: 8% (configurable)
- localStorage Keys: `booking-{id}-orders`, `booking-{id}-seats`

</details>

### 0.6f Global Tax Rate Management – ✅ Completed
<details>
<summary>View tasks (46 completed)</summary>

**Database:**
[x] Setting table with key-value store pattern
[x] Seed default global_tax_rate (8%)
[x] Prisma schema and migration

**Backend API:**
[x] GET /api/settings (list all settings)
[x] GET /api/settings/:key (get specific setting)
[x] PUT /api/settings/:key (update setting, admin only)
[x] Validation for tax rate (0-100%)

**Frontend:**
[x] BookingContext with globalTaxRate state
[x] localStorage + API sync (offline support)
[x] Tax Settings tab in admin dashboard
[x] Per-booking tax rate overrides
[x] Optimistic UI updates

</details>

### 0.6g Server-Side Pagination & Database Seeding – ✅ Completed
<details>
<summary>View tasks (42 completed)</summary>

**Backend Pagination:**
[x] Add pagination to listBookings() (page, limit, sortBy, order)
[x] Return PaginatedBookings interface with metadata
[x] GET /api/bookings with query parameters
[x] Default: sortBy=startTime DESC (newest first)

**Frontend Integration:**
[x] Remove client-side sorting/pagination (useMemo)
[x] Add bookingsPagination state to BookingContext
[x] Update DashboardPage to fetch on page change
[x] Pagination UI with server-side metadata
[x] Remove Weekly Calendar tab from admin dashboard (redundant with Timeline)
[x] Update grid layout from 6 to 5 tabs

**Database Seeding:**
[x] Generate 133 mock bookings (44 days range)
[x] Create 25 unique mock customers
[x] Random data: times, durations, players, sources
[x] Dual-database setup (kgolf_app dev + k_golf_test)
[x] NPM scripts: db:seed:dev, db:seed:test

**Data Consistency & API Response:**
[x] Update default customer fallback values ('Guest' vs 'Unknown')
[x] Update default phone fallback values ('111-111-1111' vs 'N/A')
[x] Fix presentBooking() to include customer info in API response
[x] Add customerName, customerPhone, customerEmail to response
[x] Add isGuestBooking, bookingSource, internalNotes to response
[x] Update frontend bookingContext fallback values to match backend
[x] Reset dev database with new seed data

**Implementation:**
- Page Size: 10 bookings per page
- API: GET /api/bookings?page=1&limit=10&sortBy=startTime&order=desc
- Response: { bookings: [...], pagination: { total, page, limit, totalPages } }
- Databases: kgolf_app (142 bookings), k_golf_test (133 bookings)
- Default Values: 'Guest' / '111-111-1111' for missing customer data

</details>

### 0.6d Room Status Queue-Based Sync – ✅ Completed
<details>
<summary>View tasks (17 completed)</summary>

[x] Implemented processRoomUpdates() with collapse logic
[x] Collapse strategy: Group by roomId, keep latest only
[x] Generic queue:enqueue IPC handler
[x] Optimistic UI updates
[x] 15-second periodic auto-sync
[x] Auto-reload rooms after successful sync

**Known Issue:** Mock room IDs ('1', '2', '3', '4') vs real UUIDs from database

</details>

### 0.7 Queue Size Indicator
[x] IPC getQueueSize returns COUNT(*) from SyncQueue
[x] Renderer displays Queue badge
[ ] Verify: Badge updates without restart after sync

### 0.8 Online / Offline Probe
[ ] Interval (30s) GET /health sets online flag
[ ] IPC getStatus returns { online, queueSize, auth }
[ ] Renderer status indicator reflects connectivity

### 0.9 Scheduled Push Loop – ✅ Completed
[x] Interval (15s) triggers processSyncCycle()
[x] Conditions: online && authenticated && queue>0 && !isSyncing
[x] Auto-drain queue without manual Force Sync
[x] Auth expiry handling

### 0.9.1 Development Logging Consolidation – ✅ Completed
[x] Forward main process logs to renderer DevTools
[x] IPC channel: main-log with log levels
[x] Guard with ELECTRON_DEV check (dev only)
[x] [MAIN] prefix for main process logs

### 0.9.2 SyncQueue Refactoring – ✅ Completed
[x] Renamed Outbox → SyncQueue (table, files, interfaces)
[x] Updated all 6 files (db, sync-queue, sync, bookings, main, preload)
[x] Added enqueuePullIfNotExists() for duplicate prevention
[x] Renamed IPC handler: debug:outbox:list → debug:syncQueue:list
[x] Updated comments to reflect bidirectional sync (push + pull)
[x] Verified build and fresh database creation

**Rationale:** "SyncQueue" better represents bidirectional operations (push/pull) vs "Outbox" (unidirectional)

### 0.9.3 Menu Backend Integration & Sync – ✅ Completed
[x] Added MenuItem model to backend Prisma schema (PostgreSQL)
[x] Created migration: 20251023060719_add_menu_item_table
[x] Added 17 menu items to backend seed script (matching POS)
[x] Created backend API: GET /api/menu/items (with POS-compatible format)
[x] Implemented menu:pull handler in POS sync.ts
[x] Added pullMenuItems() with atomic SQLite transaction
[x] Periodic menu pull: every 5 minutes + on auth ready
[x] Duplicate prevention: enqueuePullIfNotExists('menu:pull')
[x] Build verification successful

**Implementation:**
- Backend syncs menu to POS automatically
- Menu changes in backend propagate to POS within 5 minutes
- Full replace strategy (DELETE + INSERT for atomic consistency)
- Category enum: HOURS, FOOD, DRINKS, APPETIZERS, DESSERTS
- Price stored as DECIMAL(10,2) in PostgreSQL, converted to REAL for SQLite

### 0.9.4 Incremental Booking Sync with Timestamps – ✅ Completed
[x] Added Metadata table to SQLite for timestamp tracking
[x] Created getMetadata/setMetadata helper functions in db.ts
[x] Added ?updatedAfter query parameter to GET /api/bookings (backend)
[x] Added ?limit parameter to bypass default pagination (limit=9999)
[x] Updated pullBookings() to detect full vs incremental sync
[x] Full sync on login: Fetches all bookings with ?limit=9999
[x] Incremental sync (15s): Uses ?updatedAfter={lastSyncedAt}&limit=9999
[x] Store/update bookings_lastSyncedAt in Metadata after sync
[x] Removed 30-day booking cleanup logic (retain all historical data)
[x] Removed default date filter from bookings:list IPC handler
[x] Added sync event listener to BookingContext for auto-refresh
[x] UI auto-updates within 2 seconds when sync completes

**Implementation:**
- Full sync: Fetches all bookings on fresh install/login
- Incremental sync: Only fetches changed bookings since last sync
- Auto-refresh: Dashboard updates automatically when new bookings arrive
- Data retention: All historical bookings preserved (no automatic cleanup)
- Pagination: Client-side pagination shows 10 bookings per page with navigation

### 0.9.5 Sync Interval Optimization – ✅ Completed
[x] Analyzed sync architecture (queue-based with 4 independent timers)
[x] Evaluated timer consolidation (recommended keeping separate)
[x] Created optimization documentation with 3 configuration options
[x] Implemented Option A (Conservative) sync intervals:
  - Sync cycle: 15s → 5s (67% faster, real-time feel)
  - Bookings pull: 15s → 5s (3x faster updates)
  - Rooms pull: 5min → 30s (90% faster availability)
  - Menu pull: 5min → 2min (60% faster menu changes)
[x] Performance impact: 504 → 1,590 ops/hour (~145KB/hour bandwidth)
[x] Committed changes (commit 7a33eac) with detailed metrics
[x] Documentation: docs/pos_sync_interval_optimization.md

**Next Steps:**
- [x] Rebuild POS app to apply new intervals
- [x] Test with production API
- [ ] Monitor server performance impact
- [ ] Collect user feedback on responsiveness

### 0.10 POS Deployment & Distribution Pipeline – ✅ COMPLETE

**Phase 1: Local Build Setup** ✅ COMPLETE
[x] Install electron-builder (`npm install --save-dev electron-builder`)
[x] Configure electron-builder in package.json (appId, productName, targets)
[x] Add build scripts: pack, dist, dist:mac, dist:win, dist:linux
[x] Create app icons (512x512 PNG for macOS/Linux, 256x256 for Windows) - Skipped (using default)
[x] Test local build (`npm run build && npm run dist`)
[x] Verify executable in `release/` directory
[x] Fix database path to use app.getPath('userData') instead of process.cwd()
[x] Include .env file in packaged app for production API URL
[x] Fix .env loading to check process.resourcesPath for packaged apps
[x] Test installation and login with production API

**Phase 2: GitHub Release Automation** ✅ COMPLETE
[x] Created `.github/workflows/pos-release.yml` workflow
[x] Configured matrix build (macos-latest ARM64, windows-latest x64)
[x] Added steps: checkout, setup Node.js, install deps, build TS
[x] Fixed Electron native modules issue (better-sqlite3, keytar)
  [x] Created cross-platform rebuild script (scripts/rebuild-native.js)
  [x] Auto-detects architecture with os.arch()
  [x] Rebuilds with Electron headers (--target=35.7.5)
  [x] Works on macOS, Windows, Linux
[x] Upload artifacts (DMG, EXE installer)
[x] Added GitHub Release creation step (on tag `pos-v*`)
[x] Tested workflow with manual trigger (workflow_dispatch)
[x] **Verified:** macOS ARM64 artifact tested and working ✅
[x] **Verified:** Windows x64 build working in CI ✅

**Phase 3: Public Release Distribution** ✅ COMPLETE
[x] Created UI-triggered workflow with version input
[x] Added pre-release flag option
[x] Configured automatic release to public repository (k-golf-release)
[x] Set up GitHub Personal Access Token (PUBLIC_RELEASE_TOKEN)
[x] Created automated release notes with installation instructions
[x] Fixed platform-specific verification steps (bash vs PowerShell)
[x] Successfully published first release (v0.1.0) ✅
[x] **Public releases available at:** https://github.com/HanKyungSung/k-golf-release/releases
[x] Created comprehensive release documentation
[x] Added customizable release notes template (RELEASE_NOTES_TEMPLATE.md)

**Phase 4: Auto-Update System** ✅ COMPLETE
[x] Installed electron-updater dependency
[x] Implemented auto-update in main.ts:
  - Initial check after 10 seconds on app launch
  - Periodic checks every 12 hours
  - Auto-download updates in background
  - Auto-install on app quit (silent updates)
  - Event listeners for all update states
  - IPC handlers for manual check and install
[x] Updated workflow to generate update metadata:
  - Removed `--publish never` flag
  - Added GH_TOKEN for electron-builder
  - Generates latest-mac.yml and latest.yml
  - Generates .blockmap files for delta updates
[x] Created comprehensive documentation:
  - Auto-update guide with testing procedures
  - Updated release guide with auto-update section
  - Complete explanation of pipeline changes
  - Troubleshooting and best practices
[x] Added version display in POS app header (2025-11-22):
  - Version badge next to clock using VERSION.txt
  - Automatic version copying during build process
  - Text loader configuration for esbuild
  - Proper .gitignore for generated files

**Documentation:**
- Release Process: `/docs/pos_release_guide.md`
- Auto-Update Guide: `/docs/electron_auto_update_guide.md`
- Native Module Fix: `/docs/electron_native_module_fix.md`
- Version Tracking: `/pos/VERSION.txt`
- Release Notes Template: `/pos/RELEASE_NOTES_TEMPLATE.md`

**Native Module Fix (Critical):**
- **Problem:** better-sqlite3 v11 uses prebuild-install which downloads prebuilt binaries for system Node.js (MODULE_VERSION 131) instead of Electron's Node.js (MODULE_VERSION 133)
- **Solution:** Created `pos/apps/electron/scripts/rebuild-native.js` to rebuild native modules with correct Electron version
- **Implementation:** Uses node-gyp with --target=35.7.5 --arch=[auto-detected] --dist-url=https://electronjs.org/headers
- **Result:** Both local and CI builds now work correctly with proper native modules

**Resolved Issues:**
[x] **FIXED: Electron renderer not showing on macOS ARM64 CI builds** (2025-11-12)
  - **Root Cause:** NODE_MODULE_VERSION mismatch (131 vs 133)
  - **Solution:** Cross-platform rebuild script with automatic architecture detection

**Active Issues:** See [Active Issues & Bugs](#active-issues--bugs) section at top of document

**Phase 5: Code Signing** ⏭️ SKIPPED
**Reason:** Single-venue deployment (parents' business) - no public distribution needed
**Cost avoided:** $99/year (macOS) + $200-400/year (Windows)
**Workaround:** Manually add security exception on venue devices
~~[ ] macOS: Get Apple Developer certificate ($99/year)~~
~~[ ] macOS: Configure identity, hardenedRuntime, entitlements~~
~~[ ] macOS: Store certificate in GitHub Secrets (MACOS_CERTIFICATE)~~
~~[ ] Windows: Get code signing certificate (DigiCert/Sectigo)~~
~~[ ] Windows: Add signtool step to workflow~~
~~[ ] Windows: Store certificate in GitHub Secrets (WIN_CERT_PASSWORD)~~

**Phase 6: Distribution & Documentation**
[ ] Create installation guide (README or wiki)
[ ] Document first-time setup (API_BASE_URL, login)
[ ] Create download page or link to GitHub Releases
[ ] Add troubleshooting section (common errors)
[ ] Document update process (manual vs auto-update)

**Current Status:**
- Development builds working locally (`npm run dev`)
- Production packaging not configured (no electron-builder)
- No automated release pipeline
- Code signing: SKIPPED (single-venue deployment)
- Auto-update: SKIPPED (manual updates sufficient)

**Deployment Strategy (Single-Venue):**
- Tag releases: `git tag pos-v0.1.0 && git push --tags`
- GitHub Actions builds unsigned executables
- Download from GitHub Releases (private repo)
- Manual installation on venue devices
- Bypass OS security warnings on first launch:
  - **macOS**: System Settings → Privacy & Security → "Open Anyway"
  - **Windows**: "More info" → "Run anyway"
- Manual updates: Download and reinstall when needed

### 0.11 POS to Web Migration – ✅ PHASE 1 COMPLETE

**Status:** Phase 1 Complete - Backend API Refinement In Progress  
**Timeline:** Phase 1: 2 days | Phase 1.5: TBD | Phase 2: 1-2 days  
**Architecture:** Integrated into existing frontend with role-based dashboard

#### Phase 1: Web Frontend Migration ✅ COMPLETED (Nov 22-23, 2025)

**Architecture Decision:**
[x] Integrated POS into existing frontend (simpler than separate app)
[x] Role-based dashboard: `/dashboard` shows POS for ADMIN, customer view for USER
[x] Reused existing auth system (session cookies)
[x] Single codebase, single deployment

**Frontend Implementation:**
[x] Created `frontend/services/pos-api.ts` with all POS API endpoints
[x] Migrated DashboardPage UI to `frontend/src/pages/pos/dashboard.tsx`
[x] Updated `frontend/src/pages/dashboard.tsx` for role-based rendering
[x] Fixed logout crash (proper React hooks structure)
[x] Removed redundant `/pos/*` routes (consolidated under `/dashboard`)
[x] Updated login flow to always redirect to `/dashboard`

**UI Components Migrated:**
[x] Real-time room status display (live clock, updates every second)
[x] Room status cards (Empty/Occupied with color indicators)
[x] Three management tabs: Bookings, Rooms, Tax Settings
[x] Today's bookings list with Complete/Cancel actions
[x] Room management with status dropdown (Active/Maintenance/Closed)
[x] Tax rate configuration (editable, persisted)
[x] Dark theme UI matching Electron app style

**API Integration (Frontend Ready):**
[x] Booking operations (list, create, update status, cancel)
[x] Room operations (list, update status)
[x] Menu operations (list, create, update, delete)
[x] Tax settings (get, update global tax rate)
[x] Error handling and loading states
[x] Session-based authentication (reused existing system)

**Completed Without Changes:**
[x] Authentication via session cookies (already exists)
[x] Responsive design (Tailwind CSS, works on all devices)
[x] No local database needed (direct API calls only)
[x] No Electron-specific code (pure React web app)

#### Phase 1.5: Backend API Refinement ✅ COMPLETE

**Status:** Core backend endpoints implemented and tested

**Backend Endpoints - Existing:**
[x] `GET /api/bookings` - list bookings (pagination supported)
[x] `GET /api/bookings/rooms` - list rooms
[x] `GET /api/bookings/mine` - user's bookings
[x] `PATCH /api/bookings/:id/cancel` - cancel booking
[x] `POST /api/bookings` - create booking (user)
[x] `POST /api/bookings/admin/create` - admin create booking
[x] `PATCH /api/bookings/rooms/:id` - update room status
[x] `PATCH /api/bookings/:id/payment-status` - update payment status (admin)

**Backend Endpoints - Implemented in Phase 1.5:**
[x] `GET /api/bookings/:id` - get single booking details
[x] `PATCH /api/bookings/:id/status` - update booking status (Complete/Cancel)
[x] `GET /api/settings/global_tax_rate` - get tax rate (convenience endpoint)
[x] `PUT /api/settings/global_tax_rate` - update tax rate (convenience endpoint)

**Menu Endpoints - Deferred to Phase 1.6 (Optional):**
[ ] `GET /api/menu/items` - list menu items
[ ] `POST /api/menu/items` - create menu item
[ ] `PATCH /api/menu/items/:id` - update menu item
[ ] `DELETE /api/menu/items/:id` - delete menu item

**Completed Tasks:**
[x] Audit all booking endpoints for consistency
[x] Add missing CRUD operations for bookings
[x] Implement settings management endpoints (tax rate)
[x] Add proper error handling across all endpoints
[x] Test all endpoints with POS frontend
[x] API integration verified and working

**Frontend Integration Complete:**
[x] Timeline view with visual weekly schedule
[x] Booking status updates (Complete/Cancel working)
[x] Room status updates (dropdown working)
[x] Tax rate editor (read & write working)
[x] Data transformation (ISO timestamps → date/time/duration)

#### Phase 2: Deployment Pipeline (1-2 days)

**Docker Setup:**
[ ] Create Dockerfile for POS web app (similar to frontend)
[ ] Add pos-frontend service to docker-compose.yml
[ ] Configure build process
[ ] Set environment variables (API_BASE_URL)

**Nginx Configuration:**
[ ] Add POS route to Nginx config
  - Option A: Subdomain (pos.k-golf.inviteyou.ca)
  - Option B: Path (/pos/)
[ ] Update SSL certificates if using subdomain
[ ] Test routing configuration

**CI/CD Pipeline:**
[ ] Update GitHub Actions workflow
[ ] Add POS build step
[ ] Add POS deployment step
[ ] Test automated deployment

**Production Deployment:**
[ ] Deploy to production server
[ ] Test on tablets and phones
[ ] Verify API connectivity
[ ] Train staff on web interface

**Documentation:**
[ ] Update README with POS web app info
[ ] Document deployment process
[ ] Create user guide for staff
[ ] Document API endpoints used

#### Rollout Strategy

**Week 1: Development**
[ ] Complete Phase 1 (frontend migration)
[ ] Test locally with backend API
[ ] Fix integration issues

**Week 2: Deployment**
[ ] Complete Phase 2 (deployment pipeline)
[ ] Deploy to production
[ ] Test on actual devices (tablets/phones)
[ ] Monitor for issues

**Week 3+: Adoption**
[ ] Train staff on web POS
[ ] Collect feedback
[ ] Optional: Keep Electron app as backup for 2-4 weeks
[ ] Monitor usage and performance

---

### 0.12 Print Queue & Thermal Printer Integration – 🔮 FUTURE

**Status:** Deferred to Phase 2 (after web POS migration complete)  
**Timeline:** TBD (estimated 10-12 days)  
**Architecture:** Backend print queue + standalone bridge service

This feature will be implemented after the web POS is stable and in use. See `/POS_WEB_MIGRATION.md` for detailed architecture notes.

#### Future Tasks (Not Started)

**Backend Print Queue Infrastructure:**
[ ] Add PrintJob and PrintBridge models to Prisma schema
[ ] Create print queue service with job lifecycle management
[ ] Add REST API endpoints (POST /api/print/receipt, GET /api/print/jobs)
[ ] Implement WebSocket server for real-time job broadcasting
[ ] Test print queue with mock printer

**Print Bridge Service:**
[ ] Create standalone Node.js package
[ ] Implement WebSocket connection to backend
[ ] Add thermal printer support (node-thermal-printer)
[ ] Format receipts with ESC/POS commands
[ ] Package as Windows service / systemd service
[ ] Test with real thermal printer (Epson/Star)

**Web POS Integration:**
[ ] Add print service to web POS
[ ] Replace browser print with queue-based printing
[ ] Add print job status monitoring
[ ] Handle print errors gracefully

**Deployment:**
[ ] Install bridge service on venue computer
[ ] Configure printer connection (USB/Network)
[ ] Test end-to-end print flow
[ ] Monitor print success rate

---

### 0.11 Logging & Monitoring Enhancement

**Sync Logging Requirements:**
[ ] Add structured logging for all sync operations
[ ] Log sync cycle start/end with duration
[ ] Log queue size before/after each cycle
[ ] Log individual operation success/failure (booking:create, rooms:pull, etc.)
[ ] Add error categorization (network, auth, validation, server)
[ ] Log retry attempts with backoff timing
[ ] Add sync performance metrics (operations/sec, avg response time)

**UI Logging Display:**
[ ] Add "Sync Logs" tab or panel in POS admin dashboard
[ ] Display last 100 sync events with timestamps
[ ] Color-code by severity (info/warn/error)
[ ] Filter by operation type (push/pull, booking/room/menu)
[ ] Add export logs button (download as JSON/CSV)
[ ] Show connection status history (online/offline transitions)

**Backend Logging:**
[ ] Log POS API requests with device identifier
[ ] Track sync frequency per device
[ ] Monitor for abnormal sync patterns (spam detection)
[ ] Add metrics endpoint for sync health monitoring

**Development Logging:**
[x] Forward main process logs to renderer DevTools (completed 0.9.1)
[ ] Add log levels (DEBUG, INFO, WARN, ERROR)
[ ] Configure log rotation (max file size, max files)
[ ] Add log filtering in DevTools console

**Production Logging:**
[ ] electron-log file output configuration
[ ] Remote error reporting (Sentry/LogRocket)
[ ] Performance monitoring (response times, queue depths)
[ ] Alert system for critical errors (sync failures > 5 min)

**Monitoring Dashboard (Optional Future):**
[ ] Admin web dashboard showing all POS devices
[ ] Real-time sync status per device
[ ] Historical sync reliability graphs
[ ] Alert configuration (email/SMS on failures)

### Follow-Ups (Post 0.6g) – Pagination Enhancements
[ ] Add filtering (status, date range, room, customer name)
[ ] Add search functionality
[ ] Cursor-based pagination for better performance
[ ] Add sorting by other fields
[ ] Cache pagination results (Redis)
[ ] "Jump to page" input
[ ] Infinite scroll alternative
[ ] Export to CSV/Excel
[ ] Optimize with database indexes
[ ] User-configurable page size
[ ] Loading skeleton during transitions
[ ] Persist page in URL query params
[ ] WebSocket real-time updates
[ ] Batch operations across pages

### Follow-Ups (Post 0.6d) – Room Data Synchronization
[ ] Replace mock room data with real backend data
[ ] Fetch rooms on app startup (use authState.rooms)
[ ] Update bookingContext to use real rooms
[ ] Add color mapping logic for room cards
[ ] Reconcile Room type differences (backend vs mock)
[ ] Test status update with real UUID IDs
[ ] Verify persistence across app restart

### Follow-Ups (Post 0.6f) – Tax & Settings Enhancements
[ ] Add custom_tax_rate column to Booking table
[ ] Sync booking-specific tax rates to database
[ ] Settings audit log table
[ ] Setting categories management
[ ] Setting validation rules
[ ] Setting dependencies
[ ] Setting search and filtering
[ ] Setting import/export
[ ] Tax rate history chart
[ ] Per-room tax rates
[ ] Tax exemption flags
[ ] Multiple tax types (sales tax, service charge)
[ ] Settings cache layer (Redis)
[ ] Settings versioning

### Follow-Ups (Post 0.6c) – Menu & Order Features
[ ] Introduce MenuProvider (context)
[ ] Persist menu + orders to SQLite via IPC
[ ] Menu item category CRUD
[ ] Bulk availability toggle
[ ] Price history / audit
[ ] Drag to reorder items
[ ] Keyboard + ARIA support
[ ] Advanced print layout customization
[ ] Export menu to CSV/PDF
[ ] Cost-of-goods fields and margin display
[ ] Toast notifications
[ ] Optimistic updates + rollback
[ ] Unit tests for reducers/helpers
[ ] E2E smoke tests

### Follow-Ups (Post 0.6e) – Advanced POS Features
[ ] Backend integration: Database-backed menu items
[ ] Backend integration: Persist orders (Order, OrderItem tables)
[ ] Payment gateway integration
[ ] Order history for completed bookings
[ ] Kitchen Display System (KDS) integration
[ ] Analytics: Popular items, revenue per seat
[x] Discounts/Promotions and coupon codes
[ ] Multi-currency support
[ ] SMS/Email receipts
[ ] Inventory management
[ ] Combo/Bundle pricing
[ ] Modifiers/Add-ons (customization)
[ ] Tip/Gratuity calculation
[ ] Void/Refund functionality
[ ] Order notes (allergies, preferences)
[ ] Table/Bay management system integration
[ ] Happy Hour dynamic pricing

---

## 👤 Backend & Admin Features - Phase 1

> **Goal:** Phone-based admin booking system

### Phase 1 Overview

**Feature Documentation:** `/docs/admin_manual_booking_feature.md`
**Schema Guide:** `/docs/database_schema_explanation.md`
**Phone Handling:** `/docs/phone_number_country_code_handling.md`

**Key Changes:**
- Phone becomes primary identifier (unique, required)
- Email becomes optional (nullable)
- Guest bookings supported (nullable userId)
- Track registration source (ONLINE/WALK_IN/PHONE)
- Admin audit trail (createdBy, registeredBy)

### 1.0 User Registration Improvements – ✅ COMPLETED (2025-12-12)

**Status:** Fully implemented across full stack

**Date of Birth Field Implementation:**

**Database Schema** `[x]` ✅ DONE
- [x] Added `dateOfBirth` field to User model (DATE type, optional in DB)
- [x] Created migration: `20251212091448_add_user_date_of_birth`
- [x] Updated seed script with DOB for all test users
- [x] Fixed migration order (renamed 20250129 to 20251129)
- [x] Reseeded database with proper guest bookings (userId=NULL)
- [x] Linked 30 bookings to users, 115 as guest bookings

**Backend Implementation** `[x]` ✅ DONE
- [x] Updated `authService.createUser()` to accept dateOfBirth parameter
- [x] Updated registration route to require and validate dateOfBirth
- [x] Updated `bookingRepo.getBooking()` to include user data with relations
- [x] Updated `presentBooking()` to format dateOfBirth as YYYY-MM-DD string
- [x] Fixed timezone issues by returning date string only (no timestamp)

**Frontend Implementation** `[x]` ✅ DONE
- [x] Added dateOfBirth input to signup form with date picker
- [x] Improved date picker with min="1900-01-01" and dark mode styling
- [x] Added [color-scheme:dark] class for better calendar UI
- [x] Updated signup hook to include dateOfBirth parameter
- [x] Updated Booking interface to include optional user object
- [x] Enhanced booking detail UI to display all user fields including DOB
- [x] Fixed labels to be consistent (all text, no icons)
- [x] Changed labels to "Booking Date" and "Start Time" for clarity
- [x] Shows "N/A" for guest bookings without linked users

**Phone Number Formatting** `[x]` ✅ DONE
- [x] Added automatic phone number formatting (123-456-7890)
- [x] Input accepts only digits (removes non-numeric characters)
- [x] Auto-formats as user types: XXX-XXX-XXXX
- [x] Limited to 10 digits maximum
- [x] Updated placeholder to show expected format

**Google Login Temporary Disable** `[x]` ✅ DONE
- [x] Commented out Google OAuth login button in login page
- [x] Preserved code for future re-enablement
- [x] Fixed JSX comment syntax errors
- [x] Verified TypeScript build succeeds

**Testing** `[x]` ✅ DONE
- [x] Tested user registration with DOB (gksruddlakstp@gmail.com - 1992-05-08)
- [x] Verified DOB saves correctly in database
- [x] Verified DOB displays correctly in booking details
- [x] Verified guest bookings show "N/A" for DOB
- [x] TypeScript build passes with no errors

**Email Service Migration** `[x]` ✅ DONE (2025-12-18)
- [x] Updated email service to use kgolf.general@gmail.com
- [x] Changed sender from personal Gmail to business Gmail account
- [x] Updated Gmail credentials in production .env.production
- [x] Restarted backend container to apply new credentials
- [x] Applied to both verification and receipt emails
- [x] Email format: "K-Golf <kgolf.general@gmail.com>"

**Signup Form Error Handling** `[x]` ✅ DONE (2025-12-18)
- [x] Fixed error message visibility on signup form
- [x] Added `errorField` state to track which field has error ('email' | 'phone' | null)
- [x] Red borders highlight specific fields causing validation errors
- [x] Email input shows red border when email validation fails
- [x] Phone input shows red border when phone validation fails
- [x] Errors clear when user modifies the problematic field
- [x] FormError component displays error message below form

**Login Flow Enhancement** `[x]` ✅ DONE (2025-12-18)
- [x] Added EMAIL_NOT_VERIFIED error handling in login
- [x] Non-verified users attempting login are redirected to verification page
- [x] Automatic redirect to /verify page with email pre-filled
- [x] Users can resend verification email from verification page
- [x] Error message: "Email not verified. Please check your email."

**Commits:**
- Add date of birth field to user registration and booking details (1ceae5b)
- Fix TypeScript build errors in print routes and WebSocket manager (6f3a532)
- Improve date of birth input with min date and dark mode styling (4840c57)
- Comment out Google login and add phone number formatting (cf9fcdd)
- Fix JSX comment syntax error in login page (9d1488d)
- Update email service to use kgolf.general Gmail account (94e1390)

### 1.1 POS API Key Security Improvement – ⚠️ CRITICAL

**Status:** Must be addressed before production deployment

**Current Issue:**
- POS authentication uses hardcoded static API key: `'pos-dev-key-change-in-production'`
- API key is visible in frontend code (anyone with app access can extract it)
- Same API key for all POS devices (no device-specific authentication)
- API key never expires (no rotation mechanism)

**Required Changes:**

[ ] **Backend:**
  - [ ] Add `POS_ADMIN_KEY` to backend/.env.example with security warning
  - [ ] Change default value in requireAuth.ts from hardcoded string to env-only
  - [ ] Set unique, strong `POS_ADMIN_KEY` in production .env
  - [ ] Document API key security in backend README
  - [ ] Restart backend server after env change

[ ] **Production Deployment:**
  - [ ] Generate cryptographically secure API key (e.g., `openssl rand -hex 32`)
  - [ ] Update production backend .env with new key
  - [ ] Test POS connectivity with new key
  - [ ] Document key rotation procedure

[ ] **Future Enhancements (Phase 2):**
  - [ ] Per-device API keys (track individual POS devices)
  - [ ] Key expiration and rotation mechanism
  - [ ] OAuth2 device flow for proper authentication
  - [ ] Store device keys in secure location (not in frontend code)
  - [ ] Audit log for API key usage

**Security Context:**
- Current method: Header `x-pos-admin-key` bypasses session authentication
- Risk: Anyone with app access can extract key and impersonate admin
- Web app uses HttpOnly session cookies (secure)
- POS uses static API key (insecure for production)

**Documentation:**
- Authentication architecture: `/docs/admin_manual_booking_feature.md`
- CSP configuration: `pos/apps/electron/src/renderer/index.html`
- Middleware: `backend/src/middleware/requireAuth.ts`

### 1.1 Database Schema Migration – ✅ Completed

**User Model Changes:**
[x] Make User.email nullable
[x] Make User.phone required with unique constraint
[x] Add User.phoneVerifiedAt TIMESTAMPTZ
[x] Add User.registrationSource VARCHAR(50)
[x] Add User.registeredBy (FK to User.id)
[x] Backfill phone numbers for existing users
[x] Update Prisma model and regenerate client

**Booking Model Changes:**
[x] Make Booking.userId nullable (for guests)
[x] Add Booking.customerEmail TEXT
[x] Add Booking.isGuestBooking BOOLEAN
[x] Add Booking.bookingSource VARCHAR(50)
[x] Add Booking.createdBy (FK to User.id)
[x] Add Booking.internalNotes TEXT
[x] Add indexes on customerPhone and bookingSource

**PhoneVerificationToken Model:**
[x] Create table for Phase 2 SMS OTP (schema only)
[x] Fields: id, phone, tokenHash, expiresAt, attempts

**Status:** Migration `20251013065406_phone_based_booking_system` applied

### 1.2 Backend Phone Utilities – ✅ Completed

[x] Create backend/src/utils/phoneUtils.ts
[x] Implement normalizePhone() - Convert to E.164 format
[x] Implement formatPhoneDisplay() - User-friendly format
[x] Implement validatePhone() - E.164 regex validation
[x] Implement validateCanadianPhone() - +1 + 10 digits
[x] Default country: +1 (Canada) hardcoded
[x] Unit tests: 59/59 passing ✅

**Formats Supported:**
- "4165551234" → "+14165551234"
- "(416) 555-1234" → "+14165551234"
- "+1 416-555-1234" → "+14165551234"
- Idempotent normalization

### 1.3 Backend API - User Lookup – ✅ Completed

[x] GET /api/users/lookup?phone={phone} (ADMIN only)
[x] Normalize phone before lookup
[x] Return user details + stats (bookingCount, lastBookingDate, totalSpent)
[x] Return { found: false } if not found (200, not 404)
[x] GET /api/users/recent?limit={10} (ADMIN only)
[x] Optional filters: registrationSource, role
[x] Pagination support
[x] E2E tests: 21 tests created (skipped, pending test server auth)

**Status:** API functional, manual testing passed

### 1.4 Backend API - Admin Booking Creation – ✅ Completed

[x] POST /api/bookings/admin/create (ADMIN only)
[x] Three customer modes: existing, new, guest
[x] Zod validation for all input fields
[x] Room availability & conflict checking
[x] Price calculation (base + tax)
[x] Custom price/tax overrides
[x] Transaction for new user + booking
[x] Admin audit trail (createdBy)
[x] Error handling (409, 404, 400, 500)
[x] Unit tests: 20/20 passing ✅

**Guest Mode Restrictions:**
- Only allowed for WALK_IN bookings
- Phone bookings must have user account

### 1.5 POS - Phone Input Component – ✅ Completed

[x] Create PhoneInput.tsx component
[x] Canada-only (+1 fixed country code)
[x] Auto-formatting: "4165551234" → "(416) 555-1234"
[x] Normalize to E.164 on onChange
[x] Validation indicator (green/red)
[x] Optional search button
[x] Keyboard accessibility
[x] Error message display
[x] Disabled/readonly states
[x] Usage examples created

### 1.6 POS - Customer Search Component – ✅ Completed

[x] Create CustomerSearch.tsx
[x] Phone input with search button
[x] API call to /api/users/lookup
[x] Display user card with stats (if found)
[x] Show "not found" options (Register / Guest)
[x] Recent customers dropdown
[x] Loading state & error handling
[x] TypeScript interfaces
[x] Currency formatting
[x] Usage examples created

### 1.6.1 Bug Fix - Phone Uniqueness & Email Setup – ✅ Completed

**Issue:** Duplicate phone constraint violation, email config missing

[x] Add findUserByPhone() helper
[x] Add phone normalization in register endpoint
[x] Add phone uniqueness check before user creation
[x] Return 409 for duplicate phone
[x] Update .env.example with Gmail App Password instructions
[x] Document 2-Step Verification requirement

### 1.7 Simplified Booking Flow with Guest Support – ✅ Completed

**Backend Changes:**
[x] Make Booking.userId nullable for guest bookings
[x] Create POST /api/bookings/simple/create endpoint
[x] Simplified payload: customerName, customerPhone, customerEmail (optional)
[x] Auto-link bookings to users by matching phone number
[x] Add auto-linking logic in user registration (/api/auth/register)
[x] Create migration script for existing guest bookings
[x] Test all backend endpoints (5 scenarios: guest, existing user, conflicts, validation, auto-link)

**Frontend Changes:**
[x] Refactor BookingModal to 2-step flow (Customer → Details)
[x] Add Walk-in/Phone source selection buttons (customer step)
[x] Implement live phone search (500ms debounce, auto-triggers at 10 digits)
[x] Remove source step (integrated into customer step)
[x] Remove internal notes field
[x] Remove estimated price display
[x] Fix phone input deletion bug (partial E.164 format)
[x] Fix continue button validation (E.164 length check)

**Implementation:**
- Phone-first approach: Enter phone → Search automatically → Select/create customer
- Guest bookings: userId=null, stored with customer info
- Auto-linking: When guest registers online, existing bookings link automatically
- E.164 format: +1XXXXXXXXXX (12 chars) for complete validation
- Partial E.164: Returns +1XXX for incomplete numbers (prevents deletion bug)

### 1.8 Frontend Build & Environment Configuration – ✅ Completed

**Production API URL Fix:**
[x] Fixed frontend API calls to use relative URLs instead of localhost
[x] Updated Dockerfile to set `REACT_APP_API_BASE=` (empty string)
[x] Fixed webpack DefinePlugin to handle empty string correctly
[x] Changed from `|| 'http://localhost:8080'` to explicit undefined check
[x] Deployed fix (commit d81e5c3: "fix: properly handle empty string for REACT_APP_API_BASE")
[x] Verified login works in production at k-golf.inviteyou.ca

**Implementation:**
- Environment Strategy: Empty string for production → relative URLs (`/api/auth/login`)
- Fallback for Development: `http://localhost:8080` when env var not set
- Webpack Logic: `process.env.REACT_APP_API_BASE !== undefined ? process.env.REACT_APP_API_BASE : 'http://localhost:8080'`
- Result: No CORS issues, same-origin requests in production

**Architecture:**
- Unified deployment: Single Node.js container serving both frontend static files and API
- Path structure: `backend/dist/src/server.js` serves `backend/dist/public/` (frontend build output)
- Nginx: Reverse proxy on port 8082 to k-golf.inviteyou.ca
- Docker: Multi-stage build (frontend → backend → runner)

### 1.9 Guest/Registered Badge Display

[ ] Add userId to Booking interface (BookingContext.tsx)
[ ] Update DashboardPage booking list UI
[ ] Display badge next to customer name based on userId
[ ] Badge variants: "Registered" (userId exists) vs "Guest" (userId null)
[ ] Verify badges display correctly after sync

### 1.10 End-to-End Testing

[ ] Test new guest booking creation (no existing user)
[ ] Test existing customer booking (auto-link)
[ ] Test phone search with multiple matches
[ ] Test customer name editing
[ ] Verify sync pulls userId correctly from backend
[ ] Verify badge display based on userId
[ ] Test phone input validation and formatting
[ ] Test complete booking flow (phone → details → submit)

### 1.10 Analytics Dashboard (Optional - Future)

[ ] Registration source analytics
[ ] Charts: Users by source, bookings over time
[ ] Cross-channel analysis table
[ ] Admin performance metrics
[ ] Filters and CSV export

### 1.11 Testing & Documentation

**Backend Integration Tests:**
[ ] Create booking for existing customer
[ ] Create booking + new customer account
[ ] Create guest booking (walk-in only)
[ ] Reject guest booking via phone (400)
[ ] Duplicate phone validation (409)
[ ] Room conflict (409)
[ ] Invalid roomId (404)
[ ] Phone normalization in lookups
[ ] Price calculation with tax rates
[ ] Admin audit trail tracking
[ ] Transaction rollback on failure

**Frontend E2E Tests:**
[ ] Walk-in guest booking flow
[ ] Phone booking for new customer
[ ] Search existing customer and create booking
[ ] Error handling (duplicate phone, conflicts)
[ ] Walk-in guest option visible
[ ] Phone booking hides guest option
[ ] Price preview updates
[ ] Custom price override

**Documentation:**
[ ] API documentation for new endpoints
[ ] User guide for front desk staff (PDF/wiki)
[ ] Admin training guide
[ ] Database schema ER diagram update
[ ] README update with new features
[ ] Migration guide (email-based → phone-based)

---

## 🔄 Phase 1.2 - Booking Status Simplification

> **Goal:** Simplify booking lifecycle and add split payment tracking
> **Documentation:** `/docs/BOOKING_STATUS_FLOW.md`
> **Status:** READY FOR IMPLEMENTATION
> **Start Date:** 2025-11-29

### Overview

Refactor booking status model from complex 4-field approach to simplified 2-field system:
- **bookingStatus:** `BOOKED` | `COMPLETED` | `CANCELLED` | `EXPIRED` (lifecycle)
- **paymentStatus:** `UNPAID` | `PAID` (revenue tracking)
- **BookingPayment:** New table for per-seat payment tracking (split payments)

### Changes from v1.0
- ✅ `CONFIRMED` → `BOOKED` (more intuitive naming)
- ✅ Removed `BILLED` status (simplified to UNPAID/PAID)
- ✅ Added `EXPIRED` status (30-day cleanup)
- ✅ Added `completedAt` timestamp
- ✅ New `BookingPayment` model for split payments
- ✅ Removed `billedAt` column (no longer needed)

### Task 1.2.1: Database Schema & Migration

[ ] **Schema Updates:**
  - [x] Update Prisma schema: BookingPayment model added
  - [x] Update Booking model: BOOKED default, remove BILLED, add completedAt
  - [x] Create migration file (20250129_001_simplify_booking_status)
  
[ ] **Apply Migration:**
  - [ ] Run `npm run prisma:migrate` in backend/
  - [ ] Verify migration succeeds and all CONFIRMED→BOOKED conversions work
  - [ ] Test database state (no BILLED records remain)
  - [ ] Verify BookingPayment table created with indices

[ ] **Seed Script Updates:**
  - [ ] Update backend/prisma/seed.ts to use new status values
  - [ ] Create sample BookingPayment records for test data
  - [ ] Verify seed completes without errors
  - [ ] Check test data in DB (status values, payment records)

### Task 1.2.2: Backend Repository Layer

[ ] **bookingRepo.ts Updates:**
  - [ ] Add `createPayment(bookingId, customerName, seatIndex, amount, paymentMethod)` function
  - [ ] Add `getPaymentTotal(bookingId)` → sum of all BookingPayment amounts
  - [ ] Add `getPaymentsByBooking(bookingId)` → return all payment records
  - [ ] Update `completeBooking(id)` → validate PAID status required
  - [ ] Add `updateBookingStatus(id, newStatus)` → admin override (validate new status)
  - [ ] Update validators to allow: BOOKED | COMPLETED | CANCELLED | EXPIRED
  - [ ] Update tests for all new functions

[ ] **Validation & Business Logic:**
  - [ ] Prevent COMPLETED if paymentStatus ≠ PAID
  - [ ] Prevent changing COMPLETED bookings (except admin override)
  - [ ] Validate seatIndex range (1-4)
  - [ ] Validate payment amount > 0
  - [ ] Check total payments don't exceed booking price

### Task 1.2.3: Backend API Routes

[ ] **New Endpoints:**
  - [ ] `PATCH /api/bookings/:id/payment` → record payment (staff)
    - Body: `{ amount, paymentMethod, customerName, seatIndex }`
    - Response: booking + remaining balance
    - Validation: amount > 0, total ≤ price, booking is BOOKED
  
  - [ ] `PATCH /api/bookings/:id/complete` → mark COMPLETED (staff)
    - Body: `{}`
    - Response: booking with completedAt timestamp
    - Validation: paymentStatus must be PAID
  
  - [ ] `PATCH /api/bookings/:id/status` → admin override (admin only)
    - Body: `{ bookingStatus?, paymentStatus? }`
    - Response: updated booking
    - Validation: None (admin can do anything)

[ ] **Existing Endpoint Updates:**
  - [ ] `GET /api/bookings/:id` → include payments array
  - [ ] `GET /api/bookings` → include payment summary
  - [ ] `PATCH /api/bookings/:id/cancel` → prevent if COMPLETED
  - [ ] Update response schema to new status values

[ ] **Error Handling:**
  - [ ] 409 Conflict: Cannot complete without payment
  - [ ] 409 Conflict: Booking already completed
  - [ ] 400 Bad Request: Invalid payment amount
  - [ ] 404 Not Found: Booking not found

### Task 1.2.4: Frontend Components

[ ] **POS Dashboard Payment UI:**
  - [ ] Add "Collect Payment" button (visible if UNPAID)
  - [ ] Add payment collection modal/dialog:
    - [ ] Amount input (pre-filled with remaining balance)
    - [ ] Payment method dropdown (CARD/CASH)
    - [ ] Customer name field
    - [ ] Seat selector (1-4)
    - [ ] Submit button
    - [ ] Cancel button
  
  - [ ] Display current payment status:
    - [ ] Show each payment record (customer name, amount, method)
    - [ ] Show remaining balance
    - [ ] Show total collected vs. total price

[ ] **Booking Completion UI:**
  - [ ] Add "Complete Booking" button (visible if PAID)
  - [ ] Confirmation dialog before completion
  - [ ] Display completion timestamp after success

[ ] **Admin Override UI:**
  - [ ] Add admin menu to change status
  - [ ] Status dropdown: BOOKED | COMPLETED | CANCELLED | EXPIRED
  - [ ] Warning confirmation dialog
  - [ ] Audit log display

[ ] **Status Display Updates:**
  - [ ] Update all status labels: BOOKED instead of CONFIRMED
  - [ ] Update colors/badges for new statuses
  - [ ] Update timeline filtering (hide CANCELLED, EXPIRED)
  - [ ] Update dashboard past booking styling

### Task 1.2.5: API Service Updates

[ ] **frontend/src/services/pos-api.ts:**
  - [ ] Add `recordPayment(bookingId, { amount, paymentMethod, customerName, seatIndex })`
  - [ ] Add `completeBooking(bookingId)`
  - [ ] Add `adminChangeStatus(bookingId, { bookingStatus?, paymentStatus? })`
  - [ ] Update existing endpoints for new schema

### Task 1.2.6: Testing

[ ] **Unit Tests:**
  - [ ] bookingRepo: payment functions (createPayment, getTotal, validate)
  - [ ] bookingRepo: status transitions (BOOKED→COMPLETED, etc.)
  - [ ] bookingRepo: validation rules (prevent invalid states)

[ ] **Integration Tests:**
  - [ ] Single payment flow (one customer pays for all)
  - [ ] Split payment flow (3 seats pay separately)
  - [ ] Partial payment detection (remaining balance > 0)
  - [ ] Cannot complete without all payments
  - [ ] Cannot cancel after PAID
  - [ ] Admin override works

[ ] **Frontend Tests:**
  - [ ] Payment collection modal opens/closes
  - [ ] Payment form validation (amount, customer name)
  - [ ] Payment recorded and UI updates
  - [ ] Complete booking button disabled if unpaid
  - [ ] Correct status displayed in timeline

[ ] **E2E Tests:**
  - [ ] Complete booking workflow (payment → complete)
  - [ ] Split payment workflow (3 customers, collect sequentially)
  - [ ] Admin override (change status manually)

### Task 1.2.7: Migration & Data

[ ] **Data Migration:**
  - [ ] Run migration on development database
  - [ ] Verify no data loss (all bookings still present)
  - [ ] Verify status conversions (CONFIRMED→BOOKED)
  - [ ] Create initial BookingPayment records from existing paid bookings
  - [ ] Test on staging database

[ ] **Backward Compatibility:**
  - [ ] Ensure API responses handle old schema gracefully
  - [ ] Document breaking changes in CHANGELOG
  - [ ] Update example API requests in README

### Task 1.2.8: Documentation & Alerts

[ ] **Documentation Updates:**
  - [x] Create `/docs/BOOKING_STATUS_FLOW.md` with complete flow diagrams ✅
  - [ ] Update `README.md` with new status model
  - [ ] Update API documentation with new endpoints
  - [ ] Add migration notes to README
  - [ ] Create admin guide for payment collection

[ ] **Alert System (Phase 2 Task):**
  - [ ] Flag incomplete bookings (UNPAID + past endTime)
  - [ ] Dashboard warning badge for pending payments
  - [ ] Daily report of uncollected payments
  - [ ] Auto-expire after 30 days (configurable)
  - Add as separate Phase 2 task

### Success Criteria

- ✅ All CONFIRMED bookings converted to BOOKED
- ✅ Split payments tracked in BookingPayment table
- ✅ Cannot complete without all payments
- ✅ Staff can manually collect payments per seat
- ✅ Admin can override any status
- ✅ All tests passing
- ✅ No data loss during migration
- ✅ API response time < 200ms for payment operations

### Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Data loss during migration | Test migration multiple times on dev/staging first |
| Existing integrations break | Maintain backward compatibility layer, deprecation warnings |
| Performance issues with payment queries | Add indices on BookingPayment table |
| Split payment logic errors | Comprehensive unit + integration tests |

---

### Phase 1 Summary & Success Metrics

**Success Metrics:**
- [ ] < 60 seconds to create walk-in booking
- [ ] Zero duplicate phone numbers in database
- [ ] 90% walk-ins register vs guest
- [ ] 100% phone search success rate
- [ ] < 500ms API response time
- [ ] Zero data loss during migration

**Phase 2 Roadmap (SMS Verification):**
- Phone verification via SMS OTP (Twilio/NHN Cloud)
- PhoneVerificationToken usage
- SMS booking confirmations
- Account recovery via OTP
- Phone-based login (OTP instead of password)
- Guest-to-registered migration tool
- Batch phone cleanup
- Blacklist (spam prevention)
- International phone support

---

## 🧹 Code Cleanup & Technical Debt

### UI Component Unification

**Button Components:**
- ✅ DashboardPage: All buttons unified (2025-10-20)
- ✅ BookingDetailPage: Using unified Button
- ✅ MenuManagementPage: Back button unified
- [ ] MenuManagementPage: Convert remaining raw `<button>` elements
- [ ] AdminPage: Audit and convert raw buttons
- [ ] BookingModal: Check button consistency
- [ ] Other components: Global audit for raw `<button>` usage

**Tabs Components:**
- [ ] DashboardPage has local Tabs implementation (TabsContext, etc.)
- [ ] primitives.tsx has different Tabs implementation
- [ ] Consolidate into single reusable Tabs component

**Design Tokens:**
- [ ] Extract common colors (amber-500, slate-700, etc.) into constants
- [ ] Define standard spacing and sizing scales
- [ ] Create typography variants
- [ ] Consider CSS variables or Tailwind theme extension

**Component Documentation:**
- [ ] Document Button component props and variants
- [ ] Add usage examples for all UI primitives
- [ ] Create Storybook or component gallery (optional)

---

## 🧪 Testing & Quality Assurance

### Web POS End-to-End Testing (Production) – 🔄 IN PROGRESS

**Status:** 🔄 In Progress  
**Priority:** HIGH - All migration features complete, ready for comprehensive testing  
**Environment:** Production (k-golf.inviteyou.ca)  
**Estimated Time:** 4-6 hours

**Prerequisites:**
- [x] Phase 1 Frontend Migration Complete
- [x] Phase 1.6 Booking Detail Page Complete
- [x] Phase 1.7 Menu Management Complete
- [x] All features deployed to production
- [x] Production database seeded with test data (133 bookings)
- [ ] Admin credentials verified
- [ ] Mobile devices available for testing

**Test Plan:**

1. **POS Dashboard Testing**
   - [ ] Visit k-golf.inviteyou.ca and login as admin
   - [ ] Verify POS dashboard loads with header (K-Golf POS, user email, logout)
   - [ ] Verify real-time clock updates every second
   - [ ] Verify room status cards display correctly (4 rooms)
   - [ ] Verify status legend (green=empty, yellow=occupied)
   - [ ] Test room card "Book" button opens booking modal (not customer page)
   - [ ] Test room card "Manage" button opens booking detail
   - [ ] Verify 5-second auto-refresh updates booking data
   - [ ] Check Timeline tab displays current week bookings
   - [ ] Verify timeline booking blocks are clickable

2. **Menu Management Testing**
   - [ ] Navigate to Menu tab, click "Open Menu Management"
   - [ ] Verify menu page loads with header and all UI sections
   - [ ] Test "Add Item" button opens form
   - [ ] Create new menu item with all fields (name, description, price, category, available)
   - [ ] Verify item appears in filtered list immediately
   - [ ] Test category filters (All, Food, Drinks, Appetizers, Desserts, Hours)
   - [ ] Test search functionality (by name and description)
   - [ ] Edit existing item and verify changes persist
   - [ ] Toggle availability status and verify badge updates
   - [ ] Delete item with confirmation dialog
   - [ ] Verify insights panel updates (total, available, unavailable, avg price)
   - [ ] Test "Back to Dashboard" button returns correctly
   - [ ] Refresh page and verify menu items persist

3. **Booking Detail Page Testing**
   - [ ] Click on existing booking from dashboard
   - [ ] Verify all sections load: customer info, booking info, payment status
   - [ ] Verify seat management section displays
   - [ ] Test add seats (1-10 max)
   - [ ] Test remove seats (cannot orphan items)
   - [ ] Add menu items to seats
   - [ ] Test move item between seats
   - [ ] Test split item across seats
   - [ ] Verify receipt calculations (subtotal, tax, total)
   - [ ] Test print seat bill button
   - [ ] Test print complete order button
   - [ ] Test "Back" button returns to dashboard
   - [ ] **Known Bug:** Actions panel (Complete/Cancel) buttons not showing - see Critical Bug #1

4. **Create Booking Flow Testing**
   - [ ] Click "Create Booking" button from dashboard header
   - [ ] Test Walk-in booking with existing customer (phone lookup)
   - [ ] Test Walk-in booking with new customer (auto-registration)
   - [ ] Test Walk-in booking as guest (no user account)
   - [ ] Test Phone booking with existing customer
   - [ ] Test Phone booking with new customer
   - [ ] Verify guest mode disabled for phone bookings
   - [ ] Test room selection dropdown
   - [ ] Test date/time picker
   - [ ] Test duration input (hours)
   - [ ] Test players count input
   - [ ] Verify booking appears in dashboard immediately
   - [ ] Verify booking appears in timeline view
   - [ ] Test modal close after successful creation

5. **Room Management Testing**
   - [ ] Navigate to "Room Management" tab
   - [ ] Verify all 4 rooms display with details
   - [ ] Test room status dropdown (Active/Maintenance/Closed)
   - [ ] Verify status change reflects in room status cards
   - [ ] Verify today's bookings list for each room
   - [ ] Click booking in list, verify navigation to detail page
   - [ ] Test room capacity and hourly rate display

6. **Tax Settings Testing**
   - [ ] Navigate to "Tax Settings" tab
   - [ ] Verify current global tax rate displays
   - [ ] Click "Edit" button
   - [ ] Change tax rate value (e.g., 8% → 10%)
   - [ ] Click "Save" and verify success
   - [ ] Create new booking and verify new tax rate applied
   - [ ] Check receipt calculations use new tax rate
   - [ ] Click "Cancel" and verify changes rollback

7. **Mobile/Tablet Responsive Testing**
   - [ ] Access k-golf.inviteyou.ca from tablet (iPad/Android tablet)
   - [ ] Test all dashboard features on tablet
   - [ ] Verify touch interactions work (tap, scroll, swipe)
   - [ ] Test menu management on tablet
   - [ ] Test booking creation flow on tablet
   - [ ] Access from phone (iPhone/Android phone)
   - [ ] Verify responsive layout adapts correctly
   - [ ] Test core POS features on phone
   - [ ] Verify header and navigation work on small screens

8. **Performance & Reliability Testing**
   - [ ] Monitor page load times (< 3 seconds)
   - [ ] Test with slow network connection
   - [ ] Verify error handling (network errors, validation errors)
   - [ ] Test concurrent access (multiple browsers/devices)
   - [ ] Monitor auto-refresh behavior (5-second polling)
   - [ ] Check browser console for errors
   - [ ] Verify no memory leaks (check DevTools Performance)

9. **Documentation & Bug Reporting**
   - [ ] Document test results in spreadsheet or markdown table
   - [ ] Take screenshots of any bugs found
   - [ ] Record steps to reproduce each bug
   - [ ] Categorize bugs by severity (Critical/High/Medium/Low)
   - [ ] Update TASKS.md with any new issues found
   - [ ] Create GitHub issues for bugs if needed

**Known Issues to Verify:**
- **Critical Bug #1:** Booking Detail Actions Panel (RESOLVED - verify fix works)
- **New Bug:** Customer booking page shows no available slots (needs investigation)

**Success Criteria:**
- [ ] All core POS features functional on production
- [ ] No critical bugs blocking usage
- [ ] Mobile/tablet experience acceptable
- [ ] Performance meets requirements (< 3s load time)
- [ ] All test scenarios documented

**Next Steps After Testing:**
- Fix any critical bugs found
- Document minor issues for future sprints
- Update TASKS.md with testing completion status
- Monitor production usage for issues
- Consider Print Queue implementation if thermal printer needed

---

### Electron POS E2E Testing (Legacy) – ✅ Partially Complete

**Note:** This section relates to the legacy Electron POS app. Web POS testing is above.

**Completed:**
[x] Playwright E2E testing framework installed
[x] Test structure at `pos/tests/`
[x] Database helper with reset/seed functions
[x] Comprehensive booking creation test
[x] Test fixtures (customers.json, bookings.json)
[x] Automated test database setup script
[x] Documentation in `pos/tests/E2E_TESTING_GUIDE.md`
[x] Fixed Button component to forward data-testid prop

**Test Status: 3/5 Passing ✅**

**Passing Tests:**
- ✅ Should create walk-in booking with existing customer
- ✅ Should create walk-in booking as guest
- ✅ Should handle validation errors

**Failing Tests (Functional Issues):**

1. **"should create walk-in booking with new customer"**
   - Issue: Modal doesn't close after successful booking
   - Root Cause: Backend API/onSuccess callback not triggering modal close
   - Location: `pos/tests/e2e/booking/create-booking.spec.ts:85`

2. **"should disable guest mode for phone bookings"**
   - Issue: Continue button remains enabled for guest + phone booking
   - Root Cause: React state update timing or validation logic
   - Location: `pos/tests/e2e/booking/create-booking.spec.ts:150`

**Pending Test Tasks:**
- [ ] Set up test database: `cd backend && npm run db:setup-test`
- [ ] Install Playwright: `cd pos && npm install && npx playwright install`
- [ ] Configure test environment: Copy .env.example to .env.test
- [ ] Update TEST_DATABASE_URL in .env.test
- [ ] Fix modal close issue in booking creation
- [ ] Fix guest mode validation for phone bookings
- [ ] Test all three customer modes (existing/new/guest)
- [ ] Run full E2E suite: `npm run test:e2e:ui`

---

## ✅ Completed Tasks Archive

<details>
<summary>Gift Card Payment Method - 2026-02-28</summary>

**Added GIFT_CARD as a payment method alongside CARD and CASH:**
[x] Backend: Added `GIFT_CARD` to zod validation schemas (`updatePaymentStatus`, `payInvoice`)
[x] Frontend POS: Added Gift Card button (3-column grid) with `Gift` icon in booking detail payment UI
[x] Frontend POS: Updated paid invoice display to show Gift Card with icon
[x] Frontend API: Updated `payInvoice` type in `pos-api.ts` to accept `GIFT_CARD`
[x] Updated Prisma schema comment to document `GIFT_CARD` as valid payment method
</details>

<details>
<summary>Coupon Scheduler Case Mismatch Fix - 2026-02-28</summary>

**Fixed birthday/loyalty coupon scheduler not finding coupon types:**
[x] Root cause: scheduler queried `name = 'BIRTHDAY'` (uppercase) but DB had `name = 'birthday'` (lowercase)
[x] Fixed `couponScheduler.ts` — changed to lowercase `'birthday'` and `'loyalty'`
[x] Fixed `emailService.ts` — updated switch/case and subject line conditionals to match lowercase
[x] Updated birthday coupon default amount from $10 to $35 in production DB
[x] Manually created and emailed birthday coupon for James McKee (KGOLF-JE5G, $35)
</details>

<details>
<summary>Backend Logging System with Pino - 2026-02-25</summary>

**Structured Logging Implementation:**
[x] Created shared pino logger module (`backend/src/lib/logger.ts`) — JSON in prod, pino-pretty in dev
[x] Installed `pino-http` for automatic request/response logging with `reqId` correlation
[x] Added request logging middleware to `server.ts` — logs method/url/statusCode/responseTime for all requests
[x] Replaced all 98 `console.log/error/warn` calls across 12 backend route files + middleware + services + jobs
[x] All route errors now use `req.log.error({ err, ...context }, 'message')` for structured backtracing
[x] Added global Express error handler (catch-all middleware for unhandled route errors)
[x] Added process crash handlers (`unhandledRejection`, `uncaughtException`) with fatal-level logging
[x] Removed stale `@types/pino` v7 dependency (pino v9 ships its own types)

**Docker Log Rotation:**
[x] Added `logging: { driver: json-file, options: { max-size: "15m", max-file: "10" } }` to `docker-compose.release.yml`
[x] Applied to both `backend` and `db` services (~150MB cap each)
[x] CI/CD auto-picks up config changes via `docker compose up -d`

**Frontend Error Handling:**
[x] Created `ErrorBoundary` React component wrapping top-level `<App />`
[x] Catches unhandled render crashes with fallback UI and "Go to Home" button
[x] Shows error stack in dev, clean message in prod
[x] Added `console.log` stripping in production builds via Terser `pure_funcs` config
[x] `console.error` and `console.warn` preserved in prod for debugging

**Files changed:**
- `docker-compose.release.yml` — log rotation config
- `backend/src/lib/logger.ts` — new shared pino logger
- `backend/src/server.ts` — pino-http middleware, global error handler, crash handlers
- `backend/src/routes/*.ts` (12 files) — all `console.*` → `req.log.*`
- `backend/src/middleware/requireAuth.ts` — `console.error` → `logger.error`
- `backend/src/services/emailService.ts` — `console.*` → `log.*` (child logger)
- `backend/src/jobs/couponScheduler.ts` — `console.*` → `log.*` (child logger)
- `backend/package.json` — added pino-http, removed @types/pino
- `frontend/components/ErrorBoundary.tsx` — new React error boundary
- `frontend/src/main.tsx` — wrapped App with ErrorBoundary
- `frontend/webpack.config.js` — Terser config to strip console.log in prod

</details>

<details>
<summary>Frontend Build & Deployment (Phase 1.8) - 2025-11-08</summary>

**Production API URL Fix (2025-11-06):**
[x] Fixed frontend API calls to use relative URLs instead of localhost
[x] Updated backend Dockerfile to set `REACT_APP_API_BASE=` (empty string)
[x] Fixed webpack DefinePlugin to handle empty string correctly
[x] Changed from `|| 'http://localhost:8080'` to explicit undefined check
[x] Deployed fix (commit d81e5c3: "fix: properly handle empty string for REACT_APP_API_BASE")
[x] Verified login works in production at k-golf.inviteyou.ca

**Build Path Simplification (2025-11-08):**
[x] Refactored frontend build output path for consistency across dev/prod
[x] Frontend now builds to `frontend/dist` then copies to `backend/public`
[x] Backend dev mode (`tsx watch`) serves from `backend/public`
[x] Backend production build copies `backend/public` → `backend/dist/public`
[x] Simplified webpack config: always outputs to `dist` (no conditional paths)
[x] Simplified server.ts: always uses `../public` relative to `__dirname`
[x] Added `backend/public` to .gitignore (build artifact)
[x] Commit eadde42: "refactor: simplify frontend build output path"

**Architecture Consolidation:**
[x] Unified deployment: Single Node.js container serving both frontend and API
[x] TypeScript structure: `rootDir: "."` compiles to `dist/src/server.js`
[x] Path resolution works in all environments:
  - Dev: `src/../public` = `backend/public`
  - Prod: `dist/src/../public` = `backend/dist/public`
  - Docker: `/app/dist/src/../public` = `/app/dist/public`
[x] Docker multi-stage build: frontend → backend → runner
[x] Environment strategy: Empty string for production (relative URLs), localhost fallback for dev

**Deployment Pipeline:**
[x] GitHub Actions: Build image → Push to GHCR → SSH to server → Pull & restart
[x] Server: DigitalOcean droplet 147.182.215.135, Nginx reverse proxy on port 8082
[x] Docker Compose: Automated migrations and seeding
[x] Database: PostgreSQL 16, all tables healthy, admin user seeded

</details>

<details>
<summary>Authentication & Database (2025-10-19)</summary>

[x] Simplified authentication to single admin
[x] Updated middleware to use admin@kgolf.com
[x] Removed POS-specific admin from seed script
[x] Applied database changes
[x] Seed script ran successfully (admin + 4 rooms)

</details>

<details>
<summary>POS Core Features (Phase 0.6)</summary>

[x] Admin Dashboard & Booking Detail UI (0.6b)
[x] Booking Detail Ordering + Menu Management (0.6c)
[x] Advanced Seat Management System (0.6e)
[x] Global Tax Rate Management (0.6f)
[x] Server-Side Pagination & Database Seeding (0.6g)
[x] Room Status Queue-Based Sync (0.6d)
[x] Scheduled Push Loop (0.9)
[x] Development Logging Consolidation (0.9.1)

</details>

<details>
<summary>Backend Phone System (Phase 1.1-1.6)</summary>

[x] Database schema migration (phone-based system)
[x] Phone utility functions (normalize, format, validate)
[x] User lookup & recent customers API
[x] Admin booking creation API (3 customer modes)
[x] Phone input component (Canada +1 only)
[x] Customer search component
[x] Bug fix: Phone uniqueness & email setup

</details>

<details>
<summary>POS Menu System & Seat Management (2025-10-22)</summary>

**Seat Management Fixes:**
[x] Fixed seat reduction bug (React useEffect loop)
[x] Decoupled seat count from player count (max 10 seats)
[x] Added seat validation (prevents orphaning items)
[x] Extended color palette to 10 seats

**Menu Migration (Phase 1 - SQLite):**
[x] Added MenuItem and OrderItem tables to pos.sqlite
[x] Implemented menu CRUD operations (core/menu.ts)
[x] Created IPC handlers for 7 menu operations
[x] Integrated menu loading in BookingDetailPage
[x] Added hours as menu category (1-5h, $30-$150)
[x] Auto-add booking hours to seat 1 on new bookings
[x] Consolidated menu tables with existing sync database
[x] Seed function for 17 initial menu items

**Documentation:**
[x] Created MENU_MIGRATION_PLAN.md (Phase 1 & 2 strategy)
[x] Created phase_1_menu_migration_complete.md

**Backend:**
[x] Added guest mode support for bookings (backend/src/routes/booking.ts)

</details>

---

## 📌 Quick Reference

### Database Scripts
```bash
# Development database
npm run db:seed:dev

# Test database
npm run db:seed:test

# Generic seed (uses .env DATABASE_URL)
npm run db:seed
```

### POS Development
```bash
# Run POS in development mode
cd pos/apps/electron && npm run dev

# Build POS
cd pos/apps/electron && npm run build

# Run E2E tests
cd pos && npm run test:e2e:ui
```

### Backend Development
```bash
# Development mode (kgolf_app database)
npm run dev

# Test mode (k_golf_test database)
npm run dev:test

# Run tests
npm test
npm run test:unit
npm run test:e2e
```

---

**Last Updated:** 2026-03-03
**Version:** 1.2 (Updated: Frontend build path simplification)

<details>
<summary>Monthly PDF Report Fix & Quick Sale Feature - 2026-03-03</summary>

**Monthly PDF Report Number Mismatch Fix:**
[x] Root cause: report used `completedAt` filter but most completed bookings had `completedAt=NULL` → Sales Breakdown showed $0
[x] Also: old logic used `booking.price` for room revenue causing double-counting with HOURS orders
[x] Fix: rewrote `monthlyReportRepo.ts` to derive everything from paid invoices (single source of truth)
[x] Sales breakdown now traces paid invoices → bookings → orders (only paid seats counted)
[x] Room revenue = invoice subtotals - menu orders (captures both tracked and untracked room charges)
[x] Net sales from `sum(invoice.subtotal)` guarantees Grand Total = Payment Types Total
[x] Open invoices query uses `startTime` instead of `completedAt`
[x] Verified against production: Grand Total ($13,997.96) = Payment Types Total ($13,997.96) — $0 difference

**Quick Sale Feature (POS):**
[x] Backend: `POST /api/bookings/simple/quick-sale` — auto-creates $0 booking under admin account, `bookingSource: 'QUICK_SALE'`, no conflict check
[x] Frontend: Quick Sale button (purple, ShoppingBag icon) on POS dashboard
[x] Frontend: `BookingDetailWrapper` component to pass route params to `POSBookingDetail`
[x] Fix: Navigate path `/pos/booking/:id` (singular, not `/pos/bookings/`)
[x] Hide QUICK_SALE bookings from Room Status and timeline bars
[x] Exclude QUICK_SALE from total hours badge calculation

**Responsive Layout Fixes:**
[x] Admin tabs: `flex flex-wrap h-auto gap-1`, smaller text on mobile
[x] POS header: `flex-col` on mobile → `flex-row` on sm, buttons `size="sm"`

Commits: `5f354cf` (quick sale), `a795b3d` (bug fixes), `3f75a15` (responsive), `380ecf7` (report fix)
</details>

<details>
<summary>Daily Report & Gift Card Display - 2026-02-28</summary>

**Gift Card Display Fixes:**
[x] Monthly PDF report: Added `formatPaymentMethod()` helper to prettify labels (GIFT_CARD → Gift Card)
[x] Revenue chart: Added purple gift card bar + tooltip row in `MonthlyRevenueChart.tsx`
[x] Receipt: Prettified payment method display in `Receipt.tsx`
[x] Revenue history API: Track `giftCardRevenue` separately, fix `otherRevenue` calculation

**Daily Report (New Feature):**
[x] Backend: Created `dailyReportRepo.ts` with `getDailySummary()` — payment breakdown, tips, tax, bookings, invoices
[x] Backend: Added `GET /api/reports/daily-summary?date=YYYY-MM-DD` endpoint in `reports.ts`
[x] Frontend: Daily report UI in Reports tab with date navigation (←/→/Today)
[x] Frontend: Chart-tooltip-style table with payment color dots, indented sub-rows
[x] Fix: Timezone bug — parse YYYY-MM-DD into Atlantic noon via `buildAtlanticDate` for correct `dayRange()`

Commit: `805ea27`
</details>

````
