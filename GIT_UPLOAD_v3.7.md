# Upload v3.7 to your existing GitHub / Netlify project

Copy this export's project contents into your existing Git checkout first. Keep its `.git` directory and your local `.env.local`.

In PowerShell, from your existing project folder:

```powershell
npm ci
npm run typecheck
npm run test:journey
npm run build
git status
git add .
git diff --cached --stat
git commit -m "Add visitor membership journey and fix leadership dialog UI"
git push origin main
```

Apply `supabase/017_visitor_journey.sql` in your existing Supabase project and deploy the matching source together. Netlify uses the already connected repository. Open `/followups` after deployment, grant the necessary journey capabilities and configure approved policy. Existing environment variables are sufficient.
