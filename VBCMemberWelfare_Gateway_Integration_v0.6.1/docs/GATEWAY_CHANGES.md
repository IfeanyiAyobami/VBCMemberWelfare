# v0.6.1 changes against the saved v0.6.0 source

This package extends the existing guest queue. It does not rebuild dashboard components, change the schema's completed care controls or modify the working First-Timer Gateway v1.1.3. If your checkout has newer custom changes, review this list and merge only the integration changes.

## Runtime changes

| File | Change |
| --- | --- |
| `src/app/api/integrations/wordpress/first-timers/route.ts` | New Bearer-authenticated POST route; bounded JSON parsing, explicit JSON acknowledgements, 10-second storage timeout, minimal conflict/failure logging. |
| `src/lib/guests/gateway.ts` | Exact 24-key Gateway adapter, alias checks, existing guest validation/normalization, stable full-payload fingerprint input. |
| `src/lib/guests/gateway-auth.ts` | Server token validation and constant-time hash comparison. |
| `src/proxy.ts` | Adds the exact integration path to proxy exclusions. The endpoint has its own Bearer guard; staff page/API guards are unchanged. |
| `supabase/006_wordpress_gateway.sql` | Two metadata columns on the existing guest table and a service-only transactional RPC. Reuses `care_record_guest`, its key lock and existing unique constraint. |
| `.env.example` | Adds disabled-by-default Gateway variables and one backend Supabase key. Legacy HMAC remains disabled. |
| `package.json`, `package-lock.json` | Version 0.6.1 and Gateway test scripts; dependencies unchanged. |
| `next-env.d.ts` | Next-generated route type import location; regenerates automatically in dev/build. |

No edits to `GuestDesk.tsx`, `MemberDesk.tsx`, `CareApp.tsx`, CSS, original validation models, staff/member APIs, SQL 004/005, the old bridge, fonts or email artwork.

## Operations, tests and guidance

- `GATEWAY_SETUP.md`: sequential schema check, migration, credentials, hosting, endpoint testing, WordPress settings and safe backfill.
- `supabase/GATEWAY_CHECK.sql`: structure-only inspection, RLS, unique indexes, required RPCs and service/staff/anonymous privilege checks.
- `tools/test-gateway.mjs`: explicit operator test against a supplied HTTPS URL; creates one fictional pending guest and tests duplicate/conflict/concurrent retries without printing secrets or answers.
- `wordpress/vbc-member-care-requeue.zip` and its PHP source: optional administrator-only button on existing visitor records. Schedules only the installed Gateway's Member Care hook with the original UUID. No Sheets/email delivery calls.
- `tests/fixtures/wordpress-gateway.json`: all 24 exact contract keys with fictional answers.
- `tests/gateway-validation.mjs`, `tests/gateway-integration.mjs`, `tests/gateway-database.mjs`, `tests/resolve-ts.mjs`: contract/authentication, actual Next.js HTTP and isolated guarded SQL checks.
- `tests/auth-integration.mjs`: adds the new RPC fixture, fault injection and Gateway test run; existing suites retained.
- `README.md`, `GUEST_SETUP.md`, `docs/VALIDATION.md`: current integration guidance and validation results.
- `docs/LEGACY_HMAC_BRIDGE.md`: old instructions marked as historical, to prevent installing a second WordPress gateway.

Only the helper ZIP is installed into WordPress, if needed after endpoint verification. The full app ZIP is Next.js source, not a WordPress plugin. The original Gateway ZIP is unchanged and is not bundled for reinstalling.
