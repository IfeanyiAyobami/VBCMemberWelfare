# VBC v4.7 — Cell Leader dashboard + Friend fixes

Built on your v4.6. **No SQL migration, no new dependency, no new environment variable.** Copy over v4.6 and deploy.
Your restored Church Office Overview is kept as you designed it (see the one addition under "Overview").

## Cell Leader (a leader assigned to exactly one cell)
Coordinators, Area Leaders and Church Administrators keep the existing screens.

**Today → This week**
- First card is **this week's meeting** with five steps — Opened → Attendance → Visitors → Offering → Report — a plain sentence about where things stand, and one button for the next step.
- **Check on**: members marked absent at the last two recorded meetings, with Call and WhatsApp. Until two meetings have attendance, it says so instead of guessing.
- Small numbers: members, attendance rate, offering this month (amounts no longer break mid-number).
- If the Coordinator returned the report, the card says "Returned by your Coordinator" with their reason.
- Removed for single-cell leaders: the Area / Home cell pickers (dates fold into one small control), the "All my assignments" header picker, Coordinator metrics and duplicate quick links.

**Meetings (attendance)** — big **P / L / A** buttons per person, **Mark all present**, and a live count (e.g. "8 present · 1 late · 2 absent"). Drafts keep the choices.

**My cell** — member cards with "Last came" date and Call, filter **All / Missed 2+**. The add/find/import tools sit behind one **+ Add or find a member** button. Transfer requests show only when there are some. "Moving someone to another cell? Ask your Coordinator."

**Reports** — "Returned by your Coordinator" banner with the reason; the revision-history panel is hidden for leaders (they cannot read the audit log, which previously showed "Report access denied"); the Coordinator-only "Cells without a started meeting" panel is hidden. Grammar fixed: "1 report to complete".

## Friend
- **Today**: one line — "3 to contact today · 1 is late · N people in your care" — replaces the three overlapping tiles.
- When someone can't be called, the card says why (**No phone number recorded** / **Contact paused**) and what to do, with **We talked in person**.
- Tab renamed **Done today** (was "Follow Through").
- A person's journey shows the **latest three** entries with **Show all N**.

## Overview (Church Office)
Your restored layout is unchanged. Today's birthday/anniversary rows in **Care priorities** now carry the v4.4 **Send greeting** (WhatsApp from the staff member's phone, then "Yes, record it") and **Call** buttons, with "Greeted by …" status. Remove `greetRow` in `care-runtime.js` if you don't want this.

## Test fixes (tests only)
- `tests/home-cell-browser.mjs`: the test server now answers the v4.5 Coordinator checks (`care_journey_roles`, `care_journey_restricted`); without this every Home Cell page redirected to login and the browser suite could not run. The card-colour check accepts v4.6's lavender-on-navy cards instead of one exact value.
- `tests/greetings-browser.mjs` and `tests/member-care.cjs` rewritten for the restored Overview; Friend tests updated for "Done today" and the summary line.

## Verification
- `tsc --noEmit` clean; `next build --webpack` compiles.
- Full browser suite **59/59 PASS** (phone, tablet, desktop; both themes), including: single-cell leader This week, P/L/A + Mark all present with counts, member cards with last attended, no assignment picker, member tools behind one button, no Coordinator panels or audit errors; Friend Today, offline outbox, Done today; Overview greetings.
- `test:mobile-friend`, `test:v45`, `test:greetings`, `test:members`, `test:journey:queues`, `test:home-cell` (93 checks) pass.
- Pre-existing and unchanged: `npm test` stops in the old Church Office sample-screen test (`member-care.cjs`, "Member saved").
- Not run against your hosted Supabase. On staging, sign in as a real one-cell leader and a real Friend and walk through one week.
