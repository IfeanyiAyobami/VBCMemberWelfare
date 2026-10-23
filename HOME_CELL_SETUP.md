> Historical notes. The current release is documented in HOME_CELL_STAGE3.md and requires migration 011.

# VBC Home Cell Office — integration stage 1

This is an **additive working foundation**, not the complete multi-dashboard application. It includes the HCO schema, dedicated login, Leadership Accounts directory, invitation and basic security actions. It does not yet implement complete attendance, finances, report submission, charts, promotions or correction UI. Do not deploy as feature-complete.

## Database
Run `supabase/009_home_cell_office.sql` once in the Supabase SQL editor, **after** existing migrations 004–008. Back up your database first. Do not run old migrations again.

## Netlify
Set `SUPABASE_SERVICE_ROLE_KEY` as a server-only environment variable; never prefix it `NEXT_PUBLIC_` or send it to the browser. Existing `NEXT_PUBLIC_SUPABASE_URL` and publishable key remain required. Configure Supabase Auth redirect URLs for your deployment domain. Ensure Supabase Auth email invitation delivery is configured.

## Bootstrap
Existing active `care_staff` administrators are recognized as HCO Church Administrators. Go to `/home-cell/login`, then `/home-cell/leaders`. Coordinators must first be assigned by a Church Administrator. Area and Cell IDs must exist in the HCO tables before invitation; use the Supabase table editor to add areas/cells. Cell leader area is resolved from the selected cell. The account form uses directory dropdowns. See HOME_CELL_REVIEW.md for the current implementation and deployment blockers.

## Security
HCO tables have RLS enabled with no `authenticated` table grants. All HCO access uses server-side service-role operations after verifying the logged-in user and assignment scope. Account invitations require Church Admin or scoped Coordinator authorization. Suspension blocks HCO requests but does not revoke Supabase sessions; previously issued access tokens can remain valid until expiry, but HCO endpoints recheck suspension on every request. Test session termination and all roles in staging before production.

## Outstanding features
- Coordinator and Cell Leader workspace dashboards, cell and area directory, multi-role workspace switcher
- Promotion/demotion UI with add-or-replace role and safe reassignment
- Complete member/visitor linkage, attendance and finance entry, correction workflow, weekly submission
- Analytics, reporting and communication modules
- Improved account directory with names, statuses, dropdown area/cell selectors, and pagination
- Automated integration/security tests and end-to-end deployment verification

**No database was modified by producing this ZIP.**
