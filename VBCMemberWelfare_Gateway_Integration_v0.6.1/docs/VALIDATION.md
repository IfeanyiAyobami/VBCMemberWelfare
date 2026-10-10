# Working First-Timer Gateway integration — v0.6.1, 10 October 2026

| Check | Result |
| --- | --- |
| Webpack production build and TypeScript | Passed; new machine endpoint included alongside existing routes. |
| Exact Gateway contract/auth validation | 56 checks passed. |
| Actual Next.js HTTP with mock Supabase | 158 checks passed in production and 158 in Webpack development, including 27 new Gateway checks. |
| Browser regression | 28 member and 22 guest/legacy widget checks passed at desktop/mobile sizes; no runtime errors. |
| Isolated guarded Gateway SQL/RLS | 20 checks passed; migration applies twice. |
| Existing isolated database workflows | 28 guest and 26 care checks passed. |
| Existing offline preview/member validation | 279 preview assertions and 33 member checks passed. |

The new checks cover the exact 24-key payload, optional blanks, original local timestamp, aliases, literal Yes consent, bounds/options, constant-time Bearer authentication, missing/mismatched headers, malformed/oversized bodies, no redirects/cookies/cache, proxy bypass only for machine intake, stable fingerprints across JSON key order, conflicts, storage failure/recovery, lost acknowledgement after a committed save, twelve simultaneous HTTP requests, guest visibility and viewer write denial. The original member/guest screens and core care/guest SQL are unchanged; the only modification to existing runtime app source is the proxy exclusion.

The new SQL checks execute the real migration and guarded function in PGlite, including a unique-index violation, complete rollback, service-only grants, preserved staff permissions, immutable receipt conflicts, reviewed-card retries, legacy key collisions, no automatic member creation, no message jobs and disabled sending. PGlite queues statements on one connection; its Promise.all retry check is not a multi-session PostgreSQL load test. The HTTP test sends twelve requests concurrently to the actual Next.js server backed by a local mock service. Hosted multi-session/retry verification is supplied as an explicit operator test and remains to be run against the user's deployment.

All checks here use fictional fixtures and local runtimes. They do not inspect or write hosted Supabase, activate WordPress plugins, call Sheets/Gmail/Brevo/SMS, publish Netlify or modify the live church site. The GitHub URL could not be fetched in this environment; the baseline is the latest saved v0.6.0 source package, checked against the actual v1.1.3 Gateway PHP and attached handoff.

The optional WordPress requeue helper has been reviewed as source and packaged, but no PHP runtime is installed here. PHP lint and activation/nonce/capability/cron tests still need the WordPress host. The working Gateway v1.1.3 was not edited. The legacy widget browser checks below remain regression coverage; they do not prove the live Gateway connection and are not an instruction to replace Elementor.

Use GATEWAY_SETUP.md for the read-only hosted structure check, approved hosting, endpoint probe, WordPress configuration, live fictional test and one-at-a-time backfill with the original UUIDs.

---

# Guest review & Elementor bridge — v0.6.0, 10 October 2026

| Check | Result |
| --- | --- |
| Webpack production build and TypeScript | Passed with guest and signed intake routes |
| Existing offline suites | 279 assertions passed: 197 care, 46 email design, 36 theme |
| Shared member validation | 33 checks passed |
| Auth/member/care/guest HTTP integration | 131 checks passed in production and 131 in Webpack development |
| Production Chromium review | 28 member checks and 22 guest/form checks passed; desktop 1460 × 1040 and mobile 390 × 844; no runtime errors |
| Isolated PostgreSQL-compatible database | 26 existing care checks and 28 guest checks passed |
| Disabled receiver | Returns 503 and cannot write any records |
| WordPress PHP execution/lint | Not available in this workspace; staging-host validation still required |

The guest database checks execute the core schema, guarded care controls and new `005_guest_review.sql` twice in an isolated PostgreSQL-compatible runtime. They cover verified staff/source values, immutable submission-key retries, independent consent flags/evidence/history, atomic member creation, duplicate contacts including archived members, explicit matching identity and target/guest versions, unchanged existing profiles/permissions on link, rejection reasons, rollback, viewer/nonstaff/anonymous restrictions, editor rights and the trusted website receiver. Sending settings remain false.

The actual Next.js HTTP routes were exercised using local Supabase Auth/data fixtures. New checks reject unsigned, tampered and expired receiver signatures, arbitrary source/actor metadata and non-boolean choices. They confirm durable receipt/retry acknowledgements, one pending website card, saved staff cards, visitor creation with original choices and confirmed duplicate linking without changing an existing record.

Chromium completes login, intake validation, all four steps, save/refresh, creation, duplicate match/link confirmation, both dashboard themes, mobile sizing and viewer restrictions. The complete Elementor HTML is tested with a local WordPress forwarding/Turnstile fixture. The fixture intentionally loses a receipt after an actual signed receiver save: no welcome appears until an identical retry receives confirmation. The requested personalized church welcome then appears. The form retains its original navy/red appearance, embeds the church typography and includes independent optional choices.

