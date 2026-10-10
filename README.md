# Vine Branch Member Care — Gateway v1.1.3 integration, v0.6.1

A runnable Next.js frontend of the reviewed Vine Branch Church visitor and member care experience. It uses the church’s navy/red palette, locally bundled Anton/Poppins typography, and the original email artwork from the prototype.

**Staff sign-in, Members and Guest submissions use Supabase.** Members and UUID profiles save details, permissions with history/evidence, notes and reversible archive/restore changes. Guest cards have a saved queue, original form fields, independent choices and staff decisions to create a visitor, link a matching profile or reject with a reason. Other modules retain fictional review data. No care email or SMS is sent.

Start with **[GATEWAY_SETUP.md](GATEWAY_SETUP.md)**. This update accepts the working First-Timer Gateway v1.1.3's exact 24-field payload, Bearer token and Idempotency-Key at **POST `/api/integrations/wordpress/first-timers`**. It saves to the existing guest queue and acknowledges safe retries. It does not replace Elementor, change Sheets/Gmail, or rebuild completed dashboard features.

Extract the uniquely named **VBCMemberWelfare_Gateway_Integration_v0.6.1** folder, copy your working `.env.local`, check the existing database, and run additive SQL 005 if missing, then SQL 006. The guide covers server environment variables, Netlify preparation, an operator test and safe backfill. The optional admin-only requeue helper uses your installed Gateway's Member Care hook. No credentials, hosted deployment or church records are included.

The old v0.6.0 HMAC bridge files are retained as legacy reference, disabled by default. Do not install that plugin or replace the working form for this integration. Staff APIs and permissions remain protected.

Development and builds use **Webpack**, retaining the workaround introduced in v0.3.1 for the reported Turbopack internal task error. Authentication and staff checks remain enabled.

## Dark and light modes — v0.2.0

The entire dashboard now starts in dark mode, using the supplied VBC Sermons screenshot as its colour reference. Use the sun/moon button in the top bar to switch themes. It shows “Light mode” or “Dark mode” on desktop and an icon on mobile, with an accessible label in both layouts.

| Area | Dark theme colour |
| --- | --- |
| Page background | `#040451` |
| Cards | `#0F0F59` |
| Sidebar | `#170059` |
| Headings | `#F5F5FF` |
| Secondary text | `#B9B9DB` |
| Main controls | `#E51B25` red, adjusted for readable white labels |

The display preference is saved under `vbc-care-theme` in this browser. It survives reloads and synchronises across tabs of the same app. If browser storage is unavailable, the switch still works for the current page. Only the theme setting is stored; fictional member records are not saved. Theme changes preserve the current screen, visitor step, draft messages and unsaved form inputs.

The dark styling covers navigation, forms, tables, calendars, dialogs, import screens, automations, delivery reports, settings, email editing tools and the visitor welcome journey. The email messages inside their previews retain the original designed colours so the editor continues to show the intended message layout.

## Run locally

Use Node.js 22.14 or newer and npm.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. To review a production build:

```sh
npm run build
npm start
```

The Next.js app requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Missing or invalid configuration shows setup guidance and never opens the dashboard. Use the separate offline HTML below for review without an account.

## Single HTML review

Open **`preview.html`** directly in a browser. CSS, JavaScript, typography and graphics are embedded in that file. It works without installing Node.js. Navigation uses hash URLs when opened as a local file.

After editing source files, regenerate it with `npm run preview:html`. The HTML file is an offline review artifact, not an Elementor integration or a production data collection form. Its sign-in and member records remain clearly labelled simulations; real Supabase authentication and member storage run only in the Next.js app.

## What is included

| Screen | URL | Review interactions |
| --- | --- | --- |
| Care overview | `/overview` or `/` | Milestones, visitors, invitations, delivery queue |
| Saved members | `/members` | Database list/search/status/archive filters, pagination, add/edit, empty/error states |
| Saved member profile | `/profile/<uuid>` | Saved contact/milestones, preferences with evidence/history, care notes, archive/restore |
| Sample member profile | `/profile/m1` | Fictional contact details, consent, notes and history review |
| CSV import | `/import` | Upload/sample, mapping, invalid rows, duplicate review |
| Celebrations | `/celebrations` | Birthday/anniversary calendar and greeting previews |
| Programmes | `/programmes` | Create/edit a programme and start an invitation |
| Campaigns | `/campaigns`, `/compose` | Four-step composer, audience, channel, cost, schedule |
| Monthly newsletters | `/newsletters` | Illustrated stories, event schedule, independent issues, quota review |
| Templates | `/templates` | Birthday, anniversary and programme email/SMS editors |
| Automations | `/automations` | Pause/resume, channel, timing, leap-day settings |
| Delivery reports | `/delivery` | Filter, detail, failure, simulated retry |
| Settings | `/settings` | Sender identity, timezone, SMS planning limit |
| Provider setup | `/settings/providers` | Connection placeholders and production requirements |
| Team roles | `/settings/team` | Role descriptions and invitation preview |
| Staff access | `/access`, `/access/recover` | Real email/password login, staff check and recovery help |
| First-time visitor | `/join` | Four steps, field validation, preferences, welcome confirmation |
| Member preferences | `/preferences/m1` | Channels, topics and unsubscribe confirmation |
| Cost planner | `/budget` | Illustrative service/SMS scenarios |
| Review guide | `/guide` | Complete review sequence and design references |

