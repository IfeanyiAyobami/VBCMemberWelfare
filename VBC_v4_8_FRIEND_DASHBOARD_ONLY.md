# VBC v4.8 — Friend dashboard only

## Install
Copy this full source release into your existing checkout, preserving local environment files. Restart the local server or deploy through Git. No new SQL, dependency or environment variable is required. Existing migrations through 029 and the existing server service-role key remain required.

## Approved Friend interface
- Today restores three distinct cards: due today, overdue, and total assigned people. Actual record counts replace fictional mockup numbers.
- Exact navy #000956, faint purple glass, Anton headings and Poppins body retained in both themes.
- Bottom tabs: Today, My people, Follow Through, Account. Follow Through shows recorded activity and pending/sent status.
- My people has search, guest/member filters and Register. Registration and CSV import stay in Friend-owned dialogs, with no full-view navigation.
- Person screen has Call / WhatsApp / Log outcome, next step, Overview / History, recorded journey stages, contact details, church attendance and a pinned Log contact outcome button.
- Birthday/anniversary cards use a server feed restricted to the authenticated actor's assigned records and contact/celebration preferences. Send greeting opens a WhatsApp composer; the user chooses whether to send. No automatic messaging or delivery claim.

## Access
The server resolves capabilities before selecting the dashboard. A Friend-only user receives the restricted shell. The full-view switch, saved-mode override and profile full-view link have been removed. Old localStorage values or coordinator hashes cannot select a full shell. Existing server role checks and database RLS still restrict data/actions; restricted workers attempting main-office page routes redirect to Follow Through. Coordinators and administrators keep their authorized interfaces. No roles, PINs or Home Cell credentials are changed by this release.

## Retained
Home Cell v4.7.1, its corrected light mobile heading contrast, account creation fixes and the restored main overview are retained. Friend sign-out still warns about unsent offline updates. Existing registration conflict/idempotency rules remain server-enforced. The five-page Friend list fetch limit remains unchanged.

## Validation
Production build and TypeScript passed. Rendered React tests exercise summary cards, own assignments only, search/filter, profile navigation, in-dashboard registration and theme switching. Registration tests cover preserved fields, same-request retries and consent values. Server page tests cover forced Friend shell, main-office redirects, preserved Coordinator access and capability lookup failure. Celebration route tests cover verified assignment scoping, opt-outs and backend errors. Static actual-component snapshots inspected at 390px in light and dark. Full hosted-login/end-to-end browser flow was not run; verify with a real Friend login after deploying.
