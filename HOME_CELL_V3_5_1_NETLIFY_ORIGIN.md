# v3.5.1 — Netlify Invalid origin fix

The shared CSRF guard previously compared the browser Origin header to Next.js request.nextUrl.origin. Behind a proxy those can differ. This update resolves a deployment-controlled public origin for both the guard and Home Cell recovery redirects. It does not trust arbitrary Host or forwarded headers and does not disable CSRF checks.

## Deploy

1. Copy this source over your existing project without replacing `.env.local` or `.git`.
2. In Netlify Project configuration > Environment variables, add `APP_ORIGIN` with value `https://welfarevbc.netlify.app` for Production. This value is public configuration, not a secret. Functions scope must be included if scopes are selectable.
3. Commit/push and deploy the updated source. Setting APP_ORIGIN alone cannot fix an older build that does not read it. No new SQL is needed beyond v3.5's existing 015 migration.
4. Test Home Cell login at that exact domain. If using a different canonical/custom domain, set APP_ORIGIN to its HTTPS origin instead and use that domain. Keep Supabase redirect allowlists aligned.

APP_ORIGIN takes precedence and must contain only an origin (HTTPS scheme and host, optional port; no path/query/credentials). Invalid configuration fails closed. A trailing slash is accepted. Leave blank locally so local origin checking works normally. On Netlify without an explicit value, production falls back to URL; previews use DEPLOY_PRIME_URL. Do not give production's APP_ORIGIN override to preview contexts: each preview needs its own origin, or leave it blank for detection. No wildcard allowlist is used.

Validation includes origin unit cases, real production HTTP requests using a public Origin against an internal server address, and the production build. The public Origin reaches the normal server-configuration guard; foreign/missing origins still return 403. This test uses no live credentials or services. Live Netlify settings and authentication have not been changed or verified here.
