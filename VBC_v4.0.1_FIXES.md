# VBC Member Care v4.0.1 — reviewed UI corrections

This release starts from your uploaded v4.0 UI refresh. It retains Today’s care, larger text, church-red primary actions, the reduced profile tabs, your Sunday flyer and the approved navy/light themes.

## Corrected

1. Command search immediately clears previous-query people. Results are tagged to the exact query, aborted requests cannot replace newer results, and requests have a 15-second timeout. Enter cannot select stale people. Keyboard navigation scrolls the active option into view.
2. Call shortcuts and the mobile WhatsApp shortcut respect active outreach status as well as contact permission. Paused, inactive and declined-contact records do not offer these shortcuts. Existing backend permission checks remain in place.
3. Ready to join opens the eligible Membership Sunday queue. Awaiting a friend opens active unassigned visitors. Overdue opens a server-filtered overdue queue. Filters reset on ordinary section navigation. Explicit queue selectors make the current selection visible.
4. The mobile Call / WhatsApp / Log outcome bar is fixed above the bottom navigation with safe-area spacing. Extra page clearance keeps the last content accessible while scrolling.
5. Package and lockfile versions now agree at 0.11.1; regression checks run in CI.

## Deploy

- If your database is already through 020, run the complete `supabase/021_journey_queue_filters.sql` in Supabase SQL Editor. It replaces the scoped journey-read function with additional server filters; it does not rewrite person records or change staff grants. Reruns are tested.
- If earlier migrations are missing, apply them in order through 021. Do not rerun historical 017 after the current migrations.
- Copy this version into your existing Git checkout and preserve your working environment variables.
- No new environment variables or production dependencies are needed. Existing WhatsApp API setup/disabled state is preserved.

```powershell
npm ci
npm run test:journey:queues
npm run typecheck
npm run build

git status
git add .
git commit -m "Fix care queues, search safety and mobile actions"
git push origin main
```

## Verification completed

- Production build and TypeScript checks passed.
- `test:journey:queues`: 36 combined database checks (30 existing journey checks plus six queue checks). Covers migration reruns, more than 30 overdue people, server pagination, counts matching queue totals, eligible/unassigned predicates, friend scope and Foundation restrictions.
- Full production browser suite passed at desktop/tablet/phone sizes in light/dark. New regressions cover delayed search plus Enter, all three card filters, paused/inactive Call/WhatsApp shortcuts and fixed mobile actions after scrolling a long profile. Existing Journey, WhatsApp and Home Cell browser flows also passed.
- `test:whatsapp`, `test:home-cell`, `test:gateway` and `test:reliability` passed.

Tests use local database/Auth fixtures, a real production Next.js server with mocked Supabase, and fictional records. No hosted database change, deployment or real message send was performed. A staging check with actual church accounts remains the final operational verification.

## Changed files

`CommandPalette.tsx`, `JourneyDesk.tsx`, `journey.css`, new migration 021, queue database/browser regression checks, package metadata, CI and release documentation. Historical SQL files, your v4.0 assets and the Home Cell redesign remain intact.
