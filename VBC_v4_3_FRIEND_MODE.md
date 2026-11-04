# VBC Member Care v4.3 — Friend mode with offline-safe saving

Builds on v4.2. **No SQL migration. No new dependency. No new environment variable.**
Apply on top of v4.2 (migrations 001–025 unchanged).

## Who sees it
Staff whose only Follow-ups access is **Follow-through Friend** open `/followups` in Friend mode.
Coordinators, Foundation Class Coordinators and administrators keep the full screens.
A Friend can switch to the full view from Help (or "More options" on a person) and back with the **Friend mode** button. The choice is remembered on that phone.

## What Friends get
- **My people**: only their assigned people, grouped Contact today / Coming up / No date set, each with a one-line reason and Call / WhatsApp buttons. Call and WhatsApp appear only when contact is permitted and outreach is active.
- **After a call or WhatsApp**: "Did you reach …?" → Yes, we spoke · No answer · Asked me to call back · Doesn't want contact.
  - Yes: "Coming to church?" Sunday / Tuesday / Thursday / Not sure, then "When should you check in again?" Tomorrow / After that service (or In 2 days) / Next week / Pick a day. Optional note.
  - No answer: saved in one tap; reminder set for tomorrow 10:00.
  - Call back: choose Later today / Tomorrow / In 2 days / Pick a time.
  - Doesn't want contact: a short note is required (the server rule); the church stops all outreach as before.
  - Method and time fill in automatically. "We talked in person" records a conversation without calling.
- **"… came to church"**: pick the most recent Sunday, Tuesday or Thursday service (or an earlier date). It is saved with the Friend's name as `independently_confirmed`, source `church_staff`, and counts straight away.
- **Done today** and **Help** tabs.

## How Friend answers are recorded
| Friend chooses | Saved outcome |
|---|---|
| Spoke + Sunday/Tuesday/Thursday | Promised to return (note: "Plans to come on …") |
| Spoke + Not sure | Successful · undecided |
| No answer | No answer, next contact tomorrow 10:00 |
| Asked me to call back | Requested a callback, with the chosen time |
| Doesn't want contact | Requested no further contact |

Attendance service type: Friend mode uses a Journey policy service type whose name contains the day (e.g. "Tuesday"), else one containing "midweek" (Tue/Thu) or "Sunday"/"main" (Sun), else "Tuesday midweek service" etc. Every recorded church visit counts toward the journey whatever its type (current database rule).

## Offline-safe saving ("keep it until it sends")
- Every Friend update is written to the phone **before** sending, and removed only when the server confirms it.
- If there is no network, the Friend sees "Kept safe on this phone" and can keep working. Updates survive closing the app or the browser.
- Sending retries automatically when the network returns, when the app is reopened, and every 30 seconds; Friends can also press **Send now**.
- Retries cannot double-save: a retry repeats the exact request, which the server recognises. If the record changed in the meantime (409), the original was not applied, so it is rebuilt with the latest version.
- Updates the server refuses (for example, outreach paused by a Coordinator) are shown under **Review** with the reason, and can be retried or removed.
- Storage holds only unsent updates and today's short Done list, per signed-in staff member. **Sign out** from Help clears it and warns first if anything is still unsent.

## Files
- New: `src/components/FriendDesk.tsx`, `src/components/friend.css`, `src/lib/journey/outbox.ts`, `tests/friend-mode-browser.mjs`
- Changed: `src/components/JourneyDesk.tsx` (Friend mode switch), `tests/journey-browser.mjs` (friend-only fixture switch; one existing wait made race-free), `tests/home-cell-browser.mjs` (runs the Friend mode test), `demo/build.mjs` (includes friend.css), `package.json` / `package-lock.json` (0.13.0)

## Verification
- `tsc --noEmit` clean; `next build --webpack` compiles.
- Full browser suite: **54/54 PASS**, including three new Friend mode checks: the three-choice conversation saves `promised_return` with method and note; an attendance save made while POSTs are blocked is kept on the phone, survives a page reload, sends once when the network returns and is then removed; Friend-only accounts see Friend mode, not Import CSV, and can switch views.
- Known, pre-existing in v4.2 and unchanged: `npm test` stops at `tests/member-care.cjs` ("Overview") — the old Church Office sample-screen test.
- Not run against your hosted Supabase. Before telling Friends, sign in on staging with a real Friend-only account and record one call with mobile data switched off, then on.
