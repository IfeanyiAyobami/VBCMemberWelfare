# VBC Member Care v3.7 — Visitor Journey + leadership dialog fix

## Install in the existing project

1. Extract this version and copy its project contents into your existing `vbc-member-care-frontend` checkout. Keep your local environment file. The ZIP contains no production credentials.
2. In the existing Member Care Supabase project, run **`supabase/017_visitor_journey.sql`** after the installed migrations through 016. Apply the complete transaction. It preserves central person IDs, guest submissions, preferences and earlier follow-up history. It adds journey tables, controlled functions and membership guards; existing triggers are deliberately replaced. Supabase may flag the trigger replacement as a destructive operation; there are no guest/member DELETE statements or table drops in this migration.
3. Run `npm ci`, `npm run typecheck`, `npm run test:journey` and `npm run build` locally. Push the updated checkout to the already connected GitHub repository to deploy through Netlify.
4. Open **Follow-ups** (`/followups`). It is now the real visitor journey workspace. Existing follow-up workers retain access to their assigned cases. Church administrators can access all journey functions.
5. As a church administrator, open **Team & access**. Grant Follow-up Coordinator, Foundation Class Coordinator and/or Follow-through Friend capabilities to the appropriate **existing staff accounts**. A Home Cell leader assignment alone does not grant access to visitor care. Global administrator and follow-up-worker permissions are inherited from their existing staff roles; use Member Care Team settings to change those roles or deactivate accounts.
6. Open **Journey policy**. Record the church-approved qualifying service types, with the approval reference. Leave unconfirmed CFC and care sign-off policy fields blank. No service types, certificate numbering, make-up rules or graduation criteria are invented by this release.
7. Review any case flagged for conflicting old assignments and explicitly choose one friend. Test a reviewed visitor before recording real activity.

No additional environment variables are required. Continue using your existing Supabase configuration and `APP_ORIGIN=https://welfarevbc.netlify.app`. Migration 008 remains the preference-default gateway contract; do not rerun migration 006 over it. The adapter now sends the neutral wire flags required by 008, which derives new-record defaults in the database. New staff guest cards also use the agreed ON defaults; email stays unavailable without an address, and explicit opt-outs remain editable and survive review. Existing saved choices are not reset.

Apply migration 017 and deploy the matching application together: the old follow-up RPCs are retired to prevent former assignees from bypassing the new ownership and preference rules. Other Member Care and Home Cell routes retain their existing access controls.

## How the journey works

- The public registration source remains the **MAIN CHURCH WEBSITE**. Submitted cards still go through existing identity review and duplicate handling. Pending/unlinked guest cards are not turned into extra people by this module.
- A reviewed person has one central ID and one journey. Their source submission stays linked after official joining. No login/password is created by becoming a member.
- Assign and reassign friends by name. Reassignment keeps prior activity, reasons and the previous assignment in the audit trail. Former friends lose journey access immediately, unless another explicit role grants it.
- Record actual contact time, method, one of eight outcomes, optional notes and the preferred next date. Callback requires a date. Contact attempts and successful conversations stay distinct. A successful call never creates attendance.
- First-contact target defaults to 48 hours from database registration. This is an operational timestamp, not verified service attendance. Seven days is overdue; subsequent dated actions become overdue at their chosen due time. The suggested ongoing cadence is once or twice weekly, respecting individual preferences; it is not an automatic messaging schedule.
- “No further contact” explicitly stops **all outreach channels**, writes preference history and pauses outreach tasks. Internal Coordinator care-review tasks remain available. No messages are sent by these journey actions.
- Record church service date, service/session name, service type, evidence source and verification level. Self-reports obtained by phone/WhatsApp remain clearly marked and can count for approved service types. The Coordinator reviews evidence before joining.
- Exactly **two distinct qualifying services** establish eligibility. Registration alone, Home Cell and CFC do not count. Duplicate prevention uses person + service date + service type, case-insensitively. For two genuinely separate sessions on one date, configure separate approved session types. An arbitrary alternative service name cannot create a second qualifying entry.
- Service-type policy changes apply to newly recorded evidence. Existing evidence is never silently reclassified. A Coordinator can void and replace pre-joining evidence with a reason; the original stays visible. Post-joining corrections require a church administrator, preserve official membership and flag insufficient membership evidence for explicit review/reconciliation.
- Membership Sunday is the upcoming last Sunday in the Lagos calendar, including today when applicable. The queue includes eligible, interested, confirmed-intention, awaiting-response, deferred, did-not-join and joined views.
- The Coordinator explicitly confirms official joining with the actual date and evidence. Two qualifying services must precede or fall on that date. Deferral preserves eligibility. Membership updates the same central record; the original `joined_on` field and guest visit date are not overwritten.
- Existing `member` records are marked as legacy members with unknown actual joining dates. Only an administrator can reconcile an evidenced historical joining date. Old `joined_on` values are never automatically treated as official dates. New direct status promotion from the profile form is blocked; use explicit joining instead.
- Official joining starts at least **six calendar months** of continuing care, with month-end clamping. The assigned friend stays in place. Care continues during and after CFC; elapsed time never closes it automatically. The Coordinator can extend care or, after the minimum period and an approved church policy, record completion with a reason.
- Foundation Class Coordinators manage cohorts, enrolment, seven weekly attendance records, evidenced corrections, manual completion assessment and unique certificate award numbers. Enrolment requires an actual official joining date. Completion and certificate actions stay blocked until the church policy is approved. Completion is a documented manual assessment against that policy, not an automatic seven-tick rule. This release records certificate awards; it does not generate certificate PDFs.

## Interface and security

Responsive desktop, tablet and mobile layouts; actual VBC crest, Anton/Poppins fonts and #000956 navy. Light/dark mode uses the existing Member Care theme preference. Theme changes preserve open form inputs. Sensitive person details, notes and credentials are not written to browser storage.

Profiles show the journey, contact journal, church attendance, membership, CFC, continuing care, original guest references and audit history. Existing Member Care profiles link directly to their journey. Lists use server-side search/pagination and scope-wide totals. Errors use accessible dialogs/inline dialog alerts, preserve entered values and support safe retries after a lost acknowledgement using request IDs. Concurrent stale edits are rejected.

Database functions enforce active staff capabilities, assignment scope, versions, atomic preference changes and request idempotency. New tables have RLS and no direct browser table grants. The API uses the signed-in user client, same-origin mutation checks, bounded JSON and private/no-store responses. It does not require a browser service-role key.

## Home Cell screenshot correction

The leadership reassignment dialog now explicitly uses the Home Cell palette, even when the main Member Care theme is different. Headings, labels, current/new assignment cards and inputs remain readable. The body scrolls within the dialog; action buttons stay reachable. This was checked in all four combinations of the two independent themes, on desktop and mobile.

## Historical workbook

The supplied 135-row workbook has **not** been imported. See `VISITOR_JOURNEY_HISTORICAL_REVIEW_v3.7.md` and `Historical_Data_Dry_Run.json`. Missing years, numeric/multiple phone values, source-field meaning and real staff/account matching require review. Production identity matching and approval of the exact proposed writes are still required. No historical attendance, joining dates, consent or login accounts are fabricated.

## Validation

See `VISITOR_JOURNEY_VALIDATION_v3.7.md` for completed checks and their limits. Validation uses fictional local fixtures; no hosted database migration, historical production import, email/SMS delivery or Netlify deployment has been performed from this workspace.
