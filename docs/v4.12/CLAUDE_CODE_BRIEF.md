# VBC Member Care v4.12 — Claude Code brief: finish the simple mobile screens

You are continuing an in-progress release of **VBC Member Care**, a Next.js 16 + Supabase app used by Vine Branch Church, Ibadan, Nigeria. Most users are church volunteers on low-to-mid-range Android phones, many with little technical experience. **The design goal: a first-time smartphone user can finish their weekly church job without training.**

Read this whole file before writing code. Then read `AGENTS.md` (Next.js 16 differs from your training data — check `node_modules/next/dist/docs/` before using framework APIs).

---

## 1. What is already done (do not redo)

All of this is built, typechecked, and covered by passing tests. Treat it as the reference implementation of the design system.

| Area | Files | Status |
|---|---|---|
| Database: "No meeting" weeks, no self-approval, Coordinator approves when the area's only Area Leader leads that cell, PIN sign-in for Area Leaders (and Cell+Area dual roles) | `supabase/033_leader_app.sql` | Done. `node tests/home-cell-database.mjs` → 110/110; `node tests/home-cell-pin-database.mjs` passes |
| Workspace API: leader names/phones (`roles`), server-computed `approvable` / `reviewable` meeting IDs, actions `no_meeting` / `undo_no_meeting` | `src/app/api/home-cell/workspace/route.ts`, `src/lib/home-cell/model.ts` | Done |
| **Simple leader app** — Cell Leader hub (any-order items), attendance, visitors (reuses existing records), offering / dues / expenses, check & send, No meeting, sent, My people, Help; Area Leader This week, review, approve, send back, cells, check on; dual-role home | `src/components/home-cell/LeaderApp.tsx`, `src/components/home-cell/leader-app.css`, `src/lib/home-cell/leader-week.ts` | Done. 4 browser checks pass |
| Routing: `/home-cell` shows LeaderApp to Cell/Area Leaders (`isLeaderOnly`), full office for everyone else; `/home-cell?full=1` forces the full office | `src/app/home-cell/page.tsx` | Done |
| Full office Approve/Send back buttons follow `approvable`/`reviewable` | `src/components/home-cell/HomeCellWorkspace.tsx` | Done |
| Leadership accounts: Area Leaders get "Generate / reset 4-digit PIN"; admins can still reset Area Leader passwords (password sign-in kept during changeover) | `src/components/home-cell/LeadershipAccounts.tsx`, `src/app/api/home-cell/leaders/pin/route.ts` | Done |
| Bug fix: oversized sign-in requests hung the server (read a clone, abandoned the original). Now 413 in ms | `src/app/api/home-cell/login/route.ts` | Done |
| Stale browser tests from v4.8–v4.11 updated (Friend tab memory, embedded CFC, PIN-era messages, `mode: "staff"`, "Security & access", mock `id=eq.` filter) | `tests/home-cell-browser.mjs`, `tests/friend-mode-browser.mjs`, `tests/v41-browser.mjs` | Done. **63/63 browser checks pass** |

---

## 2. Your tasks (in order)

### Task A — Visual QA of the leader app against the approved design
1. Open `docs/v4.12/design/vbc-simple-mobile-proposal.html` in a browser (it has a screen picker and a light/dark toggle). Reference PNGs: `docs/v4.12/design/screens/NN-<screen>-<light|dark>.png`. *(The PNGs were rendered without network access, so headings fall back from Anton to a system font. Anton is correct.)*
2. Screenshot the real LeaderApp at **390×844, 834×1112, 1440×900**, light and dark, for each Cell Leader / Area Leader / dual screen. Use the browser test's `leaderRoles` switch (see §6) to sign in as each role.
3. Fix visual differences. Priorities: readable text, 48px+ targets, nothing cut off, no sideways scrolling, sticky Save buttons sitting at the bottom edge, header not cramped when a back button is present.
4. Accept: screenshots saved under `docs/v4.12/qa/`, no overflow at any width, no text under 12px (body 17px in the app).

### Task B — One shared 4-box PIN sign-in screen
Pages: `/home-cell/login`, `/cfc-login`, `/friend-login` (see `src/app/*/` and their components). Design: screen `01-login` in the mockup.
- **One reusable component** used by all three; each page passes its title, API endpoint and help text.
- Phone or email field (`inputMode="tel"`, autocomplete `username`), then the PIN: **a single `<input>` visually split into four boxes** (`inputMode="numeric"`, `pattern="\d{4}"`, `maxLength={4}`, `autoComplete="current-password"`, accessible label "4-digit PIN"). Show/Hide toggle. **Do not clear the PIN on a wrong attempt.**
- "Keep me signed in on this phone" checkbox (keep existing behaviour and cookies exactly).
- "Forgot your PIN? Call your Coordinator" (static text is fine; no self-service reset exists by design).
- Keep the existing small link to staff/password sign-in.
- **Do not change any API contract.** Read each page and route first. Endpoints: Home Cell `POST /api/home-cell/login` with `{identifier, pin, remember}` (password sign-in adds `mode: "staff"` and `password`); CFC `POST /api/cfc/login`; Friend `POST /api/journey/friend-login`. CFC and Friend already share `src/app/friend-login/pin-login.css` — build the shared component from that starting point.
- No large photo (data cost). Light by default, dark supported.
- Accept: `npm run test:home-cell-pins`, `node --experimental-strip-types tests/friend-pin-routes.mjs`, `node --experimental-strip-types tests/cfc-pin-routes.mjs`, `tests/login-persistence.mjs` pass; browser suite still 63+/63+.

