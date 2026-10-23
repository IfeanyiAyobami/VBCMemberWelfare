# Current release: v3.5

The security recommendation recorded under v3.3/v3.4 below is historical and superseded by the v3.5 patch and validation at the end of this file.

# Executed validation — 22 October 2026

## Passed

- `npm run typecheck`: Next route generation and TypeScript checking passed.
- `npm run build`: full Next.js 16.4.0 production build passed, including existing Member Care routes and the new Home Cell routes.
- `npm run test:home-cell`: 39 PostgreSQL/PGlite checks passed. The test applies 009 and 011 to an isolated in-memory database with the original Member Care member/guest columns plus the existing 005 guest metadata columns. No live database is contacted.
- Production browser test: 11 screens × 3 widths (1440, 768 and 390 pixels) passed checks for page rendering and absence of document-level horizontal overflow. No browser runtime exceptions. Coordinator, Area Leader and Cell Leader dashboard presentation passed. Mobile drawer navigation passed. Dashboard, visitor and leadership screenshots were visually inspected internally; test screenshots are not production records.
- Existing member validation: 33 checks passed.
- Existing theme tests: 36 assertions passed.
- Existing email design tests: 46 assertions passed, no provider calls.

## Database coverage

Unauthorized and cross-area writes; meeting retry and weekly uniqueness; attendance membership checks; optimistic versions; duplicate attendance with rollback; positive money validation; submitted-report locking; reviewer versus author permissions; correction/resubmission/approval; transactional audits; area-scoped announcements; suspension; new guests remaining guests; visitor retries and changed-payload rejection; opt-out preservation; existing-contact identity confirmation; follow-up changes; finance voids preserving originals; coordinator privilege escalation prevention; assignment replacement rollback; and Home Cell session cutoff versus fresh sign-in.

## Browser test limits

The browser test signs into a local mock provider and intercepts workspace GET responses with synthetic records. It checks the real built Next.js pages, CSS, role presentation and navigation. Operational persistence/authorization is tested separately in PostgreSQL. It is not a live Supabase/SMTP end-to-end acceptance test. Production code contains no seeded dashboard metrics.

During development, a browser run performed alongside hot updates reported a hydration mismatch; the final production browser run passed without runtime exceptions. An earlier menu assertion matched both sidebar and quick-action links; the test was corrected to target the navigation landmark.

The existing broad preview suite and legacy gateway-consent assertion previously failed in the login-repair audit. They have not been represented as passing or rewritten to hide those mismatches. Member Care consent behavior was preserved.

## Reproduce

```sh
npm ci
npm run typecheck
npm run test:home-cell
npm run test:members
node tests/theme.cjs
node tests/email-designs.cjs
npm run build
npx playwright install chromium
npm run test:home-cell:browser
```

The browser test starts its own local Next server and mock provider. It uses test-only credentials and never your Supabase service key. `HCO_CHROMIUM_PATH` may point to an existing compatible Chromium executable. To retain optional screenshots for your own review, set `HCO_SCREENSHOT_DIR` to a local folder before running the test.

## Not executed against live services

Live schema/count queries, Supabase invitation/reset email delivery, redirect allow-list confirmation, real multi-user access tests, actual Supabase refresh-session behavior, Netlify deploy preview and production deployment. Complete these checks before releasing to church leaders.

## Visual update: uploaded church photos and final navy

The default navy is now **#000956**, per the latest user instruction. Reference card surfaces, red actions, Anton headings and Poppins interface text are retained. Five supplied photographs are hardcoded as local decorative assets; their bytes were checked against the originals. The production build passed again after these changes. The updated browser suite also checks exact canvas, card and active-navigation RGB values. No database code or migration changed for this visual update.

## Existing-account and form-retention regression checks

The updated production build passed. Thirteen account/date validation checks passed, covering exact normalized email matching, paginated account lookup, lookup failure handling, full-year date conversion, leap years and incomplete/impossible dates. The browser suite now additionally exercises visitor form/opt-out retention across date application and area changes, leadership email retention across refresh, and the real leader API against a mock authentication provider to verify that an existing user ID is reused without sending an invitation. These tests do not contact live Supabase.

## v3.3 phone usernames without SMS

The final production build and TypeScript check passed. The first build also emitted a Next.js security advisory and stopped; the retry completed successfully. Next.js remains at 16.4.0 and the recommended security upgrade has not been applied.

All 53 local database checks passed, including the private phone-username index, uniqueness and role-write rollback on conflicts, repair restrictions, saved directory edits and idempotent migrations. The account/date suite passed its 13 original checks and 11 added email/phone checks. The production browser suite passed all 11 sections at desktop, tablet and mobile widths plus existing-account assignment, contact editing, phone username creation, legacy-account repair preserving ID/password, first-login password gating and old-password rejection. The mocked auth service rejected native phone login; no native phone authentication requests occurred. No live Supabase or SMS provider was used.


