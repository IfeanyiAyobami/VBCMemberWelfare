# Supabase staff login — v0.5.0

For the current v0.6.0 package and Elementor connection, start with **GUEST_SETUP.md**. This document remains the reference for its earlier stage.

This update uses real staff login with your existing Supabase project. The Members directory and UUID profiles save member details; other content workflows still use fictional review data. See CARE_SETUP.md for the SQL update and care-controls review. It does not send messages, change messaging flags, create staff accounts or modify WordPress.

## Install beside your current project

1. Stop the development server with **Ctrl+C**.
2. Extract **VBCMemberWelfare_Care_Controls_v0.5.0.zip** beside your current project.
3. Open the extracted **VBCMemberWelfare_Care_Controls_v0.5.0** folder. It is a complete separate working copy; your earlier project can remain as a backup.
4. Copy your existing **.env.local** into this new folder, beside **package.json**. The archive contains no credentials.
5. Open this new folder in VS Code. Your earlier folder retains its files and Git history; the new archive does not include a .git directory.
6. Before starting, run **supabase/004_care_controls.sql** in the Member Welfare project as described in **CARE_SETUP.md**.
7. Open a terminal in the new folder containing **package.json**:

```sh
npm ci
npm run dev
```

Use Node.js **22.14 or newer**. Supabase dependencies are included in package.json and the lockfile.

## Turbopack proxy compilation error

This version uses Next.js's supported **Webpack** option for both development and production builds. It avoids the Turbopack compilation path that produced the reported internal stale-task panic. The authentication proxy and staff access checks remain enabled.

If you are still using v0.3.0, stop the server with **Ctrl+C** and run this in its project folder for an immediate retry:

```powershell
npm run dev -- --webpack
```

With v0.3.1 and later, ordinary `npm run dev` already selects Webpack. If you changed the scripts in an existing folder, stop the server and rename its generated cache before restarting:

```powershell
if (Test-Path .next) {
  Rename-Item .next (".next-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
}
npm run dev
```

Run these commands beside package.json. Only the generated `.next` directory is renamed; your `.env.local`, source and Supabase data are untouched. The server banner should show **(webpack)**. This workaround was checked locally; retry on your Windows computer to confirm the reported crash is resolved. The Webpack workaround needs no Auth account reset. The v0.5.0 care functions require the small SQL update in CARE_SETUP.md.

## Environment

Your .env.local must contain both values from **VBCMemberWelfare**, rather than the sermons project:

```env
NEXT_PUBLIC_SUPABASE_URL=YOUR_PROJECT_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Use the publishable key. No secret, service_role key, provider key or Auth redirect configuration is needed for password sign-in. Restart the server after changing environment variables. The supplied .gitignore excludes .env.local; .env.example contains placeholders only.

## Test your real account

1. With the earlier development server stopped, open **http://localhost:3000/access**.
2. Enter the email and password you created under **Supabase Authentication → Users**.
3. Select **Sign in to the care desk**.
4. The overview should open. The sidebar should show **VBC administrator**, **Administrator · Signed in**, and **Sign out**.
5. Refresh: you should remain signed in.
6. Open **/members** directly in a new tab: it should open for your signed-in account.
7. Sign out and visit **/members** again: you should return to sign-in.
8. Visit **/members** in a private/incognito window: it should also return to sign-in.

Overview counts still use fictional data. The Members directory uses saved database records, which can differ from overview counts. Follow MEMBER_SETUP.md to test saved creation/editing. The banners identify saved records and sample screens.

## If login fails

| Message | Check |
| --- | --- |
| Connection setup needed | Both variables are in .env.local beside package.json; restart npm run dev. |
| Check your email and password | Use the actual Auth account password. Confirm the Auth user is confirmed. |
| No active staff access | care_staff.user_id matches the Auth UID; role is administrator/editor/viewer; is_active is true. |
| Cannot verify staff access | Project is active; URL/key belong to the same project; core SQL setup succeeded; connectivity works. |
| Cannot reach sign-in | Check connectivity and the development terminal. |

There is no public signup flow. Recovery help directs staff to their administrator; automated recovery email will follow later. Never share passwords or secret keys in screenshots.

## Implementation

- Auth validates the cookie token with getUser. Cookie contents alone never grant access.
- The signed-in user's RLS-controlled client reads their own active care_staff entry.
- Direct page loads and the session API independently enforce active staff membership.
- Navigation checks the session while preserving the existing in-memory review workflow. Checks also run on tab focus, back/forward restoration, and once a minute while visible.
- Logout clears the local session.
- Cookies are HttpOnly and SameSite=Lax, with Secure in production. This phase uses same-origin server endpoints rather than a browser Supabase client; revisit that strategy deliberately if a browser Supabase client is introduced.
- Proxy refreshes cookies and carries refreshed cookies/cache headers to the response.
- Auth responses disable browser and CDN caching, including Netlify CDN caching.
- Login/logout reject other origins. Post-login destinations must be local, known care routes.
- Configuration and provider errors fail closed.

All three approved staff roles may review previews and read the saved directory. Editors and administrators may create/update real members; viewers cannot. Other editing controls remain simulations. Saved preferences, care notes and archive/restore also require editor/administrator access. Team administration, permanent deletion, guest review and content storage are later stages.

The review form and sample member preference pages are staff-only. The live Elementor form is unchanged; real public guest submissions and token-based preference links are later integrations.

## Verification

```sh
npm run typecheck
npm test
npm run test:auth
npm run test:auth:dev
```

test:auth builds Next.js with Webpack and uses a local mock Auth/data service. test:auth:dev runs the same checks through the Webpack development server, including proxy compilation. Run them sequentially. They do not contact your Supabase project or send messages. They check anonymous access, wrong passwords, nonstaff/inactive accounts, roles, unsafe redirects, cookie refresh, staff revocation, provider failure, logout and tampered tokens. Your actual account and hosted policies still require the manual test above.

References:
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/server-side/advanced-guide
- https://nextjs.org/docs/app/guides/authentication
- https://nextjs.org/docs/app/api-reference/turbopack#webpack-fallback

No deployment is included. Test locally first; private hosting and live WordPress changes remain separate steps.
