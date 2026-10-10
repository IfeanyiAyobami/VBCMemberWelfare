# Legacy reference only — superseded for the working Gateway

Do not follow this bridge installation guide for Gateway v1.1.3. Use ../GATEWAY_SETUP.md. The historical v0.6.0 instructions below describe a different, uninstalled plugin and payload.

# Guest review and Elementor connection — v0.6.0

Your guest journey stays on the WordPress church website. The dashboard stays a separate Next.js application. This package prepares the connection; it has not installed anything on the live church site or deployed a site.

The data path is **Elementor guest journey → same-origin WordPress bridge → signed Next.js receiver → Supabase guest queue → staff review → member profile**. A saved guest card does not automatically create a member or send a message.

Start here if v0.5.0 permissions, notes and archive/restore already work.

## 1. Open the new dashboard folder

1. Extract the package to a new folder named `VBCMemberWelfare_Guest_Review_v0.6.0`. Keep your working v0.5.0 folder as a backup.
2. Copy your existing working `.env.local` into this new folder. Do not replace its project URL or publishable key with the placeholders in `.env.example`.
3. Open a terminal in the new folder, then run:

   ```powershell
   npm install
   ```

4. In the **VBCMemberWelfare** Supabase project, open SQL Editor → New query. Copy the complete contents of `supabase/005_guest_review.sql` and run it once. It is additive and safe to run again. Keep your existing core schema and `004_care_controls.sql`; do not recreate or drop the database. If starting from a package earlier than v0.5.0, complete `CARE_SETUP.md` and run `004_care_controls.sql` first.
5. Start the dashboard:

   ```powershell
   npm run dev
   ```

6. Sign in and open **Guest submissions**. The sidebar now includes this saved screen.

## 2. Confirm the queue works before connecting WordPress

Use fictional details and an email address you control. No messages are sent.

1. Click **Record a guest card**. Complete the four steps; a Nigerian phone number is required. Birthday and wedding anniversary are optional month/day values such as `02-29` and `11-04`.
2. Select visit/follow-up permission, then independently choose email, SMS and message topics. Record how the choices were confirmed. Click **Save for review**.
3. Refresh. The card should still appear as **Pending review**.
4. Open the card. Check every answer and the choices/evidence. Click **Create visitor record**, then **Confirm creation**. Open the saved member profile and check the permission choices.
5. Record another card with the same phone or email. Open it, select the matching profile, click **Link selected member** and confirm that you checked identity. The existing profile, milestone dates and permission choices must stay unchanged.
6. Archive that profile and submit another matching test card. Creation/linking should be blocked until the profile is restored. **Reject card** requires a reason of at least 10 characters and retains the card in the rejected view.
7. A viewer can read cards but cannot record or review them. An inactive/non-staff account cannot read the queue.

Contact matches are review clues, including shared family contacts. There is no automatic merge. Creating a member with a phone/email already in the directory, including archived members, remains blocked by the database.

## 3. Configure the Next.js receiver on a reachable staging address

A WordPress server cannot reach `localhost` on your Windows computer. Before a hosted WordPress test, the dashboard needs a reachable HTTPS address, for example your Member Welfare Netlify staging/preview address. Use your existing Netlify workflow with this updated code; this package does not deploy it for you.