### Task C — CFC (Foundation Class) Leader screens
Current: `src/components/CfcDashboard.tsx` (+ `cfc.css`), tabs Today / Participants / Classes / Baptism / Account, one `GET /api/cfc` and `POST /api/cfc` with actions `cohort`, `session`, `enrol`, `attendance`, `submit`, `approve`, `certificate_issue|ready|collect`, `baptism_register|schedule|complete` (see `supabase/031_*`, `032_*`). Approved design: screens `19-cfc-home`, `20-cfc-attendance`, `21-cfc-person`.
- **Same look and patterns as LeaderApp** (reuse `leader-app.css` tokens/classes or extract them into a shared stylesheet — do not create a third visual style).
- Tabs: **Classes · People · Help** (3 tabs).
- **Classes (home):** "NEXT CLASS" card — class number, topic, date/time, venue — with one big **Take attendance** button. Below: "Needs a make-up class" (people who missed a class, with Call). Then two row links: **Plan classes** (cohorts, scheduling, topics — move the existing forms here) and **Baptism** (existing baptism register/schedule/complete).
- **Take attendance:** opened from the class card, so the class is already chosen (**no cohort/class dropdowns**). Each person: big **Came / Absent** buttons; "Everyone came"; pinned Save. If changing a mark that was already saved requires a reason today, ask for it only at that moment.
- **People → person:** seven numbered circles (green done, red dashed missing), one sentence "Missing Class 3. Next Class 3 is Saturday 7 Nov." with "Add to that class", then Certificate and Baptism rows with plain statuses and their existing actions.
- Coordinators see this dashboard embedded in Follow-ups (`<CfcDashboard embedded />`, class `cfc-embedded`) — keep that working.
- Keep every existing capability; just move setup tasks off the daily screens.
- Accept: `npm run test:cfc` passes (update `tests/cfc-ui.mjs` expectations deliberately, not by weakening checks); add a browser or jsdom check for: next class → take attendance → save; person progress with a missing class; embedded mode renders.

### Task D — Release v4.12
1. `package.json` and `package-lock.json` version → `0.22.0` (both `version` fields).
2. Write `VBC_v4_12_SIMPLE_LEADER_SCREENS.md` (start from `docs/v4.12/RELEASE_NOTES_DRAFT.md`): deploy steps, what changed per role, what tests ran, what was not run (hosted Supabase/Netlify).
3. Put a pointer at the top of `README.md`.
4. Run every suite in §5. Zip the project **excluding** `node_modules`, `.next`, `preview.html`, `tsconfig.tsbuildinfo` and any `PRIVATE_IMPORT` data.

---

## 3. Hard constraints (the owner has decided these)

- **Do not touch the Church Office Overview.** `src/lib/care-runtime.js` and `src/app/care-office.css` must stay byte-for-byte as they are. The owner rejected an earlier Overview redesign.
- **Do not change the Friend dashboard** (`src/components/FriendDesk.tsx`, `friend.css`). Its v4.8 design is approved.
- **No new npm dependencies.** No new environment variables.
- Home cells usually meet **Sundays 6–7 pm**, but always read `meeting_day` (0 = Sunday), `meeting_start`, `meeting_end` from the cell. Timezone: **Africa/Lagos**.
- "No meeting" has **no reasons** — one tap, undoable.
- Nobody approves their own cell's report (enforced in SQL; UI must not offer it).
- Cell Leaders sign in with PINs only. Area Leaders: PIN **and** password during the changeover.
- Plain words. Use: *meeting* (not fellowship), *Send for approval / Check and send* (not consolidated report), *Offering / Dues / Expenses* (not transaction type / net movement), *Came / Late / Absent* (not P / L / A), *Coordinator*, *Area Leader*, *Cell Leader*.
- Accessibility: buttons ≥ 48px tall (primary 56–58px), text ≥ 12px (body 17px), colour is never the only signal, every icon button has an `aria-label`, focus visible.
- Light mode default for leader screens; dark mode via the same theme key the app already uses (`hco-reference-theme`).

---

## 4. Design system (from the approved proposal)

