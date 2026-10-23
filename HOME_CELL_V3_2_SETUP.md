Superseded for authentication: follow HOME_CELL_V3_3_PHONE_LOGIN.md. Phone-provider setup below describes v3.2 only. Directory migration 012 remains applicable.

# Home Cell v3.2

This update adds email or phone login, generated temporary passwords, and an editable contact directory from CORRECTED HOME CELL(2).docx.

## Install

1. Keep your existing `.env.local` and replace the project source with this version.
2. In Supabase SQL Editor, run `supabase/012_home_cell_leader_directory.sql` once. It requires the previously applied 009, 010 and 011 migrations. Do not rerun those earlier migrations.
3. In Supabase Authentication providers, enable Phone if phone login is not enabled. This flow uses passwords rather than SMS codes. No invitation email is sent for a new account created from this screen.
4. Run `npm install` and `npm run dev`.

## Create a login

Open Leadership Accounts. Search Cell Leaders & Contact Details, then choose Create / assign login. Check the name and phone, or enter an email. At least one valid identifier is required; both may be supplied for a new account. Choose role, area and cell, then Create / assign leader.

A new account gets a cryptographically generated temporary password. The administrator copies the credentials and shares them privately. They appear only in the successful creation response and current screen memory; no password is written to directory records, audit entries or browser storage. Copy before dismissing or leaving the page. The leader signs in at `/home-cell/login`, with either registered identifier and their password, and must choose a different personal password of at least 12 characters before using Home Cell pages or APIs.

Local Nigerian numbers such as 08031234567 normalize to +2348031234567. Explicit international numbers are also accepted. Incomplete source numbers are retained as directory text, not silently repaired. Review them before creating access. If a source has multiple numbers or leaders, select the intended person's details manually before creating their account.

An existing account is reused only after confirmation. Its current password, metadata, identifiers and other assignments are preserved. If the supplied email and phone resolve to different accounts, creation stops for correction. Assigning a role does not add a new phone/email to an existing account. Your own access cannot be changed from this screen.

Email recovery remains available for accounts with an email. For phone-only accounts, administrators must reset forgotten credentials through Supabase Authentication user management; SMS recovery and an in-app administrator reset action are not included in this version. Adding an existing central member record does not by itself create an auth login.

## Directory

The document's 66 cell records are matched to the existing 11 areas, including the confirmed Agbowo-UI and Sango-Apete area names. 54 records contain cell-leader details. Blank fields remain blank. Leader, assistant/treasurer and area-leadership text is preserved without guessing missing digits or emails.

Contact details appear on Home Cells and Leadership Accounts. Church administrators and assigned area managers can edit them; cell leaders can read contacts within their own scope. Edits are stored in Supabase, audited, and protected against stale saves. Running 012 again preserves edits. If a source cell has been renamed or is missing, migration 012 rolls back and identifies it for reconciliation.

These directory records do not grant permissions or create accounts. Login accounts and actual access assignments are managed separately. The original source addresses and fellowship settings remain in the existing editable Home Cell form.

## Validation

Production build and TypeScript completed. Local tests cover phone normalization, conflicting identities, all 66 seeded contacts, idempotent migration reruns, saved edits, stale-save protection and access restrictions. Browser checks use local mocked Supabase, not a live project. New phone account creation, password-change gating, password replacement and rejection of the temporary password after change were tested against the real application routes. Live Supabase provider settings and actual account creation remain to be verified in your project.
