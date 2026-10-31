# v3.9 changes

- `supabase/020_whatsapp_dual_sending.sql`: invitations, channel permission, immutable attempts, provider-event audit/replies, RLS and role-scoped RPCs, service-only dispatch/status functions.
- `src/components/WhatsAppInvitations.tsx`: flyer-first dual-method UI, permission evidence, campaign creation, prepared handoff, paid-send confirmation, status/history/replies and staff outcomes.
- `src/components/JourneyDesk.tsx`, `journey.css`: person-profile integration and responsive approved theme styles.
- `src/lib/whatsapp/core.ts`, `server.ts`: configuration gating, image templates, signature/event parsing, exact template approval, single-attempt provider transport.
- `src/app/api/whatsapp/route.ts`, `webhook/route.ts`: authenticated staff actions and verified Meta events.
- `src/proxy.ts`: external webhook excluded from staff-session refresh; signature verification remains mandatory.
- `public/whatsapp/sunday-invitation.jpg`: supplied flyer, unchanged.
- `.env.example`, README, v3.9 setup/validation guide: configuration, deployment, usage and limitations.
- `tests/whatsapp-database.mjs`, `whatsapp-core.mjs`, `whatsapp-browser.mjs`, existing browser harness, package scripts and CI: integrated checks.

Earlier migration files are retained; run only the new 020 if your live database already has 019. The existing source-based project export is versioned v3.9 / package 0.10.0.
