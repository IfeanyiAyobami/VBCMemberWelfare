# Connect the working First-Timer Gateway v1.1.3

This update continues the existing Member Care app. The Elementor form, Gateway v1.1.3, Google Sheets delivery, Gmail notification, staff login, member profiles, permissions, notes and archive controls stay in place. No hosted deployment or WordPress change has been made by this package.

The implementation was checked against the supplied handoff, the actual v1.1.3 PHP source, and the latest saved v0.6.0 app/schema. Your hosted Supabase structure and latest GitHub checkout have not been inspected directly. Start with the read-only check below; if your local code has later changes, use `docs/GATEWAY_CHANGES.md` to review the small integration diff.

## 1. Open the update without overwriting your working folder

Extract `VBCMemberWelfare_Gateway_Integration_v0.6.1.zip` into its uniquely named folder. Keep the previous working folder. Copy your existing `.env.local` into the new folder; the archive has no credentials. Open the new folder in VS Code. In its terminal:

```powershell
npm ci
```

Node 22.14 or newer is required. Development/build still use Webpack, preserving the Windows Turbopack workaround. Existing frontend components have not been rebuilt.

## 2. Check the correct Supabase database

Open **VBCMemberWelfare**, not the separate Sermons project. In **SQL Editor → New query**, paste all of `supabase/GATEWAY_CHECK.sql`, then click **Run**. It is read-only and prints no visitor answers.

Expected: `care_guest_submissions`, `care_members`, `care_staff`, `care_preferences`; RLS enabled on each; a unique index on `submission_key`. `guest_record_ready` and `guest_review_ready` indicate whether SQL 005 is installed. `gateway_ready` will be false before this update.

If the tables are missing or materially different, stop this step and share the structure-only result. Do not rerun the original core schema over your working database.

## 3. Apply only the additive migrations

If both guest functions are already present, go straight to SQL 006. Otherwise run the complete `supabase/005_guest_review.sql` first. This installs the existing guest queue workflow from v0.6.0, reusing the core guest table. It requires the already-completed SQL 004 care controls.

Then run the complete **`supabase/006_wordpress_gateway.sql`** in a new query. Run `GATEWAY_CHECK.sql` again. Expected:

- `guest_record_ready`, `guest_review_ready`, `gateway_ready`: true.
- Guest columns include `gateway_payload_hash` and `gateway_submitted_at`.
- Gateway RPC: service can execute **true**, staff can execute **false**, anonymous can execute **false**.
- RLS and `UNIQUE(submission_key)` remain enabled.

006 adds two metadata columns and a service-only function; no new guest/admin tables. Migrations are safe to rerun and do not delete or alter saved member data. A missing 005 dependency or existing duplicate external IDs fails instead of deleting records.

## 4. Add server-only credentials locally

Keep the two working `NEXT_PUBLIC_SUPABASE_*` values. In Supabase, obtain the project's backend **secret key** (or existing legacy `service_role` key). Add it as `SUPABASE_SECRET_KEY`, never a `NEXT_PUBLIC_*` value. Staff requests continue using the signed-in publishable client.

Generate a separate 64-character random token on your computer:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Store the result privately. In `.env.local` add:

```dotenv
VBC_MEMBER_CARE_GATEWAY_ENABLED=true
VBC_MEMBER_CARE_GATEWAY_TOKEN=PASTE_YOUR_NEW_RANDOM_TOKEN_HERE
SUPABASE_SECRET_KEY=PASTE_YOUR_BACKEND_SUPABASE_KEY_HERE
VBC_GUEST_BRIDGE_ENABLED=false
```

Do not paste either secret into chat, Elementor, screenshots or Git. The Supabase key and Gateway token are different secrets. Ignore the old HMAC bridge secret. The working Gateway uses this new Bearer route.

## 5. Check the existing app locally

```powershell
npm run test:gateway
npm run build
npm run dev
```

Sign in as usual; confirm Members, profile save, notes and permissions. Open **Guest submissions** (`/guests`). Keep care sending disabled; this integration does not send any messages.

The API is **POST `/api/integrations/wordpress/first-timers`**. Opening it in a browser is not a submission and normally returns 405. WordPress cannot reach your computer's localhost URL.

## 6. Prepare the Member Care Netlify deployment

Use the approved **Member Care** site, not your Sermons site. If Member Care has no deployed site yet, approve/prepare its hosting before changing WordPress settings. This package does not publish a site or modify your live church website.

Review and commit these files to your existing repository without `.env.local`. Preserve any local changes made after v0.6.0. The included `netlify.toml` uses `npm run build`, `.next`, Node 22 and the automatic Next.js adapter; use a Next.js build, not the offline `preview.html` file.

