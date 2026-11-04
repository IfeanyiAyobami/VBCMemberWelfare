# v4.5.1 — Friends & accounts, assignments and dual roles

## Install

If v4.5 migrations 027 and 028 are already installed, run **supabase/029_friend_assignment_without_reason.sql** in Supabase SQL Editor, then copy this release into your existing Git checkout and deploy. Keep `.git`, your environment files and the existing `FRIEND_PIN_SECRET`. No new environment variable is required.

If you have not installed v4.5 yet, apply 027, 028 and 029 in that order, and follow `VBC_v4_5_SETUP.md` for the secret and service-role configuration. Do not rerun older write-function migrations afterward; they restore the old assignment requirement.

## Friends & accounts

Account creation and PIN resets live only in the **Friends & accounts** navigation section on Follow Through. Administrators and Coordinators see it. People register and the other journey sections do not include the provisioning form. Switching sections no longer leaves that form open above a different page.

## Assign or reassign a Friend

Select the person and the new active Friend. There is no reason box and the database no longer requires one. The audit history still records the actor, time, previous Friend and new Friend. Existing permissions, stale-record protection and safe request retries are unchanged. Existing reasons in historical audit entries are retained.

## One person: Home Cell leader and Follow Through Friend

Create the Friend account using the leader's email and/or phone in **Friends & accounts**. New Friend logins use a private internal Auth username, while keeping the familiar email/phone as the Friend sign-in identifier. If the contact matches an active Home Cell leader account, the app provisions a separate Friend Auth identity. This also lets a newly created Friend later receive a separate Home Cell login using the same public contact details. Existing Friend-only staff logins can still be reused to retain their assignments.

- Home Cell login: the existing Home Cell email/phone and password.
- Friend login: `/friend-login`, the same email/phone if desired, and the newly generated four-digit PIN.
- Home Cell password, assignments and roles are not modified.
- Resetting the Friend PIN affects only the separate Friend identity.
- The new Friend identity has no Home Cell assignment or global administrator/Coordinator access.
- Staff login identities are separate; the central guest/member person record is not duplicated by creating a login.

A person can therefore be a leader and a Friend without their four-digit PIN granting Home Cell administration access. The old v4.5 rule excluding active Home Cell identities from direct PIN conversion is retained as a protection; this release creates an independent identity instead. Inactive staff accounts still require administrator review.

One browser profile uses one Supabase sign-in session. Sign out to switch dashboards/accounts, or use separate browser profiles to stay signed into both at once.

## Validation

Production build and the v4.5 checks passed, including independent Friend provisioning for an existing Home Cell leader, protected-role reuse denial, assignment/reassignment without reasons, retained previous/new Friend audit, request retries and unauthorized assignment denial. No live database changes or real messages were performed. Full browser visual verification was not available here.

Run `npm run test:v45` and `npm run build` locally if desired. The restored Overview, central guest dates, restricted Coordinator access and previous v4.5 features remain included.
