# Saved member directory — v0.5.0

For the current v0.6.0 package and Elementor connection, start with **GUEST_SETUP.md**. This document remains the reference for its earlier stage.

Staff login is working. This update connects **Members** and UUID-based member profiles to your existing `care_members` and `care_preferences` tables. It adds saved list/search/pagination, creation and profile editing. First follow **CARE_SETUP.md**, including the small **supabase/004_care_controls.sql** update. No extra secret key or provider account is required.

## Install the update

1. Stop your current server with **Ctrl+C**.
2. Extract **VBCMemberWelfare_Care_Controls_v0.5.0.zip** beside your current project. Open the extracted folder of the same name.
3. **Copy your working `.env.local` into this new folder, beside `package.json`.** Keep the exact variable names already used for login. Confirm the filename is not `.env.local.txt`.
4. Run these commands in the new folder:

```powershell
npm ci
npm run dev
```

Development and builds use Webpack. Use Node.js 22.14 or newer. The archive contains no account credentials, `.git`, generated cache or installed dependencies. Your earlier project remains intact.

## First persistence test

1. Open **http://localhost:3000/access** and sign in with your approved staff account.
2. Select **Members**. The directory reads your Supabase project; an empty directory is expected if you have not added records. Fictional preview members are not inserted automatically.
3. Select **Add member** and use a fictional review record:

| Field | Test value |
| --- | --- |
| Other names | Care Demo |
| Surname | Test |
| Email | care-demo@example.invalid |
| Mobile number | Leave blank |
| Membership | Visitor |
| First visit / joined | Today's date |
| Occupation | Test record |
| Birthday | 21 May |
| Wedding anniversary | Leave blank |

4. Select **Save member**. Wait for the saved confirmation, then select **View saved profile**.
5. Refresh the browser. The same name, contact and birthday should remain.
6. Select **Edit profile**, change Occupation to **Updated test record**, save and refresh again. The edit should remain.
7. Copy the profile URL into another signed-in tab. Its UUID identifies the same saved record.
8. In Supabase **Table Editor → care_members**, confirm the row. In **care_preferences**, its matching `member_id` should have every permission false.

This confirms the actual hosted database connection. The local automated suite uses fixtures and does not establish hosted persistence by itself.

## Review errors and permissions

- Empty names, invalid contacts, missing contact methods, impossible dates and future visit dates show field errors. Birthdays and anniversaries accept February 29 and keep no year.
- Nigerian numbers such as `0803…` are normalized to `+234…`; other countries need an international code. Blank optional values are stored as `null`.
- A duplicate email or phone produces a conflict, including contacts on archived records. The app never automatically merges people.
- The same create form keeps a stable request ID for retries. A confirmed retry returns the existing record rather than inserting another person.
- Two editors opening the same version cannot silently overwrite each other. After one saves, the other's stale save is rejected; their draft remains in the open form for copying before they close it and reload the latest record.
- Active viewers can list and open members. Editors and administrators can create/edit. Server endpoints re-check the current role for each request and use the signed-in user's client, preserving database RLS.
- Unknown UUIDs show a missing-record error; they never display the first member as a substitute.

## Scope of this stage

**Saved:** staff login, the Members directory and UUID profiles, identity/contact details, membership status, occupation, address, first visit date and optional birthday/anniversary month/day. Communication permissions can be edited separately with evidence/history; care notes and archive/restore are also saved.

**Still previews:** overview statistics, celebration calendar, programmes, campaigns, newsletters, templates, automations, delivery, settings editors, CSV import, the visitor form, sample `m1` profiles and sample preference links. These screens keep their fictional review state. They do not use the new directory as a messaging audience yet. The banner identifies previews. Creating a visitor in the preview does not create a real Supabase member.

Profile saves do not change consent. New preferences start false through the existing database trigger. Follow CARE_SETUP.md to review permissions, care notes and archive/restore. Guest intake/review and content screens are later stages. Permanent deletion is not offered. Keep the fictional test record for review.

No email or SMS is sent. No sending setting is changed. No deployment or live church website change is included.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Connection setup needed | Copy the working `.env.local` to this extracted folder; restart the server. |
| Cannot load members | Supabase project is active; core schema is installed; staff account is active. Keep RLS enabled. |
| Duplicate contact | Search existing records; archived contacts also reserve their email/phone. |
| Member changed after opening | Copy any unsaved changes before closing the form, then reload the latest profile and reapply them. |
| No Add/Edit button | The current role is viewer. An editor/administrator must make changes. |
| Overview counts differ | Overview still uses preview data; Members reads saved records. |

## Developer verification

```sh
npm test
npm run build
node tests/auth-integration.mjs
npm run test:auth:dev
```

Run server checks sequentially. The fixture suite checks Auth and member HTTP endpoints without contacting a hosted Supabase project. The optional browser suite requires Playwright and Chromium:

```sh
node tests/auth-integration.mjs --browser
```

Install browser tooling in your development environment if you intend to run that optional check. Environment variables `CARE_PLAYWRIGHT_MODULE`, `CARE_CHROMIUM_EXECUTABLE` and `CARE_BROWSER_SCREENSHOTS` can point to existing tooling and an output directory. They are test-only and are not required to run the app.
