# Paste this into Claude Code (from the project root)

```
You are finishing VBC Member Care v4.12 (Next.js 16 + Supabase, church volunteers on cheap Android phones).

1. Read CLAUDE.md, AGENTS.md and docs/v4.12/CLAUDE_CODE_BRIEF.md in full before changing anything.
2. Run the checks in §5 of the brief first and confirm the baseline: browser suite 63/63 PASS,
   home-cell-database 110 checks, test:home-cell-pins and test:cfc passing. Report the baseline.
3. Do Tasks A, B, C, D from the brief in that order. After each task, rerun the relevant suites
   and the full browser suite, and show me screenshots at 390px (light and dark) of the screens you changed
   next to the matching reference images in docs/v4.12/design/screens/.
4. Respect §3 (hard constraints) exactly: do not modify src/lib/care-runtime.js, src/app/care-office.css,
   src/components/FriendDesk.tsx or friend.css; no new dependencies; no API contract changes.
5. Stop and ask me before: changing any SQL migration other than adding a new one, changing what a role
   can do, or removing an existing capability from the CFC dashboard.

Work in small commits with clear messages. When a test fails, fix the cause; only change a test when the
app's intended behaviour changed, and say so in the commit message.
```

## Shorter version (one task at a time)

```
Read docs/v4.12/CLAUDE_CODE_BRIEF.md. Do only Task B (shared 4-box PIN sign-in for /home-cell/login,
/cfc-login and /friend-login). Keep API contracts identical. Run the PIN and browser suites from §5
and show me 390px light/dark screenshots next to docs/v4.12/design/screens/01-login-*.png.
```
