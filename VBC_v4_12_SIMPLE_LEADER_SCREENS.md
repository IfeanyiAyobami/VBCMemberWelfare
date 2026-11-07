# VBC Member Care v4.12 — Simple leader screens

App version **0.22.0**, built on v4.11. No new npm dependencies or environment variables. This release ships one additional migration relative to v4.11: **`supabase/033_leader_app.sql`**. All migration files are byte-for-byte as supplied in the v4.12 handoff.

## Deploy

1. Confirm your Supabase project has migrations through `032_cfc_team_certificates_baptism.sql`. Apply `033_leader_app.sql` in Supabase SQL Editor before deploying the app. The handoff migration can be rerun.
2. Keep your current Supabase and server-side PIN settings in the deployment: `HOME_CELL_PIN_SECRET`, `CFC_PIN_SECRET` and `FRIEND_PIN_SECRET`. Keep the same values when moving a build between environments that share accounts; changing a PIN secret invalidates PINs generated with the previous value.
3. Deploy the app. Open `/home-cell/login`, `/cfc-login` and `/friend-login` to check the matching sign-in forms. Use the staff link for password sign-in.
4. Home Cell coordinators: in **Leadership accounts → Security & access**, use **Generate / reset 4-digit PIN** for Area Leaders and share it privately. Area Leaders can still use password sign-in during the changeover. Cell Leaders use PINs; coordinators and administrators use passwords.

## What each role sees

- **Cell Leader:** This week opens a checklist for Attendance, Visitors, Offering, Dues and Expenses. Do them in any order. Take attendance before **Check and send**. **No meeting** is a single tap and can be undone. My people has Call and WhatsApp; Help has the coordinator contact when configured. The meeting schedule comes from each cell in Africa/Lagos time.
- **Area Leader:** This week shows the status of each cell. Open a report to review, approve, or send it back with a reason. Cells shows contact details and recent meetings. Check on highlights people and cells that may need attention.
- **Cell and Area Leader:** The home screen offers both Your cell and Your area. Another eligible Area Leader can review your cell’s report, or the coordinator handles it when you are the only Area Leader. The app and database disallow approving or sending back your own cell’s report.
- **CFC Leader:** Classes shows the next scheduled class, attendance, make-up needs, planning and baptism. People shows progress across cohorts and retains enrolment, attendance history, CSV export, completion submission, certificate tracking and baptism. Help includes account information and logout. Coordinators still use the embedded CFC dashboard and retain completion approval. CFC sessions store a date and venue but no start time; the card shows the saved details.
- **Follow Through Friend:** The shared sign-in form is new. The approved Friend dashboard and its access are unchanged. The Church Office Overview is unchanged.

PIN sign-in keeps the existing phone/email and four-digit PIN credentials. A rejected attempt leaves the PIN in the current form so it can be corrected. Only check **Keep me signed in on this phone** on a personal device. A coordinator can generate a replacement if needed.

The full Home Cell Office is still at `/home-cell?full=1` (also linked from Help). The earlier fix for oversized sign-in requests is included.

## Verification

- Clean dependency install, TypeScript and Next.js 16 production build.
- Browser baseline: **63/63**. Final browser suite: **64/64**, including the shared sign-in across all three roles, correct request payload, and retry behaviour. No browser runtime errors.
- Home Cell database: **110/110**. Home Cell PINs, Friend PIN route, CFC database and PIN routes, CFC UI, mobile Friend, members and greetings passed.
- CFC UI coverage includes choosing the class from the home card, saving attendance, correction prompts, distinct class credits across cohorts, make-up enrolment and embedded mode.
- [Visual comparisons](docs/v4.12/qa/index.html) include 390px light and dark for Home Cell, PIN sign-in and CFC, plus 834px and 1440px Home Cell captures. App screenshots use fictional fixture data.
- Hosted Supabase, Netlify and physical Android devices were not tested. The checks used local fixtures and Chromium. The brief’s known unrelated `npm test` failure in the older Church Office sample screens is outside the release checks.