## v3.4 member onboarding and transfers

Production build and TypeScript passed. All 82 database checks passed. CSV parsing/member validation and browser tests covered new member creation, existing record reuse, explicit cell conflict submission, coordinator/admin review, atomic batch rollback, scoped permissions, stale transfer protection, legacy assignment guards and mobile CSV preview. Prior phone username and visitor-form regressions still passed. Visitor data and the visitor journey were not changed. The Next.js security upgrade recommendation remains outstanding. See HOME_CELL_V3_4_MEMBER_ONBOARDING.md for setup and limits.

## v3.5 security and reliability

Next.js 16.4.1 and sharp 0.35.5 installed. TypeScript and the production build pass. Production dependency audit reports zero known vulnerabilities at validation time.

- 82 existing Home Cell database checks pass; 015 additionally tested on an isolated engine for reruns, counter limit/reset, invalid policy inputs, expiration cleanup, private table access and service-only RPC execution.
- Reliability tests verify read retry bounds, no application write replay, 429 passthrough, caller cancellation, upstream timeout, streaming byte limits including dishonest Content-Length, malformed JSON and unsupported content types.
- Member validation (33), care database (26), guest database (28), Gateway database (20), Gateway contract (56), Gateway HTTP integration (27), account/date (13) plus phone identity (11), and onboarding/CSV (15) checks pass.
- Production Home Cell browser suite passes all 11 sections at 1440/768/390 widths, no overflow/runtime exceptions, role views, mobile menu, visitor form preservation, contact editing, existing-account reuse, SMS-free phone login/repair/activation, new/existing member onboarding and transfer review. Added real HTTP checks verify 429/Retry-After, fail-closed 503, payload errors, request IDs, no-store and browser security headers. Hosted Supabase and provider sending were not contacted.

The new CI intentionally runs domain/database/production browser checks explicitly. The historical broad `npm test` preview snapshot suite is not claimed passing or replaced by these checks; it has a pre-existing overview assertion mismatch. Gateway tests were aligned with existing email/SMS ON defaults and optional-category OFF defaults, while delivery remains independently disabled. An absent optional Gateway email now disables that unavailable email channel rather than rejecting a valid public payload. This is a compatibility fix, not a new visitor journey.

See HOME_CELL_V3_5_HARDENING.md for migration order, operating limits and provider-managed controls. Live backups, alerts, recovery timing and hosted SQL remain unverified and unapplied.

## v3.5.1 Netlify public origin

Public origin selection is tested for localhost, proxy mismatch, production, preview isolation, missing/foreign Origin, unexpected ports, malformed URL configuration and fail-closed behavior. Production HTTP origin regression and production build passed. No SQL change; live Netlify deployment/settings must be updated by the operator. See HOME_CELL_V3_5_1_NETLIFY_ORIGIN.md.

## v3.6 leadership accounts and password handover

Production build including TypeScript passes. The full fixture-backed browser suite passes all 11 dashboard sections at desktop/tablet/mobile widths, role views, visitor draft preservation, onboarding/transfers, phone account creation/repair and password activation. Leadership-specific browser checks cover the two-step wizard and retained contact draft, styled empty-contact and permission-error popups, existing-account confirmation without an invitation or password overwrite, reassignment, replacement password generation, handover acknowledgement/Escape protection, masked/revealed password, no password in local/session storage, mobile layout, source-directory editing and Gmail-based account login/activation. Failure cases verify coordinator reset denial, explicit shared-password acknowledgement, no credential response on uncertain provider update, and returning the saved credential with an audit warning when completion audit is unavailable. Follow-up checks cover activity-load errors without incorrectly displaying an empty history. Desktop light and mobile dark/light views were visually inspected; screenshots are internal QA artifacts, not part of the package.

93 isolated Home Cell database checks pass (the previous 82 plus 11 password-operation checks), including migration reruns, administrator-only authority, reason/self-reset protection, assignment-derived target, session cutoff, duplicate request prevention, reset serialization, single completion audit, uncertain outcomes, suspended targets and direct RPC restrictions. Account/date and phone validation checks and the reliability suite pass; proxy-aware origin HTTP checks also pass. The broad legacy preview snapshot suite is not newly claimed passing.

Supabase Auth update and database audit are separate operations: uncertain responses require reconciliation and a fresh replacement after the 90-second reservation. No hosted Supabase, Gmail, email/SMS delivery, live password or deployment was used during testing. Apply SQL 016 before using the new replacement action.
