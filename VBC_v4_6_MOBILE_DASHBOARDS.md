# VBC v4.6 — Mobile dashboards

## Install
Replace the source files in your existing project with this release. Keep your local environment variables. Run npm install if needed, then restart the dev server or deploy normally. Existing migrations through 029 remain required; this release adds no SQL and no environment variables.

## Friend dashboard
The compact Friend view opens to Today with due/overdue counts, assigned people, first contacts without dates and the next three scheduled contacts. Counts use real loaded records, not mockup values. My people offers name/phone/email search and guest/member filters. Follow Through displays today's recorded updates and their pending/sent status. Account contains the existing help, theme, full-view switch and sign-out controls. The header also has a theme toggle. Register / import people opens the existing full-view registration tools. Existing call, WhatsApp, attendance, profile, opt-out, offline outbox and server permissions remain in place.

The existing Friend list fetch limit (five pages) is unchanged. No new birthday feed or self-service PIN-change feature is introduced by this design release. PIN resets stay in Coordinator Friends & accounts.

## Home Cell
The mobile navigation now prioritizes Today, My cell and Meetings. More retains the other existing sections, including reports, finances, visitors and settings. The dashboard adds direct meeting/report links and draft/correction report counts for the selected period. Date and workspace filters remain available. Coordinator controls and transfer permissions remain enforced by existing server rules.

## Visual design
Exact custom navy #000956. Dark cards use faint translucent lavender overlays and fine borders rather than saturated purple. Anton uppercase display headings, Poppins body, white/light lavender text, church red actions, rounded cards and safe-area navigation. Light mode uses light surfaces. All assets use the existing church logo. Mobile Home Cell styling is scoped below 760px; existing desktop structure remains. Friend compact view also adapts to larger screens.

## Validation
Production Next.js build passed. Rendered React DOM interaction test passed for Today metrics, assigned-person isolation, tab navigation, search and filters, empty results, theme toggle and registration handoff. PIN and account-route regression tests passed. Browser test selectors were updated for the new tabs. Full browser/mobile visual QA was not run: the managed preview service could not resolve the existing symlinked Next binary. Verify both themes on your phone after deploying.
