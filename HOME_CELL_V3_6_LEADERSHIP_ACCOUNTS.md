# Home Cell v3.6 — leadership accounts and password handover

## Install

Keep your working `.env.local`, `.git` history and Netlify variables, including APP_ORIGIN and SUPABASE_SERVICE_ROLE_KEY. Copy the updated source into your existing project. Apply the additive **supabase/016_home_cell_password_recovery.sql** migration in your Supabase project after the already-installed 015. No existing leaders, members, roles or visitor records are removed. 016 is rerunnable. Build/test, then commit/push the update as usual. No new environment variable or SMS provider is needed.

016 is needed for the new replacement-password action; account creation and ordinary role changes continue using their existing migrations. If a replacement reports that 016 is missing, apply that migration rather than disabling protection. No hosted database/deployment was changed during development.

## New page layout

Accounts, Church directory and Activity log have separate views. A person appears once in the account list; multiple role assignments sit inside their account. Search by name, email, phone or location and filter by role/status. Lists show 12 people per page, with a notice if the API's existing 500-assignment cap is reached. Counts describe the currently loaded authorized accounts, not all possible historical/deleted users.

Manage opens focused Roles & assignments / Password & access views. Reassign shows the current assignment and new assignment together; only that selected role is replaced. Remove archives just the chosen role. Add role preserves the others. A reason belongs to its own action dialog, so it no longer leaks from another leader's security change. Self-access protections and coordinator scope remain enforced on the server/database.

Add leader is a two-step flow: contact details, then role/location. Back retains the draft. Enter email, phone or both; directory contacts can prefill it. An existing-account match opens a designed confirmation dialog before assigning its role; it does not silently overwrite the account password. Native browser confirm() calls are removed from leadership account management. Notifications show human-readable errors in focus-managed pop-ups without clearing the underlying form. Directory and activity errors use the same presentation on this page.

Date filters do not apply to account management and are hidden on the leadership page. Its navy header is compact. Other dashboard sections retain their existing date filters and visitor journey. Both light/dark and mobile views are supported.

## Creating Gmail/email and phone logins

A **new** account receives a cryptographically generated temporary church-dashboard password whether its contact is Gmail, another real email or a phone username. A Gmail address does not connect Google OAuth, and the church password is not their Gmail password. A leader signs in with the entered email or registered phone and changes the temporary password before Home Cell access. SMS is not required. This release does not automatically send the credentials by email/SMS.

An **existing** account keeps its password when a role is added. If they do not know that password, the church administrator can separately generate a replacement through Password & access. Password resets change this shared Supabase account's church login, including Member Care where applicable; they never change the actual Gmail mailbox password. The UI requires explicit acknowledgement of this effect. Coordinators can manage permitted roles but cannot replace shared passwords.

## Saved or lost passwords

After generation, a dedicated handover dialog shows the login and a masked temporary password. Show/hide, Copy login details and Download login slip are available. Copy/download counts as acknowledgement; manual acknowledgement is also available if the browser clipboard is blocked. Done/close/Escape is unavailable until the administrator acknowledges saving. The browser warns before a reload/tab close while the handover is open, subject to browser policy.

The password stays in component memory only while handing over. It is not stored in localStorage/sessionStorage, audit details or the operation table. A downloaded slip is a plaintext credential file explicitly chosen by the administrator: share privately and delete after handover. The UI cannot guarantee a download was retained or that a clipboard was pasted safely. SPA navigation or forcibly closing the browser may still lose the transient password.

If details were not saved or the response was lost: refresh Accounts, find the leader, Manage > Password & access > Generate replacement password. Enter a reason, acknowledge the shared-account impact, generate, and save the new details. The old password is replaced. Do not try to retrieve a stored plaintext password or recreate/delete the leader. If initial creation stopped before a leadership assignment appeared, repeat Add leader for the same exact contact; confirm the existing account if found, then use the replacement action after the role is attached.

Replacement requires another active leader (not yourself); suspended accounts must be reactivated first. Legacy phone accounts without an email login identity must use the existing Repair phone login action first. Phone username mappings, auth user ID, member records, metadata unrelated to the temporary-password flags and role assignments are retained.

## Reliability and audit behavior

Migration 016 authorizes active church administrators independently of the API, resolves target identity from the stored active assignment, records request ID/reason, revokes older Home Cell sessions and serializes reset starts with a database advisory lock. Only service-role RPC execution is granted. It reserves a 90-second window per target across app instances. Same request IDs are never replayed to generate another password. This protects against double clicks/concurrent administrator actions; it is not a cross-service transaction with Supabase Auth.

Provider changes use the server-only Supabase Admin API. Random passwords are returned only after a confirmed provider save, with private/no-store headers. A provider error or uncertain response returns no credential and records uncertainty where possible. Wait 90 seconds, return to the account and start a fresh replacement after inspecting the outcome. The same failed operation cannot be replayed. Older sessions may already have been ended even if the provider update failed. If the provider saved but completion-audit recording failed, the valid credential is still returned with an audit warning, so it is not discarded. The initial request audit persists for reconciliation. Administrative support should inspect pending/uncertain operations and finish incident records; no false automatic reconciliation is claimed.

There is also a shared per-administrator rate limit of ten replacement requests per five minutes using migration 015. HCO password-change flags and password hash checks are reused to require a different personal password at sign-in. This release does not claim immediate global revocation of all Member Care/third-party access tokens; Home Cell sessions use the existing session cutoff guard and other provider tokens follow their own policies.

## Design references researched

- Shopify Polaris resource list: focused object list, filtering and pagination. https://polaris-site-prod-kit.s5y-polaris-site-prod-ki-483d.prod.shopifyapps.com/components/lists/resource-list
- IBM Carbon data table guidance: contextual row actions instead of exposing every operation on every row. https://v10.carbondesignsystem.com/components/data-table/usage/
- Clerk user-management documentation: identity details and account actions grouped around an individual user. https://clerk.com/docs/guides/users/managing
- Supabase Admin updateUserById: server-only password changes. https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid

These informed the interaction pattern; no external UI kit, authentication replacement or new paid service was added.
