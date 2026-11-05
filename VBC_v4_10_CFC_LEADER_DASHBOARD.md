# VBC v4.10 — One CFC leader, class completion across cohorts

## Where to create the account
Sign in as the Follow Through coordinator. Open **Follow Through → CFC Leader account** (`/followups#cfc_leaders`). Create the leader using a name and email and/or phone. The coordinator generates the four-digit PIN, hands it over privately, resets lost PINs and deactivates access when needed. Only one active CFC leader account is permitted for now.

Leader login: `http://localhost:3000/cfc-login` locally, or `/cfc-login` on the deployed site. Dashboard: `/cfc`.

## Setup before deployment
Apply `supabase/031_cfc_leader_dashboard.sql` after existing migrations through 030. Existing enrolments and class marks are retained and backfilled into the class history. The migration can be rerun without duplicating history. Existing historical completion dates are preserved; new completion confirmations require seven distinct completed classes.

Generate a separate random server secret:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add it as `CFC_PIN_SECRET` in `.env.local` and Netlify environment variables. Keep `FRIEND_PIN_SECRET` and `HOME_CELL_PIN_SECRET` unchanged. Restart locally / redeploy. Changing CFC_PIN_SECRET requires generating a replacement CFC PIN. Keep the service-role key server-only as before.

## Who does what
The Follow Through coordinator creates/manages the one CFC leader account. The CFC leader creates cohorts, schedules individual class sessions, enrols officially joined members, assigns them to cohorts and arranges make-ups. No coordinator-to-teacher cohort assignment is required. This leader oversees CFC church-wide, with no main-office, Home Cell or full Follow Through permissions. Independent Auth credentials preserve the same person's other dashboard logins.

The coordinator retains a CFC overview under **Foundation classes** and reviews completion submissions. Approval requires the existing CFC completion policy to be set in Follow Through settings. CFC completion remains separate from official membership.

## Mobile screens
- Today: participant/cohort totals, next class, attention list.
- Participants: search, completed/missing class filters, seven-class progress, contact action when consent allows it, attendance history and make-up opportunities. Export visible progress to CSV.
- Classes: create a cohort; search officially joined members and enrol them; schedule Class 1–7 with actual dates/topics/venue; mark each session Present or Absent. Existing marks display immediately. Changing a saved mark requires a correction reason.
- Account: identity, role and logout. Theme toggle and Keep me logged in are retained.

## Carry-over example
Someone completes Classes 1, 2, 4, 5, 6, 7 in Cohort A and misses Class 3. Enrol the person in Cohort B (or use Schedule make-up on their progress screen), then record their attendance for Class 3 there. Progress becomes 7 of 7. Original dates/cohorts remain in history; repeated attendance never counts twice. All seven distinct classes are required, regardless of attendance count.

Existing Follow Through class entry and the new CFC dashboard keep the same journey summary up to date. Previous present credit in another cohort is not erased by a later absent mark. Completion is submitted for coordinator review, then approved; approval updates the existing CFC completion field rather than creating a duplicate member.

PINs are server-generated, salted/scrypt-hashed with a separate HMAC secret, never stored in plaintext, and returned only at generation/reset. Login limits: five attempts in 15 minutes and a reset-required lock after 20 unsuccessful attempts, plus IP throttling. Tables have RLS and are accessed through narrow functions; PIN functions are service-role only.

## Verification
- Production build passes.
- `npm run test:cfc`: migrations through 031, rerun/backfill safety, single-account rule, leader-created cohorts/enrolments, cross-cohort make-ups, seven-distinct-class gate, attendance retry deduplication, correction guards, completion review, suspended access, RLS and denial of full journey access; PIN route tests; rendered mobile component navigation and controls.
- Existing Friend dashboard and Home Cell PIN suites pass.
- Hosted Supabase/Netlify credentials were not exercised. Run the setup above before using the release.
