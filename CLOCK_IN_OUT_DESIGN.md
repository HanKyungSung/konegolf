# Employee Clock In/Out — Design Notes

> **Date:** 2026-03-25
> **Status:** Brainstorming — no solution finalized yet

## Context

- Building a clock in/out system for Kone Golf
- Owner (parent) is in a different province — **limited physical support**
- All staff currently share a single account (`admin@konegolf.ca`)
- Staff can log into the POS (`pos.konegolf.ca`) from anywhere, including home
- **Key concern:** preventing staff from faking clock in/out remotely

## Problems to Solve

### 1. Identity — Who is clocking in?

All staff share one account, so we can't tell who's who from the session alone.

**Solution: Individual PINs**

- Each employee gets a unique 4–6 digit PIN
- New `Employee` table separate from `User` (no new login accounts needed)
- PIN entered at clock in/out time to identify the person

### 2. Location Fraud — Preventing remote clock-ins

Since the POS is accessible from anywhere, we need a way to verify the employee is physically at the store.

**Options Considered:**

| Approach | Fraud Resistance | Setup Effort | Remote-Maintainable | Notes |
|---|---|---|---|---|
| **Store IP whitelist** | ⭐⭐⭐⭐ | Low | ✅ | Hard to fake, but ISP may change the IP |
| **Geofencing (GPS)** | ⭐⭐⭐ | Low | ✅ | Stable, no hardware, spoofable with effort |
| **Rotating code on-site** | ⭐⭐⭐⭐⭐ | Medium | ⚠️ Needs display at store | Very secure, needs one-time physical setup |
| **Photo selfie on clock-in** | ⭐⭐⭐ (deterrent) | Low | ✅ | Evidence layer, easy to add |
| **Dedicated kiosk device** | ⭐⭐⭐⭐ | Medium | ⚠️ Needs one-time setup | Locks clock-in to one physical device |

### IP Whitelist Concerns

- Most business ISPs assign **dynamic IPs** that can change
- Workarounds: static IP from ISP (~$5–10/mo), or auto-update script on a store device
- Adds maintenance burden that's hard to debug remotely

## Candidate Approach (Not Final)

**PIN + Geofencing + Photo Capture**

- **PIN** → identifies the employee
- **Geofencing** → verifies they're at the store (within ~100m radius)
- **Photo capture** → deterrent + reviewable evidence
- No IP maintenance, no ISP dependency, no physical hardware needed
- GPS spoofing is possible but unlikely for casual staff
- Photo layer catches spoofing attempts anyway

**Pros:** Fully remote-deployable, zero hardware, low maintenance
**Cons:** GPS can be spoofed by determined staff; photo is a deterrent, not a hard block

## Integration Notes

- Staff already log into POS → clock in/out button on POS dashboard
- Existing infrastructure: Express.js backend, Prisma ORM, PostgreSQL, React frontend
- Could reuse daily email job pattern for shift summary reports
- Admin dashboard for remote monitoring (who's in, weekly hours, anomalies)

## Decision

> **Decided:** PIN-based clock in/out with a dedicated kiosk page on the store tablet.
> Individual Employee records (separate from User model) with scrypt-hashed PINs.
> Daily shift report email at 11 PM Atlantic.
> Admin dashboard for viewing/editing time entries and managing employees.