In Netlify's environment variables, set the existing public Supabase URL/publishable key and the same three new server values from step 4. Make them available to the Next.js functions/runtime; redeploy after setting them. Keep `VBC_GUEST_BRIDGE_ENABLED=false`.

Staff screens require active Supabase staff authentication. If your private deployment also has a Netlify-wide password/login wall, it must allow authenticated server access to this exact machine endpoint. A login page, password wall or redirect cannot satisfy the Gateway. Keep the dashboard protected; do not remove staff guards to solve this.

Use the final direct HTTPS hostname and no trailing slash. Gateway follows **zero redirects**. A domain alias that redirects to another hostname will fail.

## 7. Test the deployed receiver before changing WordPress

From the new project terminal, run the supplied operator check with the actual Member Care hostname:

```powershell
node tools/test-gateway.mjs https://YOUR-MEMBER-CARE-HOST/api/integrations/wordpress/first-timers
```

This intentionally creates **one fictional pending guest**. It reads the token from `.env.local`; no token or visitor answers are printed. It verifies wrong-token rejection, a new receipt, a duplicate receipt, a conflict and twelve simultaneous retries. The printed submission UUID is the reference for checking one row in Supabase. Then reject the fictional guest with a reason in the existing queue. Each new run generates a new test UUID.

## 8. Configure the existing WordPress Gateway

After the deployed receiver check passes:

1. Open **WordPress → First-Time Visitors → Integration Settings**.
2. Set **Member Care API URL** to `https://YOUR-MEMBER-CARE-HOST/api/integrations/wordpress/first-timers`.
3. Set **Member Care bearer token** to the exact `VBC_MEMBER_CARE_GATEWAY_TOKEN` value.
4. Leave the Apps Script `/exec` URL, Google secret and notification email unchanged. Blank secret inputs retain saved secrets.
5. Click **Save Settings**.

Do not replace Elementor, install the legacy `vbc-care-bridge.zip`, point WordPress at `/api/guests`, or change your working Gateway v1.1.3. `/api/guests` is a staff-only API with a different contract.

## 9. Verify one real end-to-end fictional submission

Submit one fictional visitor through the existing Elementor form. Use your own controlled test contact if checking WordPress notification delivery; do not use another person's details. This form still acknowledges successful WordPress storage, with Member Care delivery scheduled afterward.

In WordPress, record its **Submission ID**. Check that Member Care becomes **Synced** after WP-Cron runs. Sheets and email retain their independent delivery statuses.

In Member Care → Guest submissions, open the matching pending card. Check the answers and follow-up consent. Sending choices remain off, even if an email/WhatsApp number was submitted. In Supabase SQL Editor run this with the original WordPress UUID:

```sql
select id, submission_key, source, review_status, member_id,
       gateway_submitted_at, gateway_payload_hash is not null as has_gateway_receipt,
       contact_consent, email_opt_in, sms_opt_in,
       celebrations_opt_in, programmes_opt_in, newsletters_opt_in
from public.care_guest_submissions
where submission_key = 'REPLACE_WITH_WORDPRESS_SUBMISSION_UUID'::uuid;
```

Expected: exactly one row, source `wordpress`, pending status, no member yet, `has_gateway_receipt=true`, follow-up true and five other flags false. WordPress's site-local timestamp is retained without assuming UTC; `created_at` is the Member Care receipt time. Check **WordPress → Settings → General** if you need to interpret its timezone.

## 10. Backfill the two saved visitors safely

v1.1.3 has **no Member Care manual retry button** and saving settings does not requeue old “Needs configuration” records. The included optional **`wordpress/vbc-member-care-requeue.zip`** adds a small admin-only button to the existing visitor edit screen. It requires an administrator, post permission and a WordPress nonce. It schedules the installed Gateway's Member Care hook using the original UUID, resets only Member Care attempts/status, and never calls Sheets/email hooks or replaces the Gateway.

If PHP CLI is available on the host, first run `php -l vbc-member-care-requeue.php` on the extracted helper; this workspace has no PHP runtime. After the new endpoint is verified, upload this helper through **Plugins → Add New → Upload Plugin**, activate it, then:

1. Open the first saved visitor under **First-Time Visitors**. Do not edit its saved answers.
2. In **Member Care delivery**, click **Queue Member Care delivery**.
3. Refresh after WP-Cron runs; confirm **Synced** and one Supabase row for its original UUID.
4. Repeat for the second visitor, one at a time.
5. For the fictional test visitor, click the same button again after it is synced. Confirm it becomes synced again and the same Supabase UUID still has one row. This exercises the duplicate acknowledgement without another email or Sheets row.

