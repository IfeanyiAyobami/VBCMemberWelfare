# VBC Home Cell Office — dashboard and workflow update

## Start here

This release builds on the uploaded Stage 2 source and the login repair. It preserves the existing Member Care application. Do not replace your production deployment before staging validation.

1. Back up your current local project and Supabase database.
2. Extract this ZIP into a new folder. Copy your existing `.env.local` into `vbc-member-care`.
3. In the same Supabase project used by Member Care, run **only** `supabase/011_home_cell_workflows.sql`. Migrations 009 and 010 have already been applied; do not rerun them. Migration 011 is included in full as plain SQL, ready to copy into SQL Editor.
4. Run:

```sh
npm ci
npm run typecheck
npm run test:home-cell
npm run dev
```

Open http://localhost:3000/home-cell/login and use your existing active Member Care administrator account.

Required variables (keep all other existing application variables):

```env
NEXT_PUBLIC_SUPABASE_URL=your_existing_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_existing_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_private_service_role_key
```

The service-role key must remain server-only. Never add NEXT_PUBLIC to its name, commit `.env.local`, or send its value in chat.

## Implemented screens

The eight supplied reference images informed the navy sidebar, branded header, blue actions, cards, form structure, role/area controls and mobile navigation. Existing local VBC assets and Poppins/Anton fonts are reused. Reference names, statistics and decorative faces were not seeded into production.

| Route | Behavior |
| --- | --- |
| `/home-cell` | Role-aware overview, real counts, attendance comparison, report compliance, visitors, meetings and financial summaries |
| `/home-cell/areas` | Assigned-area cards with scoped drill-down |
| `/home-cell/cells` | Approved directory, addresses, fellowship schedule, authorized create/edit form |
| `/home-cell/members` | Central Member Care profiles linked to cells; identity-confirmed assignment |
| `/home-cell/attendance` | Open fellowship, touch-friendly present/absent/late entry, visitor attendance, draft notes |
| `/home-cell/finances` | Offerings, dues, expenses, transaction history, reasoned voids preserving originals, period net movement |
| `/home-cell/visitors` | Central contact search, explicit identity linking, guest registration, optional contact details, preferences, follow-up status |
| `/home-cell/reports` | Consolidated weekly report, submission, review, correction requests, resubmission, approval, revision history and CSV export |
| `/home-cell/communications` | Church/area announcements shown to authorized leadership; no automatic email/SMS sending |
| `/home-cell/leaders` | Invitations, verified existing-account assignment, additive roles, replacement/reassignment, suspension/reactivation, archived roles, Home Cell session termination, audit history |
| `/home-cell/settings` | Account details, verified assignments and sign out |
| `/home-cell/activate` | Invitation/recovery session exchange and password setting |
| `/home-cell/login` | Existing login plus password recovery and clearer server-configuration errors |

## Scope and security

- Each request verifies Supabase authentication, active assignments and suspension. A workspace selector selects among verified assignments; changing frontend controls never grants permission.
- Database functions recheck the actor and scope before writing. Scope checks, mutations and audit records in each function commit together.
- Coordinators can assign only Area/Cell Leaders within authorized areas and cannot manage accounts with higher/out-of-scope assignments. Existing account IDs are verified against the entered email before adding a role.
- Only the submitting Cell Leader, while still assigned to the cell, can revise a correction-requested report. Area Leaders review and approve; Coordinators oversee and request corrections. Administrators retain church-wide oversight.
- Remote termination is **Home Cell Office-specific**: the actor guard compares the verified token's session identifier with the actual Supabase session creation timestamp and the stored revocation cutoff. Refreshing an old session does not regain HCO access; a new sign-in does. This does not log the person out of Member Care.
- Reports use optimistic versions and row locks. Stale writes fail and require refresh. Attendance is unique per registered member or recorded visitor and meeting.
- Financial transactions are never deleted. Corrections void an original transaction with a reason; voided values are excluded from summaries. No separate financial approval policy was introduced.
- New visitors remain guest submissions in Member Care and are not promoted into church members. Existing profiles/preferences are preserved. New guest preferences are editable and explicit opt-outs are retained.
- SQL functions are executable only by service_role; HCO browser access stays revoked under RLS.

## Migration 011

Adds meeting versions; visitor request IDs, follow-up state and notes; financial void metadata; announcements; transactional workspace/leadership functions; and HCO session cutoff verification. No existing Member Care preference functions are replaced.

One report is permitted per cell per **ISO calendar week (Monday–Sunday)**. Directory default meetings remain Sunday, 18:00–19:00. If your existing database contains multiple meetings for a cell/week or duplicate anonymous attendance, the uniqueness index will stop the migration rather than delete or merge records. Review those conflicts before proceeding. Migration 011 runs in a transaction.

## Validation and remaining live checks

See `HOME_CELL_VALIDATION.md` for executed checks and their precise limits.

- Browser tests use a local mock Supabase provider and synthetic records, never your live church data. Database tests use PGlite with the supplied Member Care schema columns and the new SQL. They are valuable regression checks but do not establish live deployment readiness.
- Live Supabase schema, row counts and constraints were not queried. The attached directory CSV has 11 areas and 66 cells; verify those counts in your own database.
- Invitation emails and password-reset delivery need Supabase SMTP and redirect allow-list configuration. Allow your local and Netlify URLs ending in `/home-cell/activate`. PKCE recovery links must be opened in the browser that requested them. Test a real invitation before distributing leader accounts.
- Email delivery and Supabase account creation are external to the SQL transaction. The app checks migration readiness before sending. If an invitation is sent but assignment persistence fails, the API reports that failure and no new role is granted; reconcile using verified existing-account assignment. There is no background retry queue.
- Announcements are in-app only. No bulk messages or real-time chat were added. Opted-out visitor status is a follow-up marker; it does not mutate an existing central communication preference. Edit central preferences in Member Care.
- A specific weekly submission deadline has not been agreed. Reports list cells without started meetings and outstanding drafts rather than inventing overdue deadlines.
- Operational queries refuse truncated result sets and ask for a smaller cell/date scope. The leadership directory currently loads at most 500 active assignments. Large-directory pagination remains future work.

## Deployment and rollback

Use a review branch in the existing repository. Inspect the diff, apply migration 011 to a staging Supabase project, run the commands above, and validate all four roles plus multiple assignments. Push the review branch to GitHub and use a Netlify deploy preview with the correct environment. Do not merge solely because the build passes.

Before production: verify an invitation, password recovery, cell/area boundaries, submitted-report locking, correction ownership, remote HCO session cutoff and absence of Member Care regressions. Check actual directory totals.

Rollback application code by reverting the review commit or redeploying the prior known-good Netlify build. Leave additive HCO columns/functions dormant; do not drop tables or delete data. The weekly uniqueness index continues to apply to older code. Restore a database backup only through an explicitly reviewed recovery procedure.
