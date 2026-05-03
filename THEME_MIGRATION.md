# Theme Migration Plan

This document tracks the surfaces that should be migrated to the new Mission Control visual system, and whether we can support a user-facing switch between the old style and the new style.

## Goal

- Keep the accepted Mission Control dashboard direction.
- Migrate staff/admin operational surfaces one by one instead of restyling the entire app at once.
- Preserve customer-facing pages with a softer brand style where Mission Control would feel too heavy.
- Avoid large rewrites by standardizing shared shells first: page shell, panel/card, dialog, alert dialog, popover, table, form input, and action buttons.

## Feasibility: old vs new style toggle

Yes, it is feasible to add a button that swaps between the old style and the new Mission Control style, but the implementation should be scoped carefully.

### Recommended approach

1. Add a small theme mode state, for example `classic` and `mission-control`.
2. Persist the choice in `localStorage`.
3. Apply the mode to the app root with a data attribute, for example:

```tsx
<div data-ui-theme={themeMode}>
  ...
</div>
```

4. Move colors, borders, panel backgrounds, text colors, and button treatments into CSS variables.
5. Put the toggle button in staff/admin chrome first, likely `AdminHeader` or the POS dashboard header.

### Current infrastructure

The switch foundation is now in place:

- `frontend/hooks/use-ui-theme.ts` — owns `classic` / `mission-control`, persists to `localStorage`, synchronizes mounted controls through a shared store, syncs browser tabs, and sets `document.documentElement.dataset.uiTheme`.
- `frontend/components/UiThemeToggle.tsx` — shared Old/New switch button for admin, Mission Control, and embedded panel contexts.
- `frontend/src/App.tsx` — adds `data-ui-theme` to the app root.
- `frontend/src/main.tsx` — initializes the stored theme before React renders to reduce flicker.
- `frontend/styles/globals.css` — defines `kg-*` migration tokens, utility classes, and temporary Old/New overrides for existing Mission Control `mc-*` surfaces.
- `frontend/src/pages/pos/dashboard.tsx` — route-level Old/New wrapper.
- `frontend/src/pages/pos/dashboard-old.tsx` — old dashboard layout copied from `main`.
- `frontend/src/pages/pos/dashboard-mission-control.tsx` — new Mission Control dashboard layout; booking detail opens as a dedicated page instead of the old full-workflow modal.
- `frontend/src/pages/pos/booking-detail.tsx` — route-level Old/New wrapper for booking detail.
- `frontend/src/pages/pos/booking-detail-old.tsx` — old booking detail workflow copied from `main`.
- `frontend/src/pages/pos/booking-detail-mission-control.tsx` — new booking detail workflow target with the accepted compact Payment Summary/Menu-under-actions layout and reusable MC utility cleanup in place; page-local modals are the next pass.

Use these utility classes during migration:

| Class | Purpose |
|---|---|
| `kg-page` | Theme-aware page background and text color |
| `kg-app-header` | Theme-aware admin/POS header surface |
| `kg-panel` | Theme-aware card/panel shell |
| `kg-panel-raised` | Raised card or inner panel shell |
| `kg-dialog` | Theme-aware dialog shell |
| `kg-popover` | Theme-aware popover shell |
| `kg-row` | Theme-aware table/list row |
| `kg-input` | Theme-aware input/select shell |
| `kg-button` | Theme-aware secondary action |
| `kg-button-primary` | Theme-aware primary action |
| `kg-title` | Theme-aware primary title text |
| `kg-meta` / `kg-meta-dim` | Theme-aware secondary/tertiary text |
| `kg-divider` | Theme-aware border color |
| `kg-theme-toggle` | Theme-aware Old/New switch button with active-state thumb |

### What the toggle can safely swap

- Colors
- Borders
- Background surfaces
- Dialog shells
- Popover shells
- Button variants
- Form inputs
- Table rows
- Scrollbar treatment
- Panel/card style

