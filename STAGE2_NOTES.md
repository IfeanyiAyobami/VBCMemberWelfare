> Historical notes. The current release is documented in HOME_CELL_STAGE3.md and requires migration 011.

# Home Cell Office — Stage 2 incremental patch

Built on the previously supplied Stage 1 archive and the successful 009/010 schema migrations. No additional SQL required for this incremental patch.

## Changes
- Directory API lists active areas/cells from Migration 010, scoped to administrator/coordinator access.
- Leadership invitation form uses real area and cell dropdowns rather than manual UUID entry.
- Coordinator directory visibility includes Cell Leader assignments (which store `cell_id`, not `area_id`).
- Coordinator access actions resolve cell-to-area scope and check all target account roles.
- Church administrator invitations no longer rely on an `area_id = NULL` equality check.

## Important limitations / deployment gate
- This is **not** the completed leadership-management stage. Existing-user role addition, promotion/reassignment, robust invitation rollback, audit-backed transactional mutations, reliable remote session revocation, workspace selector and member-facing dashboards require more work.
- Existing Stage 1 invitation code sends an invitation before persisting the assignment. If the DB write fails, the invited account can exist without a role; reconcile manually. It is not a transactional invitation system.
- Existing Stage 1 remote logout uses Supabase admin signOut and must be validated against the deployed Supabase SDK and session model. Do not treat it as a verified immediate revocation guarantee.
- Do not deploy to production without testing the build, authorization matrix, email redirect allow-list, and auth flows on staging.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. No `.env` secrets included.
