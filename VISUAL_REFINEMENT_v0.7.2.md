# VBC Member Care — v0.7.2 visual refinement

## Changes
- Follow-ups is now part of the Church Office navigation (including the saved member/guest shell).
- Removed the floating Follow-ups shortcut.
- Rebuilt the follow-up dashboard with the church's navy/purple/red visual system, responsive navigation, summary metrics, assignment form, queue filters, activity journal and empty states. Existing follow-up API and permissions remain unchanged.
- Programme photography now extends behind the entire card with a progressive navy fade, removing the abrupt split between image and card body. All card actions are preserved.
- The guest intake form and consent configuration are unchanged.

## Run locally
1. Back up your current project, then extract the ZIP into a new folder.
2. Restore your existing `.env.local` privately (never add it to Git).
3. `npm ci`
4. `npm run dev`
5. Check `/programmes`, `/followups`, `/members`, `/guests` and `/overview` on desktop and mobile.
6. Run `npm run typecheck` and `npm run build` before committing and deploying.

## Database
Follow-up assignments require the previously provided `supabase/007_followup_management.sql` migration. Run it in a safe test project and validate row-level security before production.

## Verification limitation
JavaScript syntax checks passed. Full TypeScript/build verification was not possible in the preparation environment because the Next.js executable was unavailable. No production deployment was made.