These are sequential correctness checks, not a concurrent-load benchmark. The WordPress PHP plugin, real Turnstile widget and real hosting/account configuration require staging tests in **GUEST_SETUP.md**. No automated check contacted the hosted project, inserted actual church records, sent messages, deployed a site or modified WordPress. The application code is prepared for connection; the live form is unchanged.

New screenshots:

- `guests-dark-desktop.png`
- `guest-review-dark-desktop.png`
- `guest-linked-dark-mobile.png`
- `guest-linked-light-mobile.png`
- `elementor-connected-review-mobile.png`
- `elementor-welcome-mobile.png`

The records shown are fictional test fixtures. Historical validation reports below describe earlier package versions.

---

# Care controls — v0.5.0, 10 October 2026

| Check | Result |
| --- | --- |
| Webpack production build and TypeScript | Passed with all member/care API routes |
| Existing offline review suites | 279 assertions passed: 197 care workflows, 46 email design, 36 theme |
| Shared member validation | 33 checks passed |
| Auth/member/care HTTP integration | 106 checks passed in production and 106 in Webpack development |
| Production Chromium review | 28 checks passed at 1460 × 1040 and 390 × 844; no runtime errors |
| Isolated PostgreSQL-compatible database | 26 checks passed, including applying the new migration twice |

The new HTTP checks cover same-origin protection, consent evidence and strict boolean choices, trusted source/author values, saved preference reload, stale permission rejection, history with staff names, saved notes and stable retries, archive/restore and archived record filtering, read-only archived profiles, and viewer read/write boundaries. The browser review completes real login, create/edit/reload, consent validation and history, notes/reload, archive cancellation, confirmed archive/reload, archived directory lookup, restore with retained notes/preferences, both themes and mobile dialogs/navigation. Pagination labels now use the page returned with the displayed rows.

The isolated database tests execute the existing core schema/functions and the new additive migration with PostgreSQL row-level security enabled. They verify administrator/editor permissions, denied viewer/nonstaff/anonymous writes, direct preference-write denial, evidence and actor history, old-version conflicts, note retry uniqueness, archived write rejection, retained data after restore, and disabled sending settings. The guarded consent function locks the member and preference rows before the version comparison; the note function locks the active member and stamps the actor through the existing trigger. These are sequential stale-version and permission tests, not a concurrent-load benchmark.

All automated tests use local fixtures or an in-memory database. They do not contact the hosted Supabase project, write church records, send messages, deploy, or modify WordPress. The user's supplied v0.4.0 logs show successful profile GET/PATCH requests; the hosted review of the new controls still requires **CARE_SETUP.md**. The new SQL keeps existing tables and settings. Public intake, campaigns, newsletters and provider delivery remain later phases; offline HTML remains a simulation.

The production browser screenshots include the updated saved profile/directory/form views and:

- `member-consent-dark-desktop.png`
- `member-consent-light-mobile.png`
- `member-archived-dark-desktop.png`

---

# Saved member directory — v0.4.0, 9 October 2026

| Check | Result |
| --- | --- |
| Webpack production build | Passed, including TypeScript validation and both member API routes |
| Existing offline review suites | 279 assertions passed: 197 care workflows, 46 email design, 36 theme |
| Shared member validation | 33 checks passed |
| Auth/member HTTP integration | 75 checks passed in production and 75 in Webpack development |
| Production browser review | 15 checks passed at 1460 × 1040 and 390 × 844 |

The member HTTP checks cover empty storage, active staff authorization, administrator/editor writes, viewer read-only access, field validation, payload/type limits, duplicate protection including archived contacts, stable create retries, month/day milestones, null optional values, UUID profiles, search/status filters, pagination, stale edit rejection, cache prevention, storage errors and staff revocation. Profile endpoints expose explicit fields and do not accept consent, archive or creator changes from callers.

The Chromium browser check covered actual password login, directory loading, search and pagination, required-field feedback, member creation, profile reload, editing and another reload, mobile overflow/navigation/form size, theme changes, and the absence of create/edit controls for viewers. It recorded no browser runtime errors. Controls are held until the client is ready; Add member waits for the directory load.

These tests used a local mock Supabase Auth/data service. They did not contact the hosted project, insert live church records, change messaging settings or send messages. The real hosted persistence/RLS check still requires **MEMBER_SETUP.md**. No deployment or WordPress change was performed.

New reviewed screenshots are included in `docs/screenshots/`:

- `members-dark-desktop.png`
- `member-profile-dark-desktop.png`
- `member-profile-dark-mobile.png`
- `member-profile-light-mobile.png`
- `member-form-light-mobile.png`

---

# Previous staff login validation — v0.3.1, 9 October 2026

The Webpack production build and its TypeScript checks passed. The existing authentication integration suite passed **36 checks in production and 36 checks through the Webpack development server**, including proxy compilation, sign-in, cookie refresh, active staff checks, protected routes and logout. Both runs used a local mock Supabase Auth/data service. They did not contact the hosted project or send messages.

Version 0.3.1 explicitly selects Webpack for development and builds to avoid the reported Turbopack internal stale-task panic during proxy compilation. The Windows-specific error has not been reproduced here; confirm the workaround on the affected computer. Dependencies and authentication enforcement are unchanged.

