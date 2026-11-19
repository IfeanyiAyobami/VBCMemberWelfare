# VBC Member Care v4.13

## Apply before deployment

1. Back up the database using your normal procedure.
2. Run `supabase/034_global_home_cell_coordinators.sql` after migration 033.
3. Run `supabase/035_separate_home_cell_logins.sql`.
4. Deploy this source. No new environment variables or dependencies are required. Keep HOME_CELL_PIN_SECRET unchanged.

Migration 034 makes Home Cell Coordinators church-wide. It removes area/cell scope from existing coordinator assignments and archives redundant active coordinator assignments. Cell and Area Leader scope stays restricted. Migration 035 adds private linked Cell Leader identities and the protections described below. Existing migration files are unchanged. Both new migrations were tested twice for repeat application.

## Give one person two independent logins

In Leadership Accounts, retain both their Cell Leader assignment and their Church Admin or Coordinator role. If promotion replaced the cell role, use Add role to restore their actual Cell Leader assignment. Do not invent a cell assignment for a person who only coordinates.

A Church Admin opens that person's Security controls and selects Separate Cell Leader login to generate a PIN. Save the displayed PIN and give it to the leader securely. Resetting it generates a replacement. The Church Admin/Coordinator password is managed separately with the staff password controls. A Coordinator cannot provision their own second login.

Use `/home-cell/login` for both Home Cell access paths:

- Cell / Area Leader: public email or phone number plus four-digit PIN.
- Church Admin / Coordinator: public email or phone number plus staff password.

For the main Member Care dashboard, Church Admins use the existing `/access` staff sign-in with their staff password. The separate leader identity cannot enter the staff dashboard or full office interface.

The linked identity is created privately by the server, with only the person's Cell Leader assignments. Its internal email is not a contact address. Never distribute it. No email/SMS is sent automatically. Existing ordinary leaders continue to use their current PIN flow.

First setup invalidates the owner's older sessions: sign in again with the staff password when prompted. Subsequent Cell Leader PIN resets leave the staff password and owner session cutoff unchanged. Source suspension, removal of the leader assignment, or source session revocation also invalidates linked access. A source-wide logout/password security action may require the leader to sign in again; the credentials remain separate.

## Coordinator scope

No area or cell field is required for a Coordinator. Coordinators can view and coordinate all active areas, review reports, and handle membership transfer requests church-wide, subject to existing approval rules. Their account-management restrictions remain in place: privileged appointments and separate-login provisioning require a Church Admin.

A person cannot review/approve/send back their own report by switching login identities. Existing independent Area Leader approval requirements remain intact.

## Verification

- Home Cell database: 110 checks passed. The old date-relative fixture overlapped fixed historical records on the current date; its test-only offset was moved further into the past.
- New separate-login database suite: 34 checks passed, including migration reruns, global scope, identifier resolution, suspension, PIN lock/reset, private identity restrictions and self-review guards.
- New separate-login route tests passed, including failed saves returning no PIN and retry recovery.
- Existing Home Cell PIN, CFC, mobile Friend, member validation and celebration greeting suites passed.
- Browser suite: 65 checks passed, including explicit PIN versus staff-password selection.
- TypeScript and production build passed.

The initial production build reported a security advisory for the installed Next.js version. A repeat build completed; that does not resolve the advisory. Dependencies were intentionally unchanged. Review and apply the appropriate framework security patch before treating this release as production-ready.

The protected Friend and main-office implementation files are unchanged. No existing SQL migration was edited. My submissions history remains a future iteration.

This archive is a source update, not a deployment or evidence that your hosted database has already been migrated.