### What the toggle should not swap at first

- Major layout structure
- Different component trees
- Business-flow behavior
- Payment/booking logic

For pages where the new version changes the layout substantially, keep the toggle as a feature flag around a page-level wrapper or route variant. Do not maintain two large versions of the same workflow for long.

### Practical recommendation

Start with a staff-only toggle for POS/admin pages. Do not apply the full Mission Control look to public booking, auth, or marketing pages by default; those should use shared brand tokens but stay customer-friendly.

### Full old UI compatibility

The current switch foundation can handle large UI changes, but the real old UI from `main` should not be recreated with CSS tokens alone. The old POS dashboard is a different component layout built with `Card`, `Tabs`, and the inline manager panel, while the new dashboard uses Mission Control panels, side rails, the Attention/Data Stream/Log row, and a Manager Console overlay.

To make **Old** mean the exact pre-redesign UI, keep a copy of the `main` dashboard implementation as an old variant, keep the current Mission Control dashboard as the new variant, and render one or the other from the route based on the theme mode. That is now the dashboard structure:

- `dashboard.tsx` chooses Old/New.
- `dashboard-old.tsx` holds the old layout.
- `dashboard-mission-control.tsx` holds the new layout.
- New dashboard booking clicks navigate to `/pos/booking/:id`; Old dashboard keeps the legacy modal-compatible behavior.

For other components, only fork files when the component structure or workflow meaning changes. Shared behavior components such as API calls, booking detail modals, confirmation dialogs, receipt capture, and clock-in flows should stay shared unless the new design requires a different layout. When a shared component does need a large redesign, use the same pattern: keep `component-old.tsx` and `component-mission-control.tsx` temporarily, route through a tiny wrapper, then delete the old file after the new UI is accepted.

## Consolidated migration tracker

Status key: `Done`, `Todo`, `Review`, `Skip`.

Model key:

- `Full MC`: full Mission Control treatment for staff/admin operational workflows.
- `MC Shell`: shared shell/surface component used by multiple pages.
- `MC Component`: Mission Control component already migrated.
- `Brand Tokens`: lighter customer-facing polish using shared tokens, not full operator styling.
- `Dev/POC`: development or proof-of-concept route.
- `Skip/Review`: confirm usage before migrating.

