# VBC v4.5.2 — Home Cell Friend account correction

Fixes Friend creation for an existing active Home Cell leader who has no Member Care staff record. Missing staff records no longer count as inactive. An explicitly inactive staff record still blocks creation; database lookup failures fail closed.

The separate Friend identity receives its own four-digit PIN. The original Home Cell Auth identity, password, roles and assignments are not modified. Public email/phone aliases remain usable on their respective login pages.

Replace the source with this release, restart the local server or deploy, and retry from Follow Through → Friends & accounts. No additional SQL or environment changes are required for this correction. Existing migrations through 029 are still required for the full release.

Validation: route regression checks cover missing staff, inactive staff, database failure, separate Auth creation, protected-role reuse denial and failed-provision cleanup. Production build checked. Live Supabase creation must be retried in your environment.