Email previews include desktop/mobile modes, image upload or HTTPS image URLs, alt text, images-off review, editable headlines, personalisation and full-screen preview. Graphics apply to email; SMS remains text only. Cost and quota examples are planning snapshots, not billing or live provider limits.

## Start the review here

1. Open `/join`, select “Try fictional visitor”, and complete all four steps. Try submitting an empty step to review validation. Check the welcome screen and open the new record.
2. In `/members`, add a separate fictional test member and follow MEMBER_SETUP.md to verify persistence. The visitor preview above remains separate until guest intake is connected. Its linked sample profile still allows preview notes/preferences.
3. Open `/templates`. Edit the birthday message and artwork. Switch to mobile and images-off views, then inspect the anniversary and programme templates.
4. Create a programme and a campaign. Check audience eligibility, personalisation, SMS segments and the schedule confirmation.
5. Edit a monthly newsletter. Change a story and event selection, then review the simulated batch schedule.
6. Pause an automation, inspect a failed delivery and try an unsubscribe. Refresh to restore all sample data.

## Code structure

```text
src/app/                     Next.js App Router, layout, CSS, 404 and robots
src/components/CareApp.tsx   React mount and cleanup boundary
src/components/MemberDesk.tsx Native React saved directory and member editor
src/components/MemberCarePanels.tsx Preferences/history, notes and archive dialogs
src/lib/members/              Shared validation, mapping and guarded data access
src/app/api/members/          Guarded member details, consent/history, notes and archive endpoints
src/lib/routes.ts           Allowed deep-link routes
src/lib/care-runtime.js      Reviewed UI rendering and interaction handlers
src/lib/demo-state.js        Fictional records and initial settings
src/lib/shell-markup.js      Navigation and shared page shell
src/lib/theme.js             Pre-paint preference, theme toggle and cleanup
src/app/themes.css           Complete light/dark theme styling
public/assets/              Local church fonts, logo and review artwork
tests/                      Workflow, validation and email editor checks
tools/build-preview.mjs     Self-contained HTML export
supabase/004_care_controls.sql Additive guarded consent/note functions
supabase/005_guest_review.sql Guest intake/review transactions
wordpress/vbc-care-bridge.zip Legacy HMAC bridge (do not install for Gateway v1.1.3)
wordpress/vbc-care-bridge/elementor-guest-form.html Complete Elementor HTML/CSS/JS
GATEWAY_SETUP.md            Working Gateway integration and safe backfill
supabase/006_wordpress_gateway.sql Transactional Gateway receipt
wordpress/vbc-member-care-requeue.zip Optional admin-only Member Care retry helper
tools/test-gateway.mjs      Explicit deployed receiver check with fictional data
GUEST_SETUP.md              Existing guest review workflow
CARE_SETUP.md               Installation and complete care-controls review
netlify.toml                Future Netlify build configuration
preview.html                Single-file review option
```

The App Router and React lifecycle host the existing reviewed UI renderer. Most screens currently use HTML render functions and delegated events in `care-runtime.js`, rather than individual React components. This preserves the working interactions for this first frontend phase. Event listeners are removed on unmount, including development Strict Mode remounts. Demo state is created fresh on each mount.

Normal browser history and direct page URLs work in the Next.js app. Saved member changes persist in Supabase and UUID profiles work across refreshes and signed-in tabs. The other preview workflows still keep records in memory; reloading resets those samples. The browser display preference is saved separately.

## Check the build

```sh
npm run test
npm run typecheck
npm run build
```

The automated workflow checks cover all principal routes, required-field errors, duplicate contacts, channel/topic permissions, guest progression and welcome, imports, invitation scheduling, newsletter batches, unsafe image/link inputs and email preview modes. See `docs/VALIDATION.md` for the delivered build’s browser checks.

## Deployment and privacy

No deployment or live church website edit is part of this package. All Next.js dashboard pages now require verified Supabase Auth and active staff membership. Review URLs such as `/join` and `/preferences/m1` are staff-only in this phase. Static artwork and JavaScript are ordinary app assets. `netlify.toml` prepares the build for later approved deployment; it does not configure platform-level private access. Robots/noindex metadata does not provide access control.

Before any hosted review, configure and verify actual deployment access protection. Agree the hosting destination and access with the owner before publishing. No public deployment is authorised by this handover.

## Later backend phase

Staff authentication, member details, preferences/history, care notes, archive/restore, guest review and the secure WordPress receiver are implemented in this package. Follow GATEWAY_SETUP.md to connect the already-working WordPress Gateway. Elementor needs no replacement. Next implement saved content editors, protected preference links and provider workers with delivery callbacks and account-wide quotas. Permanent deletion/erasure needs its own implementation.

Provider keys stay on the server. Scheduled sends in preview screens do not create real jobs. Production emails will require public hosted assets and testing in actual email clients; dashboard previews alone do not establish inbox compatibility.
