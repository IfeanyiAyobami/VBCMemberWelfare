# Historical visitor workbook — source-only dry run

Source: `SPRING GUESTS 2025(1).xlsx`, supplied with the handover. All sheets/columns were read; the source workbook was not edited. No production matching or import has taken place.

## Observed structure

One worksheet, Sheet1, has 135 named data rows beneath its header. The seven labelled columns are Date on board, Name, Sex, Phone number, Target?, Joined church?, Assigned to?. Column H has four populated values but no header; treat its meaning as unconfirmed (likely notes, not an automatically approved destination field).

| Finding | Count | Handling before import |
| --- | ---: | --- |
| Named historical rows | 135 | Preserve source sheet and row as provenance. Not all rows are automatically unique people. |
| Missing/Nil phone | 8 | Preserve as unknown; do not invent a number. |
| Numeric phone cells | 103 | Stored as Excel numbers, often shown in scientific notation. Read the numeric value exactly; likely leading-zero loss needs review. Do not strip punctuation from scientific-notation text and treat the result as a phone. |
| Text cells with two phone candidates | 24 | Preserve both raw candidates; confirm primary/alternate and ownership rather than concatenating digits. |
| Unrecognised candidate within phone fields | 1 row | Manual review. This overlaps the multi-number review group. |
| Candidate phone-overlap groups | 7 | Includes tentative normalization of numeric/alternate numbers. Review as possible shared/family or duplicate contacts, never auto-merge. |
| Exact normalized-name duplicate groups | 0 | This is not proof of unique identities. Fuzzy names and database matches were not resolved. |
| Joined church = Yes | 26 | Historical membership claims requiring identity/date/officer reconciliation, not invented two-service evidence. |
| Joined church blank | 109 | Unknown, not a confirmed negative. |
| Target? = Yes / No / blank | 106 / 25 / 4 | Meaning needs confirmation; do not map it directly to eligibility or membership. |
| Missing assigned-worker text | 0 | Worker names still need verified matching to actual staff accounts/capabilities. Do not create login accounts from names alone. |
| Date cells containing an explicit year | 0 | All 135 date values are text. The filename suggests 2025 but that is source context, not a year present in each date cell. Confirm the intended year and the meaning of 'Date on board'. |

The 8 missing, 103 numeric and 24 multiple-number categories reconcile to 135 source rows. None has been silently changed into a verified primary login/contact number. Row-level review references and candidate-overlap groups are listed in `Historical_Data_Dry_Run.json` without exposing the underlying names or phone values.

## Required confirmation and mapping

- Is Date on board the first reported church visit, registration date, or another operational date? Confirm the 2025 period before assigning years.
- What does Target? mean? It cannot stand in for attendance eligibility.
- Does Joined church? = Yes represent an officially confirmed joining, and where is its actual date/evidence? Do not infer it from the visitor registration date.
- What is the intended meaning of the unlabelled H column?
- Which actual staff accounts correspond to the worker names, including former/inactive workers?
- Who owns multiple or shared phone numbers, and which is primary?

No church service dates, contact outcomes, membership dates, CFC records, consent events or six-month anchors were invented. Historic membership claims may need an explicitly approved legacy-verification path rather than fabricated attendance records.

Before a real import, normalize candidates reversibly while retaining raw values; compare against both current guests and members (including archived possible matches); show match confidence and conflicts; review ambiguous records; then obtain approval for the exact proposed production writes. The current online form and central records remain the operational sources going forward.
