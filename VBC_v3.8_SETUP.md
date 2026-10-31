# VBC Member Care v3.8 — deployment and use

This source continues v3.7.1. It uses the existing central people, guest intake, staff accounts and Home Cell data. There is no replacement public form, no new authentication account for direct members and no automatic email/SMS sending.

## Deploy

1. Back up the existing Supabase database using your normal backup process. Confirm migrations through 017 are already installed.
2. In Supabase SQL Editor, run the complete `supabase/018_member_care_integration.sql`. Then run the complete `supabase/019_journey_reporting.sql`. Both are transactional and tested for reruns.
3. Do not rerun old 017 after these migrations: it contains the superseded eligibility functions. Do not run the files under `tools/` in Supabase; they are development inputs for the complete 018 file.
4. Copy this source over your existing checkout, preserving your working environment variables. No new variables or SMS provider are required. Keep server secrets server-only.
5. Run `npm ci`, `npm run test:journey:v38`, `npm run typecheck`, and `npm run build`. Push the changes to your connected Git branch and let Netlify build. Keep the existing Node 22+ configuration and build settings.
6. Sign in as a Coordinator/administrator. Review an existing person, record their visit evidence, confirm actual joining separately, and test reports for a small period. Check the existing public intake and Home Cell routes after deployment.

```powershell
git status
git add .
git commit -m "Add one-visit membership workflow, integrations and reporting"
git push origin main
```

No production database was changed during preparation of this export. These tests use local fixtures, not your hosted church records.

## Membership and identity

Only ONE previous VBC visit is needed before the actual joining date. Same-day first-time joining remains blocked pending church approval. Direct registration may record today's first visit without allowing same-day joining. Registration itself never creates attendance.

Direct Membership Registration is staff-only and Coordinator-only. Search the central database first and explicitly confirm an existing identity. New records need a phone or email. Matching contact details cause a conflict rather than creating a duplicate. The same central person is promoted on joining; their guest submission and prior history remain linked.

A dated visit retains source/evidence. If a previous visit is known but its exact date is unknown, use the separate previous-visit confirmation: its “known before” date is an exclusive bound, not a fabricated service date. Corrections are audited. Removing the only evidence after joining flags membership review without deleting membership or original history.

New direct records default to permitted contact channels while preserving explicit opt-outs. Selecting an existing record leaves its preferences unchanged. No password or church app login is created for a member by registration. Leadership account/password tools remain in Home Cell Office.

The Membership Sunday page is a preparation list. Interested, contacted/invited, confirmed, deferred and did-not-join outcomes remain available; joined people have their own filter. Confirmation uses the actual joining date, not a guessed Membership Sunday date.

## Follow-up and formation

Visitor purpose is an internal classification and never blocks membership. Active, paused, inactive and declined contact are separate states. Declined contact turns preferences off and pauses outreach; resuming requires separately restored permission. The visitor target is first contact within 48 hours, fallback during the following week, then a provisional 1–2 contacts per week before joining. The six-month frequency still needs church approval.

Seven-week CFC and six calendar months of continuing care run independently. The assigned friend remains. Neither certificate recording nor a ministry/Home Cell assignment automatically closes care. Weekly CFC entries distinguish present, explicitly absent and no record. Corrections retain reasons. Actual enrolment and certificate dates can remain unknown; recording timestamps are not presented as historical event dates. Existing policy gates for CFC completion remain until the church confirms make-up/award rules.

## Ministry, Home Cell and privacy

Coordinators can add multiple ministry teams and end assignments with history retained. Responsibility and unknown joining dates are supported. Team-leader editing is not granted without church approval.

Member profiles read the existing Home Cell memberships, areas and transfers. Use the existing Home Cell module for edits, with its roles and conflict/transfer process. No second membership database is created. The central member profile includes a summary and a link to the full integration profile.

Only the assigned friend or Coordinator can read private welfare/support entries. Foundation-only access does not include private outreach/support data or contact exports. Removing an assignment/capability removes the corresponding access. New tables use RLS and scoped RPCs; browser clients cannot grant themselves roles.

## Reports

Reports support monthly, quarterly, annual and custom date ranges through today in Lagos. Export Excel or CSV. Excel contains six sheets: Scoreboard, People, Contacts, Church attendance, Ministry and Home Cells. CSV is the People summary. Both protect spreadsheet text from formula injection. Private welfare entries and free-text contact notes are excluded; contact details respect current channel preferences.

Worker filters use the CURRENT case owner, not historical worker attribution. Fields and metrics labelled “now” are current operational values, even for a past report period. Event counts use actual dates where known. Unknown event dates stay unknown and recording counts are shown separately. Report definitions are included in the interface and workbook.

Visitor conversion uses the matching visitor-intake cohort. Direct joiners are separate and never enlarge that denominator. Unknown legacy sources are separately identified. The cohort date retains the earlier reported/recorded first visit; otherwise an explicitly labelled registration fallback is used. Coordinator historical reports retain archived records, preventing archive from inflating conversion; friends cannot export archived cases.

An export is one database snapshot, limited to 10,000 people. If exceeded, choose a narrower period or worker; it fails with guidance rather than silently truncating. Normal screen results paginate. Exports are audited.

## Unresolved church decisions

Same-day first-time joining exceptions; which additional activities count as initial church visits; public-form purpose question; six-month contact frequency; CFC make-up/certificate rules; ministry-leader editing; central Home Cell editing remain pending. No policy is invented for these items. Home Cell/CFC entries do not automatically count as church attendance.

Historical workbook rows were not imported by this release. Ambiguous “Target?” values, absent years and missing attendance dates remain unknown. Any historical import needs a separate reviewed mapping.

## Appearance

Approved crest and Anton/Poppins assets are preserved. Dark canvas/sidebar/inputs use #000956; cards #0f0f59; primary text #f5f5ff; muted text #b9b9db; borders #303077. The existing light/dark toggle and independent Home Cell theme remain.