1. In Supabase → your **Member Welfare** project → API Keys, create or select a **server secret** (`sb_secret_...`). Keep the publishable key already used by staff login. Never paste the secret key into Elementor, a browser script, GitHub or a `NEXT_PUBLIC_` variable.
2. Generate a separate shared bridge secret on your computer:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Copy the resulting 64-character value directly into the two server configurations below. Do not post it in chat.
3. Add these values to the Member Welfare Netlify environment for the staging deployment:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=<your existing Member Welfare Supabase URL>
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your existing publishable key>
   SUPABASE_SECRET_KEY=<server-only Supabase secret key>
   VBC_WORDPRESS_BRIDGE_SECRET=<your generated 64-character bridge secret>
   VBC_GUEST_BRIDGE_ENABLED=true
   ```

   For a local receiver test, these three new server variables can also be added to `.env.local`; restart the dev server. Leave `VBC_GUEST_BRIDGE_ENABLED=false` wherever you do not want intake enabled.
4. Redeploy the staging dashboard with the new environment values. The receiver address is:

   ```text
   https://YOUR-CARE-DASHBOARD-HOST/api/intake/wordpress
   ```

5. Dashboard screens continue to require active staff sign-in. The receiver accepts a server signature, rather than staff cookies. A separate hosting password wall covering this receiver will prevent WordPress from reaching it; use a staging host where signed receiver requests can arrive while dashboard screens remain protected by the app's staff login. Do not remove access protection from unrelated sites.
6. A normal browser GET to the receiver returns method-not-allowed. An unsigned POST returns unauthorized. These are expected; no public member list or anonymous database insert was added.

## 4. Prepare WordPress without replacing the live guest page

Use a staging WordPress site or a private draft copy of the current guest page first. Keep the original page/widget as your rollback copy.

1. Create a Cloudflare Turnstile widget and add the hostname of the WordPress test site. Use that widget's site key and secret key. When moving to the live church domain later, add the live hostname to the widget's allowed hostnames too.
2. In WordPress Admin → Plugins → Add New Plugin → Upload Plugin, select `wordpress/vbc-care-bridge.zip` from this package. Install and activate it. The plugin is **disabled for intake until configured**. It does not change existing pages, members or messaging settings.
3. Back up `wp-config.php` using your hosting file manager. Open `wordpress/wp-config-snippet.txt`, replace its placeholder values locally, then add those `define(...)` lines above the “stop editing” line in the real `wp-config.php`. Do not add a second opening `<?php` tag. Keep `VBC_CARE_BRIDGE_ENABLED` as `false` while filling the other values.
4. The full intake URL must point to the Member Welfare staging receiver from step 3. The WordPress bridge secret must be identical to the Next.js bridge secret. The Supabase secret key belongs only on the dashboard server; WordPress does not need it.
5. On your private copy of the guest page, use ONE of these options:

   - **Recommended:** add an Elementor **Shortcode** widget containing `[vbc_guest_journey]`. The plugin serves the complete HTML/CSS/JS journey and supplies the correct WordPress REST configuration URL automatically, including subdirectory sites.
   - **HTML widget:** replace the copied page's HTML widget contents with the entire `wordpress/vbc-care-bridge/elementor-guest-form.html` file. Its CSS and JavaScript are included. For a WordPress subdirectory or nonstandard REST URL, change `CONFIG.configurationURL` in that file to the correct same-origin configuration URL. The shortcode option handles this for you.

   Include the journey once per page. Retain the existing church colours, typography, artwork and welcome wording.
6. Once both servers are configured, set `VBC_CARE_BRIDGE_ENABLED` to `true` in the test WordPress `wp-config.php`. This enables the bridge on that WordPress host. It does not publish or replace a page.
7. Open the WordPress test host's `/wp-json/vbc-care/v1/config` URL. It should show `enabled: true`, a public site key and the WordPress guest endpoint. It must not show either server secret or the dashboard's Supabase key.

## 5. Test the complete visitor experience

1. Open the private test guest page using its canonical WordPress hostname. Fill out a fictional card on mobile and desktop. Review answers; choose only the permissions you want and complete the security check.
2. Submit. The welcome screen must appear only after a confirmed save. It should greet the visitor by first name and retain the requested church welcome message.
3. In the dashboard, open **Guest submissions**. The card should appear once, with source **Elementor website** and status **Pending review**. Check all original guest fields, optional milestones and independent choices.
4. Create a visitor from that card. Check its profile and permission history. Then submit another card with a matching contact and review/link it. The existing profile must remain unchanged.
5. Temporarily set the **test** dashboard's `VBC_GUEST_BRIDGE_ENABLED=false` and redeploy/restart. A new form submission must show an error and keep the answers, without a welcome. Re-enable it and retry the same card; there should be one saved submission.
6. Check viewer restrictions and the mobile dark/light dashboard views again.

Only after this test is successful should the approved live page be connected. The bridge code is prepared here; the actual WordPress-host verification and live installation still need to be performed on your servers.

## Retry and privacy behaviour

- One form attempt uses one immutable submission UUID. A repeated save with identical details returns the original card. Different details cannot reuse a saved reference.
- If receipt is uncertain, the browser retains and locks the exact answers for retry. A confirmed validation rejection allows correction. Guest answers are not stored in browser localStorage or WordPress transients/logs by this plugin. Closing the page loses an unsaved draft; staff may need to check the queue after an interrupted attempt.
- The public browser posts to WordPress on its own origin. WordPress checks origin, a honeypot, a best-effort per-server-IP rate limit and a server-verified Turnstile response with the expected hostname/action.
- WordPress signs the exact outgoing JSON using a timestamp and HMAC. The receiver validates the signature, five-minute clock window, size, field names, dates, contacts and actual booleans before writing.
- The receiver uses a separate server-only Supabase client. Staff APIs continue using the signed-in publishable client and RLS. Anonymous users have no direct insert/select permission on the guest table.
- Reviewed submissions are retained. Linking never replaces existing identity or consent. Rejection does not create a member.
- All birthday, anniversary, programme, newsletter and SMS sending remains paused. This stage does not connect Brevo or send messages.

## Troubleshooting

| What you see | Check |
| --- | --- |
| Run `005_guest_review.sql` message | Run the supplied complete migration in the correct project. |
| Configuration `enabled: false` | Both WordPress enable flag and all four WordPress configuration values. |
| Security check fails | Turnstile keys, test site's allowed hostname and action `vbc_guest`; browser access to Cloudflare. |
| WordPress 403 | The form must be served from the canonical origin configured as the WordPress home URL. |
| Receiver 401 | The shared secrets must match exactly; both server clocks should be current. |
| Form cannot confirm save | Dashboard HTTPS URL/path, new Netlify environment values, hosting access wall, SQL migration and server secret key. |
| Matching archived profile | Restore the existing record through Members, then reload the guest card. |
| Stale review | Copy notes, close the decision dialog and reload the saved card before reviewing. |
| Shared church Wi-Fi reaches the rate limit | Adjust optional `VBC_CARE_RATE_LIMIT` in server configuration; Turnstile remains required. |

Disable both intake flags to pause receipt. Restore the backed-up Elementor widget to roll back the public journey. Do not drop guest/member tables. Existing member notes and permission history remain intact.

## Developer validation

`npm run build`, `npm test`, and `npm run test:auth` cover the application using local fixtures. `node tests/auth-integration.mjs --browser` optionally includes Playwright checks; install Playwright and Chromium separately if needed. `npm run test:guest-db` and `npm run test:care-db` use an optional `@electric-sql/pglite` runtime to check real PostgreSQL-compatible transactions/RLS without contacting hosted Supabase. No production dependency was added for testing.

The PHP plugin has not been executed or linted by a PHP runtime in this workspace; validate it on the WordPress staging host (or run `php -l wordpress/vbc-care-bridge/vbc-care-bridge.php` with PHP installed).

The browser integration fixture simulates WordPress forwarding and Turnstile while exercising the actual Next.js signed receiver and guest screens. It does not establish a connection to your real WordPress, Supabase, Netlify or Cloudflare accounts. On-host WordPress testing remains necessary before live activation.