| # | Target | Type | Priority | Status | Model | Notes |
|---:|---|---|---|---|---|---|
| 1 | `frontend/src/pages/pos/booking-detail.tsx` | POS booking detail wrapper | P0 | Done | MC Shell | Chooses Old or New booking detail based on the staff/admin theme toggle. |
| 2 | `frontend/src/pages/admin/customers.tsx` | Admin page + many dialogs | P0 | Todo | Full MC | Customer detail, coupon, booking, export, and settings-style surfaces. |
| 3 | `frontend/src/pages/pos/booking-modal.tsx` | Manual modal | P0 | Todo | Full MC | Create booking modal; currently custom fixed overlay. |
| 4 | `frontend/src/pages/pos/clock-modal.tsx` | Manual modal | P0 | Todo | Full MC | Staff PIN clock modal; good candidate for a game/HUD-style shell. |
| 5 | `frontend/src/pages/pos/receipt-capture-modal.tsx` | Manual modal | P0 | Todo | Full MC | Receipt upload/view modal; important operational flow. |
| 6 | `frontend/components/BookingDetailModal.tsx` | Shared modal wrapper | P0 | Todo | MC Shell | Wraps booking detail page inside a modal. |
| 7 | `frontend/components/ConfirmDialog.tsx` | Shared alert dialog | P0 | Todo | MC Shell | High leverage because many flows use it. |
| 8 | `frontend/components/OrderForm.tsx` | Shared order dialog | P1 | Todo | MC Shell | Legacy gray dialog used in order flow. |
| 9 | `frontend/src/pages/pos/menu-management.tsx` | POS page + dialog | P1 | Todo | Full MC | Menu management page and create/edit/delete dialogs. |
| 10 | `frontend/src/pages/pos/time-management.tsx` | POS admin page | P1 | Todo | Full MC | Large employee/time/receipt reconciliation surface. |
| 11 | `frontend/src/pages/pos/pending-receipts.tsx` | POS page | P1 | Todo | Full MC | Should match dashboard/receipt operational style. |
| 12 | `frontend/src/pages/pos/manager-panel.tsx` | Embedded manager surface + dialog | P1 | Todo | Full MC | PIN-gated manager tools now open from the dashboard Manager Console overlay. |
| 13 | `frontend/src/pages/admin/receipt-analysis.tsx` | Admin page | P1 | Todo | Full MC | OCR/receipt admin surface; good candidate for MC panel/table style. |
| 14 | `frontend/components/ui/time-picker.tsx` | Shared popover | P1 | Todo | MC Shell | Common time selector; popover should use shared MC popover class in POS contexts. |
| 15 | `frontend/components/policy-modal.tsx` | Public/customer modal | P2 | Todo | Brand Tokens | Can use shared dialog shell, but should stay customer-friendly. |
| 16 | `frontend/src/pages/receipt-test.tsx` | Dev/test page + dialog | P2 | Todo | Dev/POC | Receipt testing tool; lower priority unless actively used. |
| 17 | `frontend/src/pages/admin.tsx` | Legacy admin page | P2 | Review | Full MC | Old-style admin dashboard with slate cards; header has the theme toggle, full page migration still needs review. |
| 18 | `frontend/src/pages/dashboard.tsx` | Customer dashboard | P2 | Todo | Brand Tokens | Use softer shared tokens, not the full operator-console look. |
| 19 | `frontend/src/pages/booking.tsx` | Public booking page | P3 | Todo | Brand Tokens | Keep polished and brand-consistent, not Mission Control-heavy. |
| 20 | `frontend/src/pages/booking-confirmation.tsx` | Public confirmation page | P3 | Todo | Brand Tokens | Customer-facing confirmation page. |
| 21 | `frontend/src/pages/coupon.tsx` | Public coupon page | P3 | Todo | Brand Tokens | Customer-facing coupon page. |
| 22 | `frontend/src/pages/home.tsx` | Public home page | P3 | Todo | Brand Tokens | Marketing/public page; should not inherit staff dashboard style directly. |
| 23 | `frontend/src/pages/login.tsx` | Auth page | P3 | Todo | Brand Tokens | Brand-token cleanup only. |
| 24 | `frontend/src/pages/signup.tsx` | Auth page | P3 | Todo | Brand Tokens | Brand-token cleanup only. |
| 25 | `frontend/src/pages/forgot-password.tsx` | Auth page | P3 | Todo | Brand Tokens | Brand-token cleanup only. |
| 26 | `frontend/src/pages/reset-password.tsx` | Auth page | P3 | Todo | Brand Tokens | Brand-token cleanup only. |
| 27 | `frontend/src/pages/verify.tsx` | Auth/verification page | P3 | Todo | Brand Tokens | Brand-token cleanup only. |
| 28 | `frontend/src/pages/pos/attention-preview.tsx` | Dev page | P3 | Todo | Dev/POC | Already close to MC components. |
| 29 | `frontend/src/pages/pos/wallboard.tsx` | Dev/POC page | P3 | Todo | Dev/POC | Already uses MC components; migrate only if keeping route. |
| 30 | `frontend/src/pages/pos/booking-detail-old.tsx` | POS booking detail old variant | Done | Done | Skip/Review | Old booking detail workflow copied from `main`; temporary compatibility surface until New is accepted. |
| 31 | `frontend/src/pages/pos/index.tsx` | Router/access wrapper | Skip/tiny | Review | Skip/Review | Only loading/access-denied states need polish if desired. |
| 32 | `frontend/src/App.tsx` | App/router shell | Skip | Done | MC Shell | Exposes `data-ui-theme` for the staff/admin theme toggle foundation. |
| 33 | `frontend/src/pages/pos/dashboard.tsx` | POS dashboard wrapper | Done | Done | MC Shell | Chooses Old or New dashboard based on the staff/admin theme toggle. |
| 34 | `frontend/src/pages/pos/dashboard-old.tsx` | POS dashboard old variant | Done | Done | Skip/Review | Old dashboard layout copied from `main`; temporary compatibility surface until New is accepted. |
| 35 | `frontend/src/pages/pos/dashboard-mission-control.tsx` | POS dashboard new variant | Done | Done | Full MC | Accepted one-screen Mission Control dashboard layout with ADMIN/STAFF Manager Console overlay; booking detail opens page-first. |
| 36 | `frontend/components/mc/TimelineView.tsx` | MC component | Done | Done | MC Component | Unified with shared MC panel header. |
| 37 | `frontend/components/mc/MCAttentionBell.tsx` | MC popover component | Done | Done | MC Component | Unified with shared MC popover/panel styles. |
| 38 | `frontend/components/mc/MCAttentionList.tsx` | MC list component | Done | Done | MC Component | Unified with shared MC panel header and scroll styles. |
| 39 | `frontend/components/mc/MCDataStream.tsx` | MC panel component | Done | Done | MC Component | Unified with shared MC panel header and scroll styles. |
| 40 | `frontend/components/mc/MCLogTail.tsx` | MC panel component | Done | Done | MC Component | Unified with shared MC panel header and scroll styles. |
| 41 | `frontend/components/mc/MCLogDetailDialog.tsx` | MC dialog component | Done | Done | MC Component | Unified with shared MC dialog/code-block styles. |
| 42 | `frontend/components/mc/MCTaxDialog.tsx` | MC dialog component | Done | Done | MC Component | Unified with shared MC dialog/input styles. |
| 43 | `frontend/components/mc/MCRoomRail.tsx` | MC rail + popover | Done | Done | MC Component | Unified room-status popover and rail scroll behavior. |
| 44 | `frontend/components/mc/MCSection.tsx` / `MCPanelHeader` | Shared MC primitive | Done | Done | MC Shell | Shared header primitive for label, meta, and right-side actions. |
| 45 | `frontend/src/styles/mission-control.css` | Shared style primitives | Done | Done | MC Shell | Shared panel, compact panel, subpanel, dialog, popover, input, action button, metric tile, status, code-block, and scrollbar classes. |
| 46 | `frontend/hooks/use-ui-theme.ts` | Theme state hook | Done | Done | MC Shell | Persists `classic` / `mission-control` and syncs the root dataset. |
| 47 | `frontend/components/UiThemeToggle.tsx` | Theme toggle button | Done | Done | MC Shell | Shared Old/New switch used by `AdminHeader`, legacy `/admin`, and Manager Panel. |
| 48 | `frontend/components/AdminHeader.tsx` | Staff/admin chrome | Done | Done | MC Shell | Shows the theme toggle for ADMIN and STAFF users. |
| 49 | `frontend/src/pages/pos/booking-detail-mission-control.tsx` | POS booking detail new variant | P0 | Done | Full MC | Accepted compact layout is in place: booking header, Payment Summary above Seat Detail, Quick Actions/Menu right rail, reusable MC spacing/color/action utilities, and unchanged business handlers. Next pass: page-local dialogs/modals. |

## Suggested sequence

1. Standardize booking-detail page-local dialogs/modals now that the page shell is accepted.
2. Standardize shared shells: `ConfirmDialog`, `BookingDetailModal`, and core form/dialog helpers.
3. Migrate `admin/customers.tsx`.
4. Migrate the three manual POS modals: booking, clock, receipt capture.
5. Migrate remaining POS/admin operational pages.
6. Apply lighter brand-token cleanup to public/auth pages.
