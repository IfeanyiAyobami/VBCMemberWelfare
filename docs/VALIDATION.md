# Frontend validation — 9 October 2026

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

## Scope of the checks

No real authentication, database, email/SMS delivery, WordPress submission connection or hosted access protection is implemented. The email previews were checked in the web UI, not in actual email inboxes. Those integrations and provider tests belong to the later backend phase. No site was deployed and the live church website was not changed.