You may leave the helper installed for controlled manual retries. Alternatively an administrator with WP-CLI can invoke only `VBC_First_Timer_Integration::member_sync(POST_ID)` for an unsynced record. No direct database edits or re-submission of Elementor are needed for backfill.

## Retry timing, errors and recovery

Gateway `member_sync` initially schedules at +10 seconds. On failure it increments the **member-specific** counter. After failures 1–7 it schedules +120, +240, +480, +960, +1920, +3840 and +7680 seconds; failure 8 becomes **Needs manual review**. The code's delay cap is 21,600 seconds, but these seven scheduled retries do not reach it. WP-Cron is traffic-dependent, so these are scheduled delays, not a guaranteed delivery deadline. A missing URL/token becomes Needs configuration and schedules no retry.

| Result | Meaning and next action |
| --- | --- |
| 201 JSON `success:true, duplicate:false, id` | New pending guest stored; Gateway marks Synced. |
| 200 JSON `success:true, duplicate:true, id` | Same immutable payload already stored; safe retry, no second guest/task. |
| 401 | Token missing/mismatched. Fix matching server and WordPress values; requeue. |
| 400, with `field` | Wrong/missing contract key, aliases, date, consent, option or length. The original WordPress record remains saved. Investigate before retrying. |
| 409 `submission_conflict` | Original UUID was reused with changed content or belongs to a legacy/manual record. No overwrite. Compare source/saved records with authorised staff; do not change UUIDs just to force ingestion. |
| 503 `not_configured` | Receiver disabled or a server environment value is missing/invalid. Set runtime environment, redeploy, requeue. |
| 503 `storage_unavailable` | Check SQL 005/006, backend key/project and Supabase availability. Gateway retries; a committed save with lost response will later acknowledge a duplicate. |
| 3xx, HTML, Netlify sign-in wall | Wrong hostname, trailing slash redirect or hosting protection blocked the machine endpoint. Gateway cannot follow redirects. |
| Still Pending | Check WP-Cron/site traffic/server cron. Refresh does not prove a scheduled job has already run. |

The current Gateway does not retain detailed Member Care response diagnostics. Receiver logs show only submission UUID plus conflict/storage outcome. Never dump raw request bodies, RPC errors or secrets for troubleshooting. Existing staff access, guest retention and audit policies apply; this change adds no automatic retention deletion job or additional copy of the raw payload.

Disabling `VBC_MEMBER_CARE_GATEWAY_ENABLED` stops new Member Care ingestion with 503, while WordPress storage, Sheets and email continue independently. Re-enable and requeue preserved IDs after recovery. No destructive rollback is necessary.

## Field mapping and completed scope

All 24 keys are required as strings because the installed PHP always emits them. Optional answers may be `""`. Alias values must agree. Field limits/options follow the existing Member Care schema; Gateway's broad 1,500-character WordPress allowance does not override database constraints. Examples: surname 100, other names 120, occupation 150, address 600, discovery details 1,000, invited by 400; unsupported option values fail explicitly rather than being silently discarded.

| Gateway | Existing storage / handling |
| --- | --- |
| `submission_id` + `Idempotency-Key` | Globally unique `care_guest_submissions.submission_key`; header cross-check. |
| `date_submitted` | New `gateway_submitted_at`, original site-local timestamp. |
| `surname`, `other_names`, `visit_date`, `occupation`, `gender`, `age_range`, `marital_status` | Same existing guest columns. |
| `full_name` | Checked against names; names remain separate. |
| `phone`, `whatsapp`, `email` | Existing normalized contacts; blank optional contacts become NULL. |
| `address`, `residential_address` | Checked equal → existing residential address column. |
| `salvation_response`, `born_again` | Checked equal → existing born_again. |
| `home_visitation`, `home_visit` | Checked equal → existing home_visit. |
| `heard_about`, `discovery_source`, `discovery_details` | Computed alias checked; source/details stored separately. |
| `invited_by` | Same existing guest column. |
| `contact_consent="Yes"` | Follow-up true, server-stamped consent evidence/policy; other five flags false. |
| Complete canonical payload | SHA-256 fingerprint on the same guest row; includes timestamp, original text and aliases. |

The guarded SQL transaction uses the established submission-key lock and unique index. It saves one pending guest and its receipt atomically. Staff then use the existing create/link/reject workflow; no automatic member merge, follow-up task or provider job is introduced. Member profiles, permissions, notes and archive features are unchanged. The old HMAC route remains available only when explicitly enabled for its separate legacy contract; it is disabled for this setup.

Tests and their local/hosted limits are recorded in `docs/VALIDATION.md`. The optional PHP helper still requires activation testing on your WordPress host; a successful local API fixture cannot establish a live WordPress/Supabase connection.
