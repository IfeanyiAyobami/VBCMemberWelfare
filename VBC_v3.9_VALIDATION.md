# VBC v3.9 validation — 31 October 2026

## Passed

- Production `npm run build`, including TypeScript checks.
- `npm run test:whatsapp`: 47 combined database checks (30 existing v3.8 cases plus 17 WhatsApp cases), with the entire migration chain and 020 applied twice. Checks include scoped history, Foundation denial, explicit API permission, handoff not being sent, stable-request replay, campaign duplicate prevention, one dispatcher, uncertainty/callback correlation, late/out-of-order receipts, staff outcome idempotency, reply deduplication, STOP opt-out, permission changes, global daily cap, safe rejection retry and uncertain-send retry blocking and changed-number reply isolation.
- WhatsApp provider/core checks: missing/disabled configuration, public origin validation, flyer-first image-header payload, exact approved-template match, language/status/parameter mismatch, raw-body HMAC checks, WABA/phone isolation, rejected/accepted results, timeout/5xx/malformed-success uncertainty, and no provider POST after approval or permission failure. Provider transport is a local in-memory stub; it sends nothing externally.
- Production browser suite `node tests/home-cell-browser.mjs`: passed. Real Next.js HTTP routes with fixture Supabase: create invitation, supplied flyer image/download, staff handoff link, staff outcome recording, API-disabled guard, cross-origin write rejection, webhook verification and bad/signed events. WhatsApp checked at 1440/834/390 in light/dark with no horizontal overflow; dark inputs explicitly match #000956. Actual internal mobile screenshot reviewed. Existing Journey and full Home Cell browser flows also passed.
- Existing v3.8 database/export, Home Cell database, WordPress gateway validation/database and reliability regression commands passed.
- Supplied Sunday flyer copied byte-for-byte; original crest/fonts and earlier public assets preserved.

## Limits

Database tests use PGlite with an Auth fixture. Browser tests run the actual production Next.js server with mocked Supabase and fictional people. No hosted Supabase writes, Netlify deployment, billable Meta sends or real recipient contacts occurred. No live Meta token/account/template was supplied, so a controlled opted-in live test remains necessary after configuration.

No production dependencies were added. API sends are individually confirmed Coordinator actions. Bulk scheduling, email/SMS workers, arbitrary flyer uploads, an API reply composer and inbound media downloads are outside this release.
