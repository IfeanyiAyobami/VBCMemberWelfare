# Home Cell v3.3 phone login

Phone numbers now act as login usernames. The server privately resolves the username to the same Supabase account, then checks its password using email authentication. Phone-only accounts receive a random internal email address under home-cell.invalid; it is not a mailbox or a recovery address. Leaders only enter their phone number and password. No SMS provider, Twilio credentials or SMS confirmation is used.

## Install

1. Keep your existing `.env.local` and replace the project files with this version.
2. Run `supabase/013_home_cell_phone_usernames.sql` in Supabase SQL Editor. Keep the previously applied migrations, including 012 for the editable directory; do not rerun the older migrations for this update.
3. Keep Supabase email authentication enabled. The Phone provider can remain disabled.
4. Run `npm install`, restart the local app, and sign in with your administrator account.

Migration 013 creates a private, unique phone-username index. It indexes native phone accounts already assigned HCO roles, without changing their auth user IDs, passwords or roles. It is safe to rerun and never overwrites an existing username binding. If a conflicting legacy phone identity is found, the migration fails for review rather than guessing its owner.

## Repair the leaders already created in v3.2

Open Leadership Accounts and find a phone-only leader. Enter a reason, such as `Enable phone username login`, in Reason for access changes, then click Repair phone login on that leader's card and confirm. The repair button is available to church administrators for legacy accounts without an email.

This adds an internal email identity to the same auth user and preserves their password, password-change requirement and every assignment. Test with the same phone number and temporary password in a private window. On first login, the leader chooses their own new password. Do not delete or recreate these leaders and do not add a duplicate role to repair a login.

Legacy accounts that already have a real email can use the indexed phone username immediately after migration 013. If a repair fails partway through, retry the same repair; the unique username reservation is preserved, and a successful retry finishes the same account. Repairs are audited. Passwords and internal addresses are not included in repair audit entries.

## Create new leaders

Enter email, phone or both; review the leader's role and scope, then create. New accounts receive a generated temporary password, shown for copying only in the current screen. Phone-only accounts do not create native Supabase phone identities. Phone usernames are normalized, unique and resolved only on the server. Local Nigerian and explicit international formats are supported as before.

Existing accounts require confirmation before a new role is added. Their password is preserved. A supplied phone number can be registered as a username if it is available, without replacing their real email. A conflicting email/phone pair stops for correction. A phone collision also rolls back the accompanying role assignment.

Phone numbers here are administrator-approved usernames, not proof of phone ownership. Editing directory contact text does not silently change a login username. No public self-registration, SMS recovery or in-app password reset for phone-only accounts is added by this update. If an administrator loses the initial temporary password before the leader sets a personal password, password recovery still requires administrator support; it cannot be retrieved from the directory.

## Verification and limits

Local database tests verify username ownership, transactional role rollback on collisions, permissions, repair restrictions, idempotency and existing directory protection. Browser tests use the real application with a local mocked Supabase that rejects native phone authentication. They verify SMS-free account creation and login, legacy repair with the original account ID and password, mandatory password change, rejection of the old temporary password, directory editing, and desktop/mobile pages.

Live Supabase was not accessed. After applying 013, verify one existing repaired leader and one new phone-only leader in your project before distributing credentials.

During validation the installed Next.js 16.4.0 build reported a security advisory recommending an upgrade. The framework version is unchanged in this focused login update. See HOME_CELL_VALIDATION.md for the final build outcome.
