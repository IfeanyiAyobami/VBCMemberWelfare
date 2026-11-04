# v4.2 — Import your historical Spring guests

This release builds on the v4.1.1 original programme cards. No card redesign or change to existing accounts is included.

## Install and import

1. Copy `vbc-member-care` into your existing Git checkout, keeping `.git` and your environment files.
2. In Supabase SQL Editor, run `supabase/025_historical_guests.sql` after migrations 001–024.
3. Run the complete `PRIVATE_IMPORT/LOAD_SPRING_GUESTS_2025_PRIVATE.sql` from the outer release folder in the same church database. This is the actual personal data from your workbook. It loads a protected staging table; it does not create public files or send messages.
4. Deploy the application. Sign in as a Follow Through Coordinator (an administrator already has Coordinator capability).
5. Open Follow Through → Today or People register → **Historical guests**, or visit `/historical-guests`.
6. Review the original details. Click **Import remaining guests** to add all nonconflicting rows automatically. Individual import and Stop after current row are also available. Refresh or retry safely: the same source row cannot create a second person.
7. Find imported people under **People register**. Historical care starts paused; confirm details, correct name parts if needed, assign the actual Friend account and activate care when appropriate. A Friend only sees people after assignment.

## Your workbook

All 135 rows are prepared from `SPRING GUESTS 2025 (1).xlsx`, rows 2–136. All names and normalized Male/Female values are retained. 102 rows have a reliably normalized phone number; the other 33 retain the original phone entry in protected source evidence for review, without inventing or choosing a number. Name display order is preserved; the first word is placed in other names and the remaining words in surname provisionally. Correct those editable name parts if the source order differs.

Original Date on board, name spelling, phone entry, Target?, Joined church?, assigned Friend text and remarks are preserved per row and in journey history. Source dates omit an explicit year, so no visit date is inferred, even from the workbook title. Current record creation dates show when the import occurred, not a historical visit. Target? remains uninterpreted. Friend first names are not guessed into login accounts.

26 rows say Joined church: Yes. This evidence remains visible in the historical review and journey history; it does not fabricate an official joining date or bypass membership confirmation. No Foundation Class attendance is created. No outreach is automatically queued. New-record communication defaults remain unchanged; care is paused until reviewed.

An isolated database dry run imported 131 rows and held 4 for matching phone/full-name conflicts within the workbook. Your live database may have more matches. These are not silently merged or overwritten, and remain in the historical review with a conflict explanation. Review the existing person in Members/Guest submissions before deciding how to reconcile it. Rows that already match remain held rather than creating a duplicate.

## Keep the private data private

**Never commit `PRIVATE_IMPORT` to Git, put it in `public`, or share this release publicly.** Copy only the application folder into your repository. The application contains schema and review code, not the workbook's guest names or phone numbers. The private SQL seed sits outside it. The table is not directly accessible to staff clients: a Coordinator-only function controls review/import. The original workbook has not been edited.

## Validation

Production build, TypeScript checks and review-screen interaction tests passed. Run `npm run test:historical` to repeat the import checks. Database tests cover Coordinator-only access, direct-table denial, migration reruns, source-row retries, duplicate conflicts, missing contact details, preserved source evidence, paused care and no invented attendance/membership. All 135 real source rows were exercised in a disposable local database; no hosted database was changed. Browser installation was unavailable in this environment, so the new screen has not been verified in a full browser here.

Existing v4.1 setup instructions and the illustrated manual remain included. No new environment variables or service role key are needed for this import.
