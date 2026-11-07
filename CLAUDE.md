# Instructions for Claude Code

1. Read `AGENTS.md` first — this is Next.js 16; check `node_modules/next/dist/docs/` before using framework APIs.
2. Current work: **v4.12 simple mobile screens**. Read `docs/v4.12/CLAUDE_CODE_BRIEF.md` before changing anything.
3. Never modify: `src/lib/care-runtime.js`, `src/app/care-office.css` (Church Office Overview), `src/components/FriendDesk.tsx`, `src/components/friend.css` (approved Friend design).
4. No new npm dependencies or environment variables without asking.
5. Users are church volunteers on low-end Android phones: plain words, buttons ≥ 48px, text ≥ 12px (body 17px), one thing per screen, Africa/Lagos time.
6. Before finishing: `npx tsc --noEmit`, the build, and the suites in §5 of the brief must pass.
