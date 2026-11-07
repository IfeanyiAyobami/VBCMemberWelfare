# VBC v4.12 — Simple leader screens (DRAFT — in progress)

Built on v4.11. **One new SQL migration: `supabase/033_leader_app.sql`** (apply after 032; safe to rerun). No new dependency or environment variable.

## Deploy
1. Run `033_leader_app.sql`.
2. Deploy the app.
3. Coordinators: open Home Cell → Leadership accounts → each Area Leader → Security & access → **Generate / reset 4-digit PIN**, and share it privately. Area Leaders can keep using their password until then.

## Done so far
- **Cell Leaders** (`/home-cell`): a "This week" checklist — Attendance, Visitors, Offering, Dues, Expenses — in any order; Check and send (needs attendance); "No meeting" in one tap (undoable); My people with Call/WhatsApp; Help with the Coordinator's phone. Meeting day and time come from each cell (usually Sunday 6–7 pm).
- **Area Leaders**: this Sunday's report from every cell (Waiting for you / Approved / No meeting / Not sent yet / Sent back), Review → Approve or Send back with a reason, Cells with leaders' phones and the last 4 meetings, Check on.
- **Cell + Area Leaders**: one home screen with "Your cell" and "Your area"; their own cell's report goes to another Area Leader, or the Coordinator.
- **Approval rule (database)**: nobody approves or sends back their own cell's report; the Coordinator approves when the area's only Area Leader leads that cell.
- **PIN sign-in for Area Leaders** (and dual roles). Coordinators/admins keep passwords.
- The full Home Cell Office is still at `/home-cell?full=1` (link in Help).
- Fix: oversized sign-in requests no longer hang the server.

## Still to do (see docs/v4.12/CLAUDE_CODE_BRIEF.md)
Visual QA, shared 4-box PIN sign-in screen, CFC Leader screens, final release packaging.

## Tests so far
`tsc` clean; build compiles; browser suite 63/63 (incl. 4 new leader-app checks); `home-cell-database` 110/110; PIN and CFC suites pass. Hosted Supabase/Netlify not exercised.