Principles, from the research behind it (SARAL low-literacy guidelines, GOV.UK patterns, Planning Center Groups, Google touch-target guidance):
1. **One thing per screen.** Each step is its own screen; save returns to the hub.
2. **Hub, not wizard.** Items can be done in any order; statuses: *Done*, *Not started*, *None*, *Optional*.
3. **The app already knows the context** (this week's meeting, this class) — never ask the user to pick it from a dropdown.
4. **Numbers forward**: big amounts with the number keypad; counts like "9 came · 2 absent".
5. **Three tabs maximum**, with text labels under icons.
6. **Help on every screen**: "Stuck? Call your Coordinator" (real phone from `roles`).
7. **Check your answers** before sending, with a Change link per line.
8. **Clear finish screens** ("Sent. Thank you!", "Approved", "Done").

Tokens (see `leader-app.css`, prefix `lx-`): background `#f4f5fa` / dark `#000956`; card `#fff` / dark `#11166a`; text `#12163f`; muted `#555b7a`; church red `#e51b25` (primary actions only); green `#166534` on `#dcfce7` for Done/Came; amber for Late/Not sent; Anton for page titles only; Poppins for everything else.

---

## 5. How to run checks

```sh
npm ci
npx tsc --noEmit
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture_0123456789 \
NEXT_TELEMETRY_DISABLED=1 npx next build --webpack

# Browser suite (Home Cell, Follow-ups, Friend, CFC embed, leader app). Needs Chromium:
npx playwright install chromium        # or set HCO_CHROMIUM_PATH to an existing Chrome
CARE_AUTH_MOCK_PORT=54399 node tests/home-cell-browser.mjs     # expect 63+ "PASS" lines, exit 0

# Database / unit suites (PGlite, no Docker needed)
node tests/home-cell-database.mjs      # 110 checks
npm run test:home-cell-pins
npm run test:cfc
npm run test:mobile-friend
npm run test:members
npm run test:greetings
```
**Important:** the browser build bakes `NEXT_PUBLIC_SUPABASE_URL` in at build time — always build with port 54399 and run the suite with `CARE_AUTH_MOCK_PORT=54399`.

Known pre-existing failure (not yours): `npm test` stops in `tests/member-care.cjs` at "Member saved" (old Church Office sample screens).

---

## 6. Test harness notes (`tests/home-cell-browser.mjs`)

- It runs a fake Supabase server (`mock`) and starts the built app. Workspace data for Home Cell screens is usually served **in the browser** with `page.route("**/api/home-cell/workspace**", …)`.
- **`leaderRoles`** (top of file): set to an array like `[{ role: "cell_leader", cell_id }]` or `[{ role: "area_leader", area_id }]` to make the signed-in user a leader **on the server** (so `/home-cell` renders LeaderApp). Set back to `null` afterwards. See the "v4.12 simple leader app" block for a full example, including an in-browser simulation of saves (`writes` array).
- `testNonAdmin` makes the user a Coordinator.
- The mock now honours `id=eq.` and single-object (`.maybeSingle()`) requests for `hco_assignments`. Extend the mock the same way if new queries need it, rather than loosening the app.
- PGlite database tests: `033_leader_app.sql` contains a PIN section that needs Follow-up tables. `home-cell-database.mjs` applies only the part before `-- PIN sign-in`; `home-cell-pin-database.mjs` applies only that section.

---

## 7. Gotchas already hit in this codebase (avoid repeating them)

1. **Server components cannot import plain functions from `"use client"` files.** Put shared helpers in `src/lib/…` (e.g. `isLeaderOnly` lives in `leader-week.ts`). Symptom: "A server error occurred" on the page.
2. **Never define stateful components inside another component's body.** They remount on every parent render and lose typed input. LeaderApp keeps stateful screens at module level and passes a `ctx` prop.
3. **Request bodies: read once.** Don't `req.clone()` and abandon the original (it hung the server on large bodies).
4. **Meetings:** `meeting_date` must be ≤ today (Lagos); one meeting per ISO week (Mon–Sun) per cell; "No meeting" can be up to 7 days ahead.
5. **Writes need the current `version`** (`HCO_STALE_REPORT_REFRESH_FIRST` otherwise) — reload after each write.
6. **Attendance replaces all rows and also overwrites meeting notes** — always send the current `notes`.
7. **Money is append-only**: add entries with `finance` (description ≥ 3 chars); remove with `void_finance` and a reason ≥ 5 chars.
8. **Visitors:** a new contact whose phone/email already exists raises `HCO_EXISTING_CONTACT_SEARCH_AND_CONFIRM_IDENTITY` — search `/api/home-cell/people?q=` and post `member_id` or `guest_submission_id` instead.
9. **Submit requires attendance.** Correction (send back) requires a reason ≥ 5 chars.
10. Error codes are mapped to plain English in `plainError()` (`leader-week.ts`) — extend it, don't show raw codes.

---

## 8. Definition of done
- Tasks A–D complete; all suites in §5 pass; no runtime errors in the browser suite.
- Overview and Friend files untouched (verify with a diff against the v4.11 originals).
- Release notes honestly list what was and wasn't tested (hosted Supabase/Netlify not exercised).
