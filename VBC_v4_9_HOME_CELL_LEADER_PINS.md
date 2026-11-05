# VBC v4.9 — Home Cell leader PINs

## Setup
1. Apply `supabase/030_home_cell_leader_pins.sql` in the same Supabase project, after migrations 009–029. It adds a private PIN table, service-only functions and PIN-generation audit records. It does not delete member data or change Friend credentials.
2. Generate a server secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Add the result as `HOME_CELL_PIN_SECRET` in `.env.local` and Netlify environment variables. Keep it separate from `FRIEND_PIN_SECRET`. Restart locally / redeploy on Netlify. Never prefix it with `NEXT_PUBLIC_`. Changing this secret invalidates existing leader PINs; regenerate them if it changes.
3. Open Home Cell → Leadership accounts. Add a cell leader or select an existing one, open **Manage → Security**, then **Generate / reset 4-digit PIN**. Copy or download the login details and share privately. The coordinator must generate an initial PIN for every existing leader; old passwords no longer sign in cell-leader-only accounts through this login.
4. Leaders sign in at `/home-cell/login` using their registered email or phone and the generated four-digit PIN. Leading zeroes are valid. Keep me logged in and logout are retained.

## Behavior
Only the server generates PINs. No self-selected PIN, self-service PIN reset or emailed OTP is involved. A lost PIN is replaced by the coordinator; only the new PIN works. PINs are shown at generation only, hashed with scrypt and a separate HMAC secret, and not included in audit details.

Coordinators can generate/reset PINs for active cell leaders within all of that leader’s assigned areas. Church administrators may manage them too. Cell leaders cannot issue/reset their own PINs. Suspended leaders and accounts with administrator, coordinator, area-leader or other broader roles cannot use this four-digit PIN flow. Those roles keep password sign-in via **Administrator / coordinator sign-in** on the same page. Keep broader roles on separate accounts if the person also needs a simple cell-leader login.

Friend PINs, Friend accounts and their access restrictions are unchanged. New cell-leader accounts are added first, then the coordinator explicitly generates the PIN in Security. If this step fails, retry PIN generation after checking migration/secret/authority; do not share any old temporary password.

Login protections: same-origin requests, IP throttling, database-locked attempt counters, five attempts per 15 minutes and a reset-required lock after 20 unsuccessful attempts. PIN version is checked before a server-only Supabase session-token exchange. Token exchange sends no email/SMS. No PIN plaintext is saved by the app.

## Validation
`npm run test:home-cell-pins`: real PostgreSQL-compatible migration execution, coordinator authority, email/phone lookup, rotated credential invalidation, attempt limits, suspension, higher-role exclusion, RLS/service-only execution, real PIN hashing and login-route failure cases. Friend dashboard regression tests and production build also pass. Hosted Netlify/Supabase credentials were not exercised; apply the setup above before rollout.
