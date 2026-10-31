# VBC Member Care v4.0 — UI refresh

No database migration. No new npm dependency. Apply on top of v3.9 (020).

## What changed for staff

**Follow-ups opens on "Today's care"**
- The welcome banner is gone; the call list is near the top on every screen size.
- New red **Overdue** card. Every card filters or jumps to the list.
- "Ready to join" shows the next Membership Sunday date.
- On phones the cards become a swipeable strip.

**Act from the list**
- Each row has **Call** (only when contact is permitted), **WhatsApp** and **Log outcome**.
- Log outcome opens the person and the outcome form in one tap.

**Find anyone fast**
- Press `/` or Ctrl/⌘+K, or use **Find a person** in the top bar.
- Searches through the existing journey API, so staff only see people they already have access to.

**Person profile**
- Nine tabs became five: Journey, Contact log, Membership & CFC, Community, WhatsApp.
- **Call** sits in the header. On phones a pinned Call / WhatsApp / Log outcome bar appears.
- Forms open as bottom sheets on phones, with Save pinned to the bottom.
- WhatsApp methods read "From my phone" and "Church line · Official API"; the selected option is now readable.

**Home Cell Office dashboard**
- Stat cards first. The Transfer Requests panel is hidden on the dashboard while it is empty; it still appears in Members and whenever a request exists.
- Quick Actions use one red action (Take Attendance) and are hidden on wide screens, where the sidebar already has those links.

**Everywhere (Follow-ups, Home Cell, Leadership, login)**
- New shared tokens in `src/app/tokens.css`. Church red is the one primary colour.
- No text below 12px; body text 14px; 44px touch targets on new controls.

## Changed files
- `src/app/tokens.css` (new) and `src/app/layout.tsx` (loads it first)
- `src/components/CommandPalette.tsx` (new)
- `src/components/JourneyDesk.tsx`, `src/components/journey.css` (new rules are in the clearly marked v4.0 block at the end)
- `src/components/WhatsAppInvitations.tsx`
- `src/components/home-cell/HomeCellWorkspace.tsx`, `MemberTransfers.tsx`, `workspace.css`, `leadership-accounts.css`
- `src/app/home-cell/login/login.css`
- `tests/journey-browser.mjs`, `tests/whatsapp-browser.mjs` (renamed controls; new checks for the palette, row Call link and one-tap Log outcome)

## Verification
- `tsc --noEmit` clean; `next build --webpack` compiles.
- Full browser suite (`tests/home-cell-browser.mjs`, which also runs the journey and WhatsApp suites) passes against the mock Supabase server at 1440, 834 and 390px, light and dark.
- Not tested against your real Supabase project or on Netlify. Check on a staging deploy first.

## Run
```sh
npm ci
npm run typecheck
npm run build
```

## Not in this release
- Saving outcomes on the phone without network (needs an offline queue and sync).
- Bulk select / floating toolbar, Undo instead of confirmations, phone FAB menu.
- One shared sidebar across Follow-ups and Home Cell.
- The Church Office screens that still use sample data.
- Removing the now-unused banner styles in `journey.css`.

## Live demo build (optional)
`demo/` mounts the real `JourneyDesk` component against an in-browser mock API with fictional people, and bundles it into one HTML file. It is not used by the Next.js app.

```sh
npm i --no-save esbuild
node demo/build.mjs   # writes /mnt/user-data/outputs/vbc-member-care-demo.html — change the path in build.mjs for your machine
```
