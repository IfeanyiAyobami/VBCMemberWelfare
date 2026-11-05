# VBC v4.8.1 — Login and account switching

A browser shares one active Supabase session across the dashboards. Signing in as a Friend replaces the previous staff session. Friend accounts remain restricted to their own screens.

When a Follow Through account opens the main office or `/access`, it now sees a clear Switch account screen instead of repeatedly redirecting to Follow Through. Sign out there, then sign in at `/access` with an active Church Administrator account to open `/overview`. Separate browser profiles allow concurrent accounts.

Staff, Friend and Home Cell login pages now offer **Keep me logged in on this device**. Checked stores authentication cookies for up to 30 days; unchecked uses browser session cookies. Browsers may restore session cookies when restoring a session. Token refresh preserves the selection; access can still expire or be revoked. No password or PIN is stored in browser storage.

The Friend Account screen includes **Log out** and **Use a different account**. Unsent updates prompt before logout. Local Friend data is cleared only after successful sign-out; a failed sign-out displays an error and retains it. Existing staff and Home Cell sign-out actions use the same logout endpoint, which clears the persistence preference after success.

No new SQL or environment variables are required. Copy this release into the working project, install dependencies and deploy normally. Existing accounts, role restrictions and PIN credentials remain unchanged.

Validation: production build; Friend dashboard, registration, server access and celebrations tests; Friend PIN route tests; login cookie persistence/deletion tests. Hosted credentials and live Netlify sessions were not exercised.
