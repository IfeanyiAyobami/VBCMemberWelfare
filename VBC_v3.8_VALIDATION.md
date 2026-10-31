# VBC v3.8 validation — 31 October 2026

## Completed

- Production `npm run build`: passed, including TypeScript checks.
- `npm run test:journey:v38`: passed. New integration database suite: 30 checks covering full migrations through 019, reruns, one-visit joining, blocked same-day exception, direct identity/source, undated evidence, CFC absence/corrections and actual dates, private support, scoped reports, archived cohorts and immediate capability revocation. Export suite checks ZIP CRC, OOXML/relationships, six sheets, escaped XML, literal strings and CSV formula protection.
- `npm run test:journey`: passed the 37-check historical 017 database suite plus calendar and default-preference tests. Its old eligibility checks deliberately test the historical migration in isolation; runtime v3.8 is governed by 018 and the new suite.
- `npm run test:home-cell`, `test:gateway`, `test:gateway-db`, `test:guest-db`, `test:care-db`, `test:reliability`, `test:members`, `test:home-cell:accounts`, `test:home-cell:onboarding`: all passed.
- Production-browser fixture run `node tests/home-cell-browser.mjs`: passed using Chromium. New journey verified desktop/tablet/phone in both themes; form retention on errors/theme changes; direct identity switching/confirmation reset and opt-out retention; one-visit joining; source history; ministry/Home Cell integration; responsive reports; Excel download. Existing Home Cell screens/roles, leadership dialogs, password handover/recovery, email/phone login, onboarding/CSV/conflicts, throttling and security headers passed.
- Internal screenshots reviewed for mobile journey and mobile reports. Reports checked at 1440, 834 and 390 pixels without horizontal overflow. Internal QA screenshots are not packaged.
- All recovered public assets compared byte-for-byte with v3.7.1 and preserved.

## Practical limits

Local database tests use PGlite with an Auth fixture; browser tests use a real production Next.js server with a mocked Supabase service and fictional records. They do not verify your hosted Supabase configuration, actual staff grants or Netlify environment. No hosted SQL was run and no deployment was published. Verify those after following the setup guide.

No new production dependency was added. The isolated Chromium installation used for QA is outside this source export. The historical workbook was not imported. No messages were sent.
