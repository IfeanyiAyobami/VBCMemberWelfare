# Home Cell v3.4 member onboarding and transfers

Cell leaders can onboard members by form or CSV, reuse existing central records and submit cell-assignment conflicts for coordinator or church administrator review. The visitor journey is unchanged.

## Install

Keep `.env.local`, replace the project source and run `supabase/014_home_cell_member_onboarding.sql` in Supabase SQL Editor. Existing migrations remain applied. If v3.3 has not yet been installed, apply migration 013 for phone usernames too; see HOME_CELL_V3_3_PHONE_LOGIN.md. Restart the local app after installing dependencies with `npm install`.

Migration 014 adds onboarding batch history, transfer requests, guarded functions and a trigger protecting existing assignment endpoints from creating a second active cell. It does not delete records or automatically move existing members. Existing legacy multiple-cell assignments are retained; subsequent conflicts require review. Reapplying 014 preserves recorded requests and onboarding history.

## Assign an existing member

Open Members and choose Find existing member. Search by name, phone or email, select the correct person, choose an assigned home cell, then preview the assignment. Confirm the identity before saving. Profile details, Member Care status and communication preferences stay unchanged.

If that person is already in the selected cell, the save makes no duplicate. If the person is active in another cell, the preview shows their current cell and requires an explicit transfer-request confirmation plus a reason. Saving submits the request while keeping the existing assignment active. A member can have only one pending transfer at a time; repeated requests for the same destination reuse the pending request.

## Add a new member

Choose Add new member and enter names plus at least one phone or email. Optional fields include occupation, address, birthday, anniversary and first church visit date. Preview before saving. A matching central member is reused only after explicit identity confirmation; a contact matching different people or an archived record needs office review.

A genuinely new person receives a central `new_member` record and the selected cell assignment in one transaction. This does not promote the person to official `member` status or create a login account. Initial SMS/email choices follow the existing defaults with opt-out controls; existing preferences are never reset. A contact found only in visitor records is blocked for office reconciliation. No visitor records are created, promoted or edited by this workflow.

## Import CSV

Choose Import CSV, download the header-only template and upload 1–100 rows, up to 200 KB. Supported headers:

`first,last,phone,email,occupation,address,birthday,anniversary,joined,email_opt_in,sms_opt_in,member_id`

Optional columns may be omitted. For new records, names and one contact method are required. Existing members may instead use member_id. Phone numbers normalize to international format. Birthday and anniversary use MM-DD; joined uses YYYY-MM-DD and defaults to today in Lagos when blank. Preference flags accept true or false, with blank values using the default ON choices for new records. Those fields never overwrite an existing person's preferences.

Quoted CSV fields, embedded commas, doubled quotes, BOM and Windows line endings are supported. Duplicate rows, conflicting identities, archived contacts and validation errors appear in preview. Correct the file or explicitly exclude individual rows. All included rows must be valid and reviewed. Conflicting cell assignments require transfer confirmation and a reason, exactly as in the form workflow.

The selected rows save as a single transaction: a failure rolls back earlier new records and links in that save. A stable request ID prevents a network retry from creating duplicate members. A contact or assignment that changes after preview is checked again when saving and may require a fresh preview.

## Review transfers

Pending requests appear under Home Cell Transfer Requests on coordinator and church administrator dashboards and on Members. The requesting leader can see their own request history. This is an in-app inbox; no email or SMS notifications are sent by this update.

A reviewer records a reason and chooses:

- Approve move: end the previous active assignments, preserving their rows and end dates, and activate the requested cell. Existing attendance and financial reports remain attached to their original meetings.
- Keep current cell: close the request without changing assignments.

Coordinators can review requests involving their assigned areas. A coordinator can approve a move only when both the destination area and every source area are within their coordinator assignments. Otherwise the church administrator handles the cross-area move. Cell-leader or area-leader permission alone cannot decide transfers. The database rechecks current roles, suspension, request state and the member's assignment snapshot when saving a decision. A stale request must be closed and reviewed afresh. A decided request cannot be decided again.

Decisions and onboarding changes are audited. The inbox is paginated. Private tables and privileged functions are unavailable directly to ordinary authenticated or anonymous clients.

## Verification

The production build and TypeScript check passed. All 82 local database checks passed, including scoped onboarding, duplicate retries, conflict prevention through legacy routes, pending request reuse, inbox isolation, approval/rejection, cross-area restrictions, stale membership protection and atomic batch rollback. CSV/member validation checks passed. Production browser checks covered form creation, existing member reuse, conflict submission, transfer decision, CSV preview/save and mobile layout, alongside the prior email/phone login and dashboard regressions.

Checks use local database fixtures and mocked Supabase services. Live migrations, real multi-user coordination and production deployment were not performed. The existing Next.js 16.4.0 security upgrade recommendation remains outstanding; the first build stopped with that advisory and a retry completed successfully.
