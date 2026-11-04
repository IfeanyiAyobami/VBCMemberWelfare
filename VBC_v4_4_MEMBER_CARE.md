# VBC Member Care v4.4 — Member Care refresh + celebration greetings

Builds on v4.3 (Friend mode). **One new SQL migration: `supabase/026_celebration_greetings.sql`.** No new dependency or environment variable.

## Deploy order
1. Run `supabase/026_celebration_greetings.sql` in the Supabase SQL editor (safe to rerun).
2. Deploy this source.
If the app is deployed before the migration, Overview still works; the Send greeting button stays hidden until the table exists.

## What changed
**Menu (Church Office, Members, Guest cards)**
- Main menu shows only the sections that use real records: Overview, Members, Guest cards, Celebrations, Programmes.
- Campaigns, Newsletters, Templates, Automations, Delivery log and Settings are grouped under **Coming soon (6)**. They still open, but no longer look live.
- The permanent "STAFF LOGIN ACTIVE / MEMBER RECORDS ACTIVE" banner is removed.
- Active section is church red; the signed-in name shortens with "…" instead of breaking mid-word.

**Overview → This week**
- Cards: Guest cards to review (red when waiting), Celebrations this week, Church family (+ added this month).
- **Celebrating this week**, grouped by day. Today's people show Call and **Send greeting**, plus status: *Greeted by Grace · 09:14*, *Not greeted yet*, or *No celebration messages* (opted out).
- Next programme and **The guest journey** (New guest cards → In follow-up → Ready to join) with live counts.
- Removed: the "Every person matters" banner, the "Follow Through: OPEN" card, duplicate quick links, the month grid (it remains on Celebrations).

**Send greeting (from the staff member's own WhatsApp)**
- Opens WhatsApp with a ready birthday/anniversary message to the member's WhatsApp or phone number (Nigerian 080… numbers become 23480…). Staff can edit before sending.
- Then asks "Did you send the greeting?" → **Yes, record it**. Calling from the row asks the same after the call.
- Recorded once per person, occasion and year, under the signed-in staff member's name (set by the database, not the browser). No message text is stored.
- Shown only when the member has contact permission **and** celebration messages turned on. Administrators and editors can record; viewers see the status only.

**Members on phones**: cards (name, birthday/anniversary, status) instead of a cut-off table; filters no longer clipped.

**Guest cards** (renamed from Guest submissions): "Step 1 of the guest journey" bar with links to Follow-ups, and a small link to older paper cards (historical import). Linking a card to an existing member works as before.

**Readability**: no text below 12px in the older Member Care stylesheets (≈40 rules raised).

## Files
- New: `supabase/026_celebration_greetings.sql`, `src/app/api/celebrations/greet/route.ts`, `src/app/care-office.css`, `tests/greetings-database.mjs`, `tests/greetings-browser.mjs`
- Changed: `src/lib/care-runtime.js` (menu, This week, greeting flow), `src/app/api/celebrations/route.ts` (contact numbers, permissions, greetings), `src/components/CareApp.tsx`, `src/components/MemberDesk.tsx`, `src/components/GuestDesk.tsx`, `src/app/layout.tsx`, older CSS text sizes, `tests/home-cell-browser.mjs`, `tests/guest-browser.mjs`, `tests/member-care.cjs`, `package.json` / lock (0.14.0, `test:greetings`)

## Verification
- `tsc --noEmit` clean; `next build --webpack` compiles.
- `npm run test:greetings`: **11/11** — migration reruns; greeter name cannot be spoofed; one record per person/occasion/year; archived members, viewers, inactive staff and anonymous users are refused.
- Full browser suite: **57/57 PASS**, including This week, Send greeting (WhatsApp link, record, survives reload, no double greeting, opt-outs respected), Guest cards journey and phone layouts.
- Still pre-existing from v4.2, unchanged: `npm test` stops in the old Church Office sample-screen test (`tests/member-care.cjs`, now at "Member saved"; its Overview check was updated and passes).
- Not run against your hosted Supabase. After running 026, sign in as an editor on staging, greet one test member, refresh, and confirm "Greeted by …" stays.
