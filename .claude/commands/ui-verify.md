# /ui-verify — rent-runner

Screenshot capture + comparison for UI ACs, used standalone or invoked from `/ac-verify`.

## Setup

- Chromium via Playwright (`npx playwright test`, install with `npx playwright install chromium` if missing).
- Dev server must be running at `http://localhost:3000` (`npm run dev`).
- Viewports: **375×667** (mobile), **768×1024** (tablet), **1440×900** (desktop) — all three, every time. Since the app is a single A2UI-rendered chat surface per role rather than many hand-built pages, most "pages" to check are really *surface states* within the same route: empty/loading, populated, error, and mid-form (two-way-bound input before dispatch).

## What to check per surface

1. **Layout integrity** — no horizontal scroll, no clipped/overflowing text, chat input always reachable, at all 3 viewports.
2. **Role correctness** — the surface shown matches the session's resolved role (public booking chat vs. owner/vendor/contractor `(app)` shell) — screenshot the `/api/whoami` response alongside the page to cross-check.
3. **A2UI catalog components** render their bound data model correctly (`PropertyCard`, `UnitCard`/`Form`, `BookingCalendar`, `ContractCard`, `WorkOrderList`, `PaymentSummary`, chat bubbles) — check against `docs/plans/ac-patterns.md`'s A2UI component pattern.
4. **Pico.css baseline** — semantic elements (`article`, `form`, `dialog`, buttons) render with Pico's default theming, no unstyled/raw-HTML flash.
5. **Empty/loading/error states** exist and are legible — not blank white screens.
6. **Keyboard-only pass** (required for Phase 7, spot-checked earlier): tab through the chat input, any rendered form fields, and action buttons without a mouse.

## Output

For each surface: 3 screenshots (one per viewport) + a one-line PASS/FAIL judgment per the check above, feeding into the relevant AC row's Agent/QC column.