The new login screen has not received an automated real-browser pass in this environment. Test the actual account and browser session using **AUTH_SETUP.md** before hosting. The original browser results below apply to the v0.2.0 preview.

## Previous authentication checks — v0.3.0

The v0.3.0 production build and TypeScript validation passed. The offline workflow, email design and theme suites passed 279 assertions (197 + 46 + 36). Its HTTP integration suite passed 36 checks against a local mock Supabase Auth/data service: anonymous access, password validation, active staff membership, all three roles, forged user metadata, safe redirects, HttpOnly cookies, cache prevention, expired-cookie refresh, staff revocation, provider errors, origin checks, logout and token tampering. Five environment validation checks also passed. Auth CSS parsed successfully; 129 declarations matched the CSS grammar and 22 used supported custom-property syntax.

---

# Previous frontend validation — v0.2.0, 9 October 2026

The delivered frontend passed the following checks. These results apply to fictional, in-memory records and simulated message delivery.

| Check | Result |
| --- | --- |
| `npm run build` | Next.js 16.4.0 production build passed |
| `npm run typecheck` | Route type generation and TypeScript checks passed |
| `npm test` | 197 care workflow, 46 email editor and 36 theme assertions passed |
| Current theme browser review | 421 assertions passed across 21 screens in both themes at 1460, 390 and 320px |
| Original route/history review · 8 October | 106 assertions passed across 21 deep links at desktop and mobile sizes |
| Original journey/lifecycle review · 8 October | 16 assertions passed for step focus, visible welcome, offline HTML and development Strict Mode |

The v0.2.0 review sampled the supplied VBC Sermons screenshot: page background `#040451`, card background `#0F0F59` and sidebar `#170059`. Browser computed styles matched those samples. Heading, secondary text, primary button and validation summary contrast passed the checked ratios. Dark mode is the default. Enter/Space activate the toggle, saved light/dark preferences survive reloads, and the offline HTML version uses the same preference logic.

All 21 principal screens had loaded images and no horizontal page overflow in both themes at desktop, standard mobile and narrow mobile widths. Theme changes retained newsletter edits and visitor step details. A second tab changed the shared theme while a member dialog remained open, preserving its unsaved fields. The dark visitor validation and final welcome still completed correctly. No browser runtime/console errors, failed assets or external requests occurred in the checked flows.

The theme unit checks also covered invalid saved values, unavailable browser storage, unrelated storage events and removal of toggle listeners during cleanup. Member record code still contains no browser storage or provider network calls.

Browser review used Chromium at 1460 × 1040 and 390 × 844 pixels. All principal screens had headings, working bundled images and no horizontal page overflow. The browser recorded no runtime errors, failed asset requests or external requests during the tested built-in flows.

The native navigation check added one fictional member, navigated away, used the browser Back button and confirmed that the record survived once. Reloading restored the demo records. Unknown deep links returned a designed 404.

The mobile visitor check covered required-field errors, all four registration steps, optional birthday input, contact permission, the welcome message and opening the new fictional profile. A final change moved focus and scroll to each step’s heading and the welcome heading. That change was checked in both the production app and the local single-file HTML preview.

The React development check confirmed that Strict Mode remounting did not duplicate member submissions or mobile navigation handlers. In-app history still retained the fictional record.

The email checks covered birthday, anniversary, programme and monthly newsletter previews; editable artwork and text; JPEG/PNG/GIF size/type validation; HTTPS links; alt text; supported personalisation fields; independent newsletter issues; images-off review; and SMS remaining text only.

## Screenshots

The current dark-mode screenshots are:

- `screenshots/dark-overview.png`
- `screenshots/dark-mobile-overview.png`
- `screenshots/dark-mobile-menu.png`
- `screenshots/dark-member-dialog.png`
- `screenshots/dark-celebrations.png`
- `screenshots/dark-newsletter-studio.png`
- `screenshots/dark-newsletter-email.png`
- `screenshots/dark-birthday-email.png`
- `screenshots/dark-mobile-visitor.png`
- `screenshots/dark-mobile-validation.png`
- `screenshots/dark-mobile-welcome.png`
- `screenshots/light-overview.png`

The earlier frontend screenshots remain included:

- `screenshots/desktop-overview.png`
- `screenshots/mobile-visitor.png`
- `screenshots/mobile-welcome.png`
- `screenshots/mobile-newsletter.png`
- `screenshots/birthday-email.png`

`theme-browser-validation.json` records the current v0.2.0 theme review. `browser-validation.json` records the original browser pass before the visitor focus change. `focus-validation.json` records that focused recheck and development lifecycle.

## Scope of the v0.2.0 checks

The v0.2.0 preview did not implement real authentication, database, email/SMS delivery, WordPress submission connection or hosted access protection. Authentication was added in v0.3.0; the checks above cover that implementation. The email previews were checked in the web UI, not in actual email inboxes. Data integrations and provider tests belong to the later backend phase. No site was deployed and the live church website was not changed.

