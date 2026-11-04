# v4.5 — Friend PIN accounts, Coordinator scope and shared guest details

Built on the uploaded v4.4 code plus the restored Overview and dark/light theme fix. Existing visitor history, programmes, Home Cell code, reporting and historical staging remain included.

## Install

1. Back up your database. Apply migrations **027_friend_pin_accounts.sql**, then **028_follow_through_scope_and_dates.sql**, after 001–026. Alternatively run `docs/APPLY_v4_5.sql` (same two migrations). Do not rerun older function definitions afterward.
2. Keep your existing Supabase URL, publishable key and server-only service-role key. Add a new server-only environment variable: **FRIEND_PIN_SECRET**. Generate its value once with:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Put that output in `.env.local` and Netlify environment variables for this app. Do not put it in a `NEXT_PUBLIC_` variable or commit it. Keep the same value across instances and deployments. Changing it requires PIN resets.
3. Copy the updated application into your Git checkout, keeping `.git` and your environment files. Run `npm ci`, `npm run test:v45` and `npm run build`, then deploy. Migration 028 is required before running this code because staff access now checks the module scope.

## Friend account creation on the dashboard

Sign in as Administrator or Follow Through Coordinator. In Follow Through, open **Friend accounts & PINs** in the sidebar.

- Enter the name and an email, phone, or both. Nigerian mobile numbers are normalized.
- Select **Create Friend and generate PIN**. A secure random, exactly four-digit PIN is shown, including leading zeros when generated.
- Save/share the name, identifiers, PIN and `/friend-login` link privately; confirm that you have saved the details. The raw PIN is not retained in the account table and cannot be read back.
- Friends sign in at **/friend-login**, using email OR phone and their four-digit PIN. The main staff access page also links there. Both identifiers reach the same account, care assignment and attempt counter.
- Reset PIN on the same screen if it is forgotten or was not saved. The old PIN immediately stops working. A reset does not promise to log out sessions that are already signed in.

No SMS provider, OTP or email delivery is required. Gmail accounts use the same PIN flow. No message is automatically sent. Existing Friend-only staff logins may be reused without changing their ordinary Supabase password; protected staff accounts cannot be converted into PIN accounts here. Coordinator, administrator, Foundation Coordinator and active Home Cell leadership accounts are excluded from Friend PIN provisioning.

Account setup uses a random inaccessible Auth password and a separately verified, salted and server-peppered PIN hash. After PIN verification the server consumes an internal one-time Auth token to establish the normal HTTP-only staff session. It does not return that token to client JavaScript or send an email. The service-role key stays on the server.

## PIN attempt protection

Five reserved attempts per account in a 15-minute window, shared across email/phone, plus the existing database-backed IP limit. Twenty failed attempts without a successful sign-in lock the PIN until a manager resets it. Disabled accounts and accounts elevated beyond Friend-only access cannot use the PIN login. Provider/protection errors fail closed. PIN credentials and authentication responses are private/no-store. PINs are never placed in URLs, logs, local storage or source files.

## Coordinator access

A non-administrator account with the Coordinator capability lands in **Follow Through** after normal staff password sign-in. Its church-office access is denied by the server and the database's shared role checks, including if it previously had an editor/viewer role. The main dashboard links and Home Cell administration shortcut are hidden. Existing Coordinator capability does not grant programme editing. Home Cell server access also rejects module-only Coordinators.

Coordinators retain the journey desk, assignments, attendance, membership confirmation, class tracking, continuing care, reports, historical guest review and scoped Friend-account/PIN management. They cannot grant global staff roles or create Coordinator/administrator accounts using the Friend form. Administrators keep their full existing access. Actual staff-role rows are preserved; the app presents module-only Coordinators as restricted staff, and the database independently enforces that boundary.

Coordinators can sign in at **/coordinator-login**, using their existing staff email and password. It leads to Follow Through. Use an existing staff password for a Coordinator. Four-digit PIN access is for Friend-only accounts. Do not turn a Friend PIN account into a Coordinator and expect its PIN to remain usable.

## One central person record

Direct registrations, CSV additions and historical guest imports already insert into **care_members** with status **visitor**. This update preserves that design: no parallel guest/member table or duplicate pending submission is created.

Church-office staff find these people in **Members → Visitors / all statuses**. **Guest cards** remains the inbox for form submissions awaiting review; directly registered people do not need another submission card. Official joining changes the same person's status through the existing membership process. Registration alone does not confirm official membership.

- New registration now accepts optional birthday month/day and wedding anniversary month/day.
- CSV accepts optional `birthday_month,birthday_day,anniversary_month,anniversary_day`. The downloadable template includes those headers.
- Open a person in Follow Through → **Contact** to record or correct those dates later. Only the assigned Friend or Coordinator can use this form. Blank pairs clear unknown dates; invalid dates are rejected. No birth year is required.
- These are the same central date fields read by the main Overview/calendar/celebrations. Saved changes appear on the next refresh.
- Contact, celebration and programme communication preferences stay intact. No-further-contact/explicit opt-outs are not reset when dates change.
- Historical care remains paused until reviewed. Care status and messaging preferences are separate; no date or communication history is invented.

Campaign audience selection now reads the saved central people feed instead of fictional member records. Email/SMS programme audiences require contact permission, channel permission and programme opt-in. Newsletter preview audiences require contact permission, email opt-in and newsletter opt-in. The existing campaign scheduling/send screen remains a **preview/simulation**. This release does not activate bulk email/SMS sending or add provider credentials. Existing staff-assisted greeting/WhatsApp workflows remain separate.

## Checks and rollout

Production build, TypeScript, complete-chain database checks and route tests passed. Coverage includes four-digit PIN hashing, invalid PINs, origin guards, canonical email/phone limits, account lock/reset, elevated-role denial, permission checks, session-token handoff, provider failure, restricted Coordinator RLS, central Visitor/date updates, date validation and safe date retries. No live Supabase changes or real messages were made. A full browser visual run was not available in this environment.

After deployment, verify with a fictional Friend account and a non-administrator Coordinator: account creation, email and phone PIN login, PIN reset, denied main/Home Cell access, registration, and a celebration-date update visible to church-office staff. Remove or deactivate the fictional test staff account afterward.
