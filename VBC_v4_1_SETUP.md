# VBC Member Care v4.1

This release continues v4.0.1. It renames the staff-facing Follow-up workspace to **Follow Through**, adds Friend registration and CSV import, and connects Programmes to the existing church database.

## Install

If your database is already through migration 021, run these complete files in Supabase SQL Editor, in order:

1. `supabase/022_friend_direct_registration.sql`
2. `supabase/023_saved_programmes.sql`
3. `supabase/024_follow_through_registers.sql`

Alternatively, run the combined `docs/APPLY_v4_1.sql` once. It contains the same three complete migrations. These migrations are tested for reruns. If earlier migrations are missing, apply them in order first. Do not rerun historical 017 or 018 afterward because they replace functions with older behavior.

Copy the release into your existing Git checkout, keeping your environment variables. No new environment variables or provider accounts are required for registration or programme saving. Supabase Storage must be enabled for flyers. Migration 023 creates the `care-programme-flyers` bucket and its upload policy. This bucket holds public programme artwork, never member documents. Existing WhatsApp configuration remains separate.

```powershell
npm ci
npm run typecheck
npm run test:v41
npm run build

git status
git add .
git commit -m "Add Follow Through registers and saved programmes"
git push origin main
```

## What to open

- **Follow Through / Today:** who needs contact next.
- **People register:** a table with date on board, name, sex, phone, official joining, assigned Friend and next contact.
- **Visitors:** visitor care and contact status filters.
- **Contact queue:** scheduled contacts and callbacks.
- **Foundation classes:** cohort and seven-week attendance grid. Select a name to enrol or record a week. P means present, A means explicitly absent, and a dash means no record.
- **Continuing care:** the existing minimum six-month relationship after actual joining.
- **Reports & Friends analysis:** period results and the full selected report population grouped by current Friend. Excel now has seven sheets, including Friends analysis. Additional metrics are available through Show all report figures.

Internal routes such as `/followups`, role identifiers and stored history stay compatible. “Contact queue” and “Continuing care” distinguish the two different activities previously both described as follow-up.

## Friends can register people

Friends and Coordinators can use **Register a person** or **Import CSV** from Today, People register, Visitors or Membership Sunday.

New people registered by a Friend are assigned to that Friend. Friends can reuse records already assigned to them, after confirming identity. They do not gain permission to browse or take another Friend’s cases. A matching phone/email outside their scope requires Coordinator identity review. CSV only creates new people. It never overwrites or transfers an existing person.

Use the CSV template provided in the interface or `docs/Follow_Through_Registration_Template.csv`. Upload a comma-separated file with a header and up to 500 rows, 1 MB maximum. Names and a phone or email are required. Preview shows validation and duplicate conflicts before saving. Valid rows can be saved separately from invalid rows. Contact defaults remain ON unless the CSV explicitly says false/no. Known previous visit dates require a year and evidence. Registration itself confirms neither attendance nor official membership.

The import saves in small batches. Keep an interrupted preview open and retry there. Request IDs prevent the same accepted row from creating a second record. Stop after current batch pauses further rows. Successful rows stay saved. If correcting and re-uploading a file after partial success, include only unsaved rows. A full browser refresh loses the preview, but database uniqueness still prevents duplicate phone/email records.

## Programmes and flyers

Administrators, editors and explicitly authorized Coordinators can create or edit programmes. Other active staff have read access where the main dashboard permits it.

- **One-off programme:** actual programme date, time and venue.
- **Recurring weekly:** weekday, time and venue. No fixed date is required. The next occurrence is calculated in Africa/Lagos.
- **Flyer:** JPG, PNG or WebP, up to 4 MB. The form previews the image. Saved cards show the full flyer and provide View full flyer.

Programmes persist in the original `care_programmes` table and appear immediately after save and after refresh. Overview reads the same saved feed. Existing programme IDs and related invitations remain linked. Schedule changes preserve the other form fields. Save errors retain the entered details. Stale edits ask staff to refresh rather than overwriting another editor’s update.

The app checks image signatures and size, and only authorized staff can upload. Artwork URLs are public. Older replaced flyer objects are retained rather than deleting a file that may still be used in an invitation.

The 4 MB limit leaves room under Netlify’s effective binary request limit. Technical reference: https://docs.netlify.com/build/functions/configuration/ (checked 2 November 2026). Creating an invitation still opens the existing composer and does not automatically send emails or SMS. Official WhatsApp remains a separately configured, individual-send workflow.

## How the Excel reference was used

`SPRING GUESTS 2025 (1).xlsx` contains a guest register with Date on board, Name, Sex, Phone number, Target?, Joined church?, Assigned to? and remarks. Its familiar headings informed People register and Friends analysis. It contains no Foundation Class attendance sheet.

Historical workbook rows have **not** been imported. “Target?” has no stated definition and is not an eligibility rule. Unspecified years, multiple phone numbers and ambiguous Friend assignments have not been guessed. In the new register, Date on board is the central record’s registration date. Original visit and official membership dates remain separate. A missing joining confirmation is shown as Not confirmed rather than a fabricated No.

Foundation attendance uses the existing class records and church approval gates. Same-day first-time joining, CFC make-up/certificate policy and six-month contact frequency retain the existing rules and pending decisions.

## Validation

The release was checked with a real production Next.js server and mocked Supabase/Auth/Storage, fictional browser records, and a local PostgreSQL-compatible database. New checks cover Friend self-assignment and scope, CSV defaults/quoting/conflicts, partial saves, programme save/reload and safe retries, weekly/one-off schedules, flyer upload and storage permissions, stale programme edits, register scope and whole-report Friend totals beyond a 30-row page. Existing queue, export, WhatsApp and Home Cell flows were also exercised.

The older `npm test` offline-prototype suite still contains stale assertions for the pre-refresh Overview and celebration screens. It is not the production release check. Use the explicit checks above and `npm run test:home-cell:browser` for the current application.

No hosted SQL, deployment or real message send was performed. After installation, verify one real staff account with the intended role, a programme save/refresh, an actual flyer upload, and the register/class views before general staff use.

The updated illustrated manual is `docs/VBC_Follow_Through_Manual_v4_1.pptx`.
