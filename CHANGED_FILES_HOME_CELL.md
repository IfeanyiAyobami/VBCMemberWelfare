# Changed files

- `supabase/011_home_cell_workflows.sql`: additive schema, weekly uniqueness, transactional workflow and leadership functions, session cutoff verification.
- `src/lib/home-cell/model.ts`: typed workspace records, section labels, currency and attendance helpers.
- `src/lib/home-cell/workspace.ts`: authorized directory scope resolution.
- `src/lib/home-cell/admin.ts`: existing guard plus revoked-session checks.
- `src/components/home-cell/HomeCellWorkspace.tsx`, `workspace.css`: reference-informed responsive shell and all operational pages.
- `src/components/home-cell/LeadershipAccounts.tsx`: account directory and management controls.
- `src/components/home-cell/AuditHistory.tsx`: report and leadership history.
- `src/app/home-cell/page.tsx`, `[section]/page.tsx`, `leaders/page.tsx`: protected server-rendered routes.
- `src/app/home-cell/login/page.tsx`: recovery controls; existing login styles preserved.
- `src/app/home-cell/activate/page.tsx`: invitation/reset account activation.
- `src/app/api/home-cell/workspace/route.ts`: real scoped reads and validated transactional writes.
- `src/app/api/home-cell/people/route.ts`: controlled central identity lookup.
- `src/app/api/home-cell/audit/route.ts`: authorized audit reads.
- `src/app/api/home-cell/leaders/route.ts`, `leaders/action/route.ts`: identity display, role changes and invitation safeguards.
- `src/app/api/home-cell/login/route.ts`: actionable access/configuration errors.
- `src/app/api/home-cell/activate/route.ts`, `recover/route.ts`: password/session endpoints.
- `tests/home-cell-database.mjs`, `tests/home-cell-browser.mjs`: database security/workflow tests and real-page browser checks with test-only records.
- `package.json`, `package-lock.json`: PGlite and Playwright development dependencies and test scripts.
- Home Cell documentation: current setup, validation, changes and historical-note pointers.

No existing Member Care member, guest, WordPress gateway, celebration or preference implementation was replaced. Migrations 008/009/010 were not rerun or altered.

## Latest visual update

Home Cell `workspace.css`, `HomeCellWorkspace.tsx`, login `page.tsx`/`login.css`, five assets in `public/home-cell/photos`, and reference-colour browser assertions. No API/schema changes.


v3.2: identity.ts, accounts.ts, admin.ts; login and activate pages/APIs; leadership pages/API and LeadershipAccounts; new LeaderContacts component and contacts API; migration 012; regression tests and HOME_CELL_V3_2_SETUP.md.


v3.3: new phone-usernames.ts server helper, migration 013, leaders/phone repair route; updated accounts.ts, login and leaders APIs, recovery guard, workspace account display and LeadershipAccounts repair button; database/account/browser regressions and v3.3 setup guide.


v3.4: migration 014; shared onboarding validation/CSV parser; onboarding and transfers API routes; MemberOnboarding and MemberTransfers components; Members and management dashboard integration; legacy assignment write guard and phone-aware people search; onboarding/database/browser tests and v3.4 guide.

## v3.5 security and reliability

Framework/lockfile patch; shared Supabase fetch timeouts and safe read retries; private database auth throttle (015); bounded JSON and sanitized Home Cell route telemetry; browser headers; CI workflow; recovery and infrastructure mapping in HOME_CELL_V3_5_HARDENING.md. All Home Cell route exports use the common wrapper; business permissions and transactions remain in their existing handlers/RPCs.
