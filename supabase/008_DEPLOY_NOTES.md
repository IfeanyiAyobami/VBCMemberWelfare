# Migration 008 — Review before production

1. Backup Supabase; apply 005 and 006 first. Run 008 in SQL editor.
2. New members receive ON channel preferences where a destination exists; existing records are not changed.
3. The WordPress gateway accepts its unchanged false-flag wire format and saves server-derived preferences. Exact retries are idempotent.
4. Do not rerun migration 006 after 008; it replaces the gateway function with the old version.
5. Verify new WordPress guest, duplicate retry, missing email, guest-to-member conversion, individual add, CSV import, explicit OFF, unsubscribe and existing opt-out before enabling messaging.
6. This does not modify existing CSV import client-side defaults; verify the CSV parser does not explicitly submit false values that overwrite initial defaults.
7. ON preferences are not proof of affirmative consent. Sending eligibility and message purpose must be verified separately. Workers remain unchanged.
8. No production SQL was executed and no end-to-end tests were run here.
