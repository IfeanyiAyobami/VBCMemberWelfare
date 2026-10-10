# Care controls — v0.5.0

For the current v0.6.0 package and Elementor connection, start with **GUEST_SETUP.md**. This document remains the reference for its earlier stage.

Member saving and refreshing now work in your project. This update adds saved communication permissions, a permission history with evidence, staff care notes, and reversible member archiving/restoring. It uses the same Supabase URL, publishable key and staff login.

## 1. Install the update in a separate folder

1. Stop the previous development server with **Ctrl+C**.
2. Extract **VBCMemberWelfare_Care_Controls_v0.5.0.zip** beside your previous project. Keep the previous folder as a backup.
3. Open the extracted **VBCMemberWelfare_Care_Controls_v0.5.0** folder in VS Code.
4. Copy the working **.env.local** from your previous folder into this folder, beside **package.json**. Do not rename it or add `.txt`.
5. Open a terminal in the new folder and run:

```powershell
npm ci
```

Do not start the app until the next step is complete. No service-role key, Brevo account or SMS credential is needed for this update.

## 2. Add the two database functions

1. Open Supabase and select **VBCMemberWelfare**, the project already used by your working member directory.
2. Open **SQL Editor → New query**.
3. In VS Code, open **supabase/004_care_controls.sql** from the new package.
4. Copy its entire contents into the Supabase SQL Editor and click **Run**.
5. Wait for the success result. This script is additive and safe to re-run: it creates or updates two guarded functions. It does not change members, consent choices, settings or enabled automations.

Use the **Member Welfare** project, not **Vbcsermons**. The files under `tests/fixtures/` are only for isolated automated tests; do not run them in your existing project. Do not re-run the original schema/bootstrap SQL.

The two functions save permissions and notes. They verify the current active staff role, retain the existing database policies, and refuse writes to archived members. Permission changes use the existing history trigger. Archiving uses the existing `archived_at` field and version check, so no extra table is needed.

## 3. Start and review

In the new folder's terminal:

```powershell
npm run dev
```

Open **http://localhost:3000**, sign in with your existing account, and open **Members**. Your previously saved records should be present because both versions use the same Supabase project.

## 4. Test permissions with your fictional member

1. Open the fictional member's UUID profile, then click **Edit permissions**.
2. Turn on **Visit and follow-up contact**, **Email**, and **Monthly newsletter**. Leave SMS and the other topics off.
3. In **Evidence of permission**, enter: `Fictional review only: contact, email and newsletter permissions selected for this test on [today's date].`
4. Click **Save permissions**, then refresh the browser.
5. Confirm the same three choices show **Recorded**, and the others show **Off**.
6. Click **View permission history**. Each changed choice should show its previous/new value, evidence, date, staff name and policy version.
7. Reopen the form, turn **Email** off, enter a fictional withdrawal note, save and refresh. Newsletter permission should remain recorded independently; email should show off.

These fictional choices are only for testing. For actual people, record their explicit choices and how/when they gave or withdrew permission. A request for visit follow-up does not grant email, SMS, birthday, invitation or newsletter permission. Saving a profile does not change consent.

Contact permission, the chosen channel and the chosen topic must all be allowed for future birthday, anniversary, programme or newsletter sending. Provider sending is still disabled in this phase.

## 5. Test care notes

1. In **Care notes**, enter: `Fictional follow-up: welcomed at Sunday service. Team to call next week.`
2. Click **Save care note**, then refresh.
3. Confirm the note, staff name and Lagos date/time remain visible.

Notes are readable by all active staff roles, including viewers. Keep notes relevant to care follow-up. This interface keeps saved notes in the record; add a new note to correct an earlier one. Notes are not emailed or texted. The stable request ID prevents a retry from duplicating the same note.

## 6. Test archive and restore

1. At the bottom of the fictional profile, click **Archive member**.
2. Review the dialog and click **Confirm archive**.
3. Refresh. The profile should say **Archived · Read only**, and profile, permission and note editing controls should be absent.
4. Go to **Members**, change **Active directory** to **Archived members**, and open the same record.
5. Click **Restore member → Confirm restore**, then refresh.
6. Confirm the record is active again and its details, notes and permissions remain saved.

Archiving excludes the person from the active directory and the existing scheduled-send eligibility check. It retains their details and keeps their email/phone reserved for duplicate protection. Restoring keeps their recorded choices; review those choices before any future sending. This package does not offer permanent deletion or erasure.

## Roles and competing edits

| Role | Member details | Notes and permission history | Save notes/preferences; archive/restore |
| --- | --- | --- | --- |
| Administrator | Read and edit | Read | Allowed |
| Editor | Read and edit | Read | Allowed |
| Viewer | Read | Read | Denied in both the interface and server endpoints |

If a profile or permission form was opened before another staff member saved a change, the older save is rejected. Copy any unsaved text, close the form, reload the profile and reapply your change to the current record. If a network error occurs during permission saving, reload to check the recorded choices/history before trying again. A successful write followed by a failed refresh is still a saved write.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Connection setup needed | `.env.local` is beside the new `package.json`; restart the server after copying it. |
| Message asks for `004_care_controls.sql` | Run the included script in **VBCMemberWelfare**, wait briefly for API schema refresh, then retry. |
| Cannot see editing controls | Current role is editor/administrator; profile is active. Archived records can only be restored. |
| Old form conflict | Copy unsaved changes, close, reload and reapply. The conflict protects a newer edit. |
| Member seems missing | Reset search/status filters and check the **Archived members** view. Overview still shows fictional preview counts. |
| A note retry conflicts | That request ID was already used for different text. Reload, inspect the saved note, then add a correction as a new note. |

## What follows this phase

Connect validated guest intake and duplicate review, then programme/template/campaign/newsletter storage. After those are reviewed, connect provider workers, scheduling, delivery callbacks and quota controls. Live guest intake, public deployment and message sending require a separate review and approval. Other modules and the offline `preview.html` still use fictional review data.

## Developer verification

```powershell
npm test
npm run test:auth
npm run test:auth:dev
```

Run build/development checks sequentially. They use a local fixture service, never your hosted Supabase project. The optional database test uses an in-memory PostgreSQL-compatible database. Install its test dependency without changing the package manifest or lock:

```powershell
npm install --no-save --package-lock=false @electric-sql/pglite@0.5.8
node tests/care-database.mjs
```

For optional desktop/mobile browser checks:

```powershell
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run build
node tests/auth-integration.mjs --browser
```

The optional test dependencies are not required to run the dashboard.
