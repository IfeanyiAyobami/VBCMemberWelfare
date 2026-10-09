# Vine Branch Member Care — Frontend Phase 1

A runnable Next.js frontend of the reviewed Vine Branch Church visitor and member care experience. It uses the church’s navy/red palette, locally bundled Anton/Poppins typography, and the original email artwork from the prototype.

**This is a frontend review build.** All people, delivery records, schedules and sign-in confirmations are fictional. Changes to those records last only until a page reload. No database is connected, no messages are sent, and sign-in is a visual simulation. Use fictional details.

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

No environment variables, provider accounts or credentials are needed.

## Single HTML review

Open **`preview.html`** directly in a browser. CSS, JavaScript, typography and graphics are embedded in that file. It works without installing Node.js. Navigation uses hash URLs when opened as a local file.

After editing source files, regenerate it with `npm run preview:html`. The HTML file is an offline review artifact, not an Elementor integration or a production data collection form.

## What is included

| Screen | URL | Review interactions |
| --- | --- | --- |
| Care overview | `/overview` or `/` | Milestones, visitors, invitations, delivery queue |
| Members | `/members` | Search, filters, selection, add/edit, empty states |
| Member profile | `/profile/m1` | Contact details, consent, notes, history |
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
| Staff access | `/access`, `/access/recover` | Sign-in/recovery validation and confirmations |
| First-time visitor | `/join` | Four steps, field validation, preferences, welcome confirmation |
| Member preferences | `/preferences/m1` | Channels, topics and unsubscribe confirmation |
| Cost planner | `/budget` | Illustrative service/SMS scenarios |
| Review guide | `/guide` | Complete review sequence and design references |

Email previews include desktop/mobile modes, image upload or HTTPS image URLs, alt text, images-off review, editable headlines, personalisation and full-screen preview. Graphics apply to email; SMS remains text only. Cost and quota examples are planning snapshots, not billing or live provider limits.

## Start the review here

1. Open `/join`, select “Try fictional visitor”, and complete all four steps. Try submitting an empty step to review validation. Check the welcome screen and open the new record.
2. Find the visitor in `/members`. Edit their milestones and permissions. Check their profile and notes.
3. Open `/templates`. Edit the birthday message and artwork. Switch to mobile and images-off views, then inspect the anniversary and programme templates.
4. Create a programme and a campaign. Check audience eligibility, personalisation, SMS segments and the schedule confirmation.
5. Edit a monthly newsletter. Change a story and event selection, then review the simulated batch schedule.
6. Pause an automation, inspect a failed delivery and try an unsubscribe. Refresh to restore all sample data.

## Code structure

```text
src/app/                     Next.js App Router, layout, CSS, 404 and robots
src/components/CareApp.tsx   React mount and cleanup boundary
src/lib/routes.ts           Allowed deep-link routes
src/lib/care-runtime.js      Reviewed UI rendering and interaction handlers
src/lib/demo-state.js        Fictional records and initial settings
src/lib/shell-markup.js      Navigation and shared page shell
src/lib/theme.js             Pre-paint preference, theme toggle and cleanup
src/app/themes.css           Complete light/dark theme styling
public/assets/              Local church fonts, logo and review artwork
tests/                      Workflow, validation and email editor checks
tools/build-preview.mjs     Self-contained HTML export
netlify.toml                Future Netlify build configuration
preview.html                Single-file review option
```

The App Router and React lifecycle host the existing reviewed UI renderer. Most screens currently use HTML render functions and delegated events in `care-runtime.js`, rather than individual React components. This preserves the working interactions for this first frontend phase. Event listeners are removed on unmount, including development Strict Mode remounts. Demo state is created fresh on each mount.

Normal browser history and direct page URLs work in the Next.js app. In-app record changes stay in memory during navigation. Reloading a page resets those records. Newly created sample records are therefore unavailable after a reload. The saved display preference is separate and survives the reload.

## Check the build

```sh
npm run test
npm run typecheck
npm run build
```

The automated workflow checks cover all principal routes, required-field errors, duplicate contacts, channel/topic permissions, guest progression and welcome, imports, invitation scheduling, newsletter batches, unsafe image/link inputs and email preview modes. See `docs/VALIDATION.md` for the delivered build’s browser checks.

## Deployment and privacy

No deployment or live church website edit is part of this package. `netlify.toml` prepares the build for a later approved deployment; it does **not** make a deployment private. The demo sign-in screen does **not** protect other pages. Robots/noindex metadata also does **not** provide access control.

Before any hosted review, configure and verify actual deployment access protection. Agree the hosting destination and access with the owner before publishing. No public deployment is authorised by this handover.

## Later backend phase

Once the frontend is reviewed, connect the existing WordPress guest form and this app to one secure guest submission endpoint, then Supabase records. Add genuine staff authentication, permissions, consent history, protected preference links and error/retry states for real data. Next add Brevo email and the selected paid SMS provider, delivery callbacks, scheduled birthday/anniversary jobs and an account-wide daily email allowance queue.

Provider keys must stay on the server. Scheduled sends in this frontend do not create real jobs. Production emails will require public hosted assets and testing in actual email clients; dashboard email previews alone do not establish inbox compatibility.

The live Elementor form is still separate. Its field mapping and submission connection will be handled in that backend phase; this package does not change it.
