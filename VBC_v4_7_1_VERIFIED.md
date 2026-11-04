# VBC v4.7.1 — Verified mobile integration

## Install
Use this complete source release in place of v4.7. Keep local .env files. Restart locally or deploy through your existing repository. No additional SQL migration, dependency or environment variable is needed. Existing migrations through 029 remain required.

## Confirmed integrations
- Exact custom navy #000956; faint lavender glass overlays, fine borders, Anton display headings and Poppins body.
- Friend Today, searchable/filterable My people, Done today, Account, theme toggle and existing profile/contact/attendance flows.
- Single-cell Leader This week, weekly progress, P/L/A attendance, member cards and add/find/import tools. Existing Coordinator, Area Leader and administrator screens are retained.
- Separate Home Cell/Friend identities, missing-staff-record creation fix, four-digit PIN protections, dedicated Friends & accounts section, and assignments without reasons remain integrated.
- v4.7 layouts retained: Friend summary is one line rather than the mockup's three tiles. Leader homepage is This week. This is a working interface, not a pixel-for-pixel recreation of the image.

## Correction in this release
Fixed white Home Cell hero headings on light mobile backgrounds. Dark mode and desktop photo heroes retain their existing colors.

## Independently checked
- Production build passed on the uploaded v4.7 baseline; final release build rerun after the contrast correction.
- test:mobile-friend passed: real rendered React navigation, assigned-person isolation, metrics/summary, search/filter, empty state, theme callback and registration handoff.
- test:v45 passed: database journeys, PIN authentication/provisioning, account scope, assignment audit and intake checks.
- test:home-cell passed all 93 checks.
- Visually inspected static snapshots rendered from the actual Friend component and LeaderWeek component at 390px in both themes, using fictional records, shipped styles and fonts. This is not a full live-auth browser journey. The uploaded v4.7 report's 59/59 browser-suite claim was not independently rerun here.
- No hosted Supabase data changed; no messages sent; no live deployment performed.
