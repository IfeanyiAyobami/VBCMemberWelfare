# VBC Follow-up Management — Phase 2

## Installation (do not skip)
1. Back up the Supabase database.
2. In the **same Supabase project** as Member Care, run `supabase/007_followup_management.sql` in SQL Editor. It is additive, but introduces a new role and tables.
3. Deploy this project to Netlify using the existing GitHub deployment. No new environment variables are required.
4. In Supabase, add a staff user through the existing staff onboarding process. Set their `care_staff.role` to `followup_worker`, with `is_active=true`. Use the exact auth user UUID. Do not share credentials.
5. Administrators/Editors open `/followups` and assign an existing approved visitor's `care_members.id` UUID. Workers sign in and are redirected to `/followups`.
6. Record activities and verify workers cannot access `/members`, `/guests`, or their APIs. Check that worker A cannot access worker B's history.

## Security and consent
- No changes to Elementor, WordPress, gateway or Google Sheets.
- Assignment requires `care_preferences.contact_consent=true`.
- Recording SMS/email requires the corresponding opt-in. For WhatsApp and phone, confirm suitability and consent before contacting; no messages are sent automatically.
- Worker data is delivered exclusively through SECURITY DEFINER functions with per-user checks; workers have no direct SELECT grants on the new tables or general member data.
- Existing admin/editor access to other modules is unchanged.
- Follow-up activities are append-only through RPC; no delete or edit route is provided.

## Known limitations / next iteration
- Admin assignment currently takes a visitor UUID (copy from an approved visitor profile). A searchable visitor picker can be added after validating the database and user workflow.
- No automated reminders or email/SMS dispatch. Due/overdue indicators display when dashboard is opened.
- Assignments cannot be reassigned or cancelled in this release.
- Verify migration and permissions in a staging project before production use.
