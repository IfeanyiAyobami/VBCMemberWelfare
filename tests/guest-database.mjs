// Isolated PostgreSQL-compatible checks. Does not contact hosted Supabase.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(
  process.env.CARE_PGLITE_MODULE || "@electric-sql/pglite"
);
const db = new PGlite();
let checks = 0;
const admin = "00000000-0000-4000-8000-000000000001",
  editor = "00000000-0000-4000-8000-000000000002",
  viewer = "00000000-0000-4000-8000-000000000003",
  outsider = "00000000-0000-4000-8000-000000000004";
const uuid = (n) => "10000000-0000-4000-8000-" + String(n).padStart(12, "0");
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
async function as(id, role = "authenticated") {
  await db.exec("reset role");
  await q(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",
    [id, role],
  );
  if (role !== "postgres") await db.exec("set role " + role);
}
function check(ok, label) {
  assert(ok, label);
  checks++;
  console.log("PASS GUEST DB: " + label);
}
async function denied(fn, code) {
  let err;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  assert.equal(err?.code, code);
}
const evidence =
  "Fictional guest card choices confirmed for this isolated test.";
const choices = {
  contact_consent: true,
  email_opt_in: true,
  sms_opt_in: false,
  celebrations_opt_in: true,
  programmes_opt_in: false,
  newsletters_opt_in: true,
};
const card = (patch = {}) => ({
  surname: "Fixture",
  other_names: "Guest",
  visit_date: "2026-10-01",
  occupation: null,
  gender: null,
  age_range: null,
  marital_status: null,
  phone: "+2348015550001",
  whatsapp: null,
  email: "guest@example.invalid",
  residential_address: null,
  born_again: null,
  home_visit: null,
  discovery_source: null,
  discovery_details: null,
  invited_by: null,
  birthday_month: 2,
  birthday_day: 29,
  anniversary_month: null,
  anniversary_day: null,
  ...choices,
  ...patch,
});
const stage = (key, data = card(), proof = evidence) =>
  q("select * from public.care_record_guest($1,$2::jsonb,$3)", [
    key,
    JSON.stringify(data),
    proof,
  ]);
const review = (
  g,
  action,
  id = null,
  version = null,
  note = "",
  confirmed = false,
) =>
  q("select * from public.care_review_guest($1,$2,$3,$4,$5,$6,$7)", [
    g.id,
    g.updated_at,
    action,
    id,
    version,
    note,
    confirmed,
  ]);
try {
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`,
  );
  for (const name of [
    "tests/fixtures/001_care_schema.sql",
    "tests/fixtures/002_care_functions.sql",
    "supabase/004_care_controls.sql",
    "supabase/005_guest_review.sql",
    "supabase/005_guest_review.sql",
  ])
    await db.exec(await readFile(name, "utf8"));
  check(true, "Migration succeeds twice without replacing core tables");
  for (const id of [admin, editor, viewer, outsider])
    await q("insert into auth.users(id) values($1)", [id]);
  for (const [id, role] of [
    [admin, "administrator"],
    [editor, "editor"],
    [viewer, "viewer"],
  ])
    await q(
      "insert into care_staff(user_id,display_name,role) values($1,$2,$3)",
      [id, "Test " + role, role],
    );
  await as(admin);
  const [g] = await stage(uuid(1));
  check(
    g.source === "manual" &&
      g.entered_by === admin &&
      g.review_status === "pending" &&
      !g.member_id,
    "Saved staff card is pending and stamps the verified actor",
  );
  check(
    (await stage(uuid(1)))[0].id === g.id,
    "Identical submission retry returns the original saved card",
  );
  await denied(() => stage(uuid(1), card({ other_names: "Changed" })), "23505");
  check(true, "Reused key cannot change saved identity");
  for (const patch of [
    { source: "wordpress" },
    { email_opt_in: "true" },
    { contact_consent: false },
    { visit_date: "2099-01-01" },
    { email: null, email_opt_in: true },
    { birthday_day: 30 },
  ])
    await denied(
      () => stage(uuid(99), card(patch)),
      patch.birthday_day
        ? "23514"
        : "source" in patch ||
            typeof patch.email_opt_in === "string" ||
            patch.contact_consent === false ||
            patch.visit_date ||
            patch.email === null
          ? "22023"
          : "23514",
    );
  check(
    true,
    "Unknown metadata, non-booleans, missing contact permission and invalid dates are rejected",
  );
  await denied(() => stage(uuid(99), card(), ""), "22023");
  check(true, "Evidence is required");
  const [accepted] = await review(g, "create", uuid(11));
  const [m] = await q("select * from care_members where id=$1", [uuid(11)]),
    [p] = await q("select * from care_preferences where member_id=$1", [
      uuid(11),
    ]);
  check(
    accepted.review_status === "accepted" &&
      m.status === "visitor" &&
      m.birthday_day === 29,
    "Create decision saves one visitor and its milestones",
  );
  check(
    Object.keys(choices).every((k) => p[k] === choices[k]),
    "New visitor gets exactly the six recorded choices",
  );
  check(
    (
      await q(
        "select * from care_consent_events where member_id=$1 and previous_value is not null",
        [m.id],
      )
    ).every((e) => e.recorded_by === admin && e.evidence_note === evidence),
    "Copied permission history has evidence and staff reviewer",
  );
  await review(g, "create", uuid(11));
  check(
    (await q("select * from care_members")).length === 1,
    "Review retry cannot create a second member",
  );
  await denied(() => review(g, "reject", null, null, "Other outcome"), "40001");
  check(true, "A reviewed card cannot be overwritten by another decision");
  const [dup] = await stage(uuid(2));
  await denied(() => review(dup, "create", uuid(12)), "23505");
  check(
    (await q("select * from care_members")).length === 1,
    "Matching contacts block duplicate member creation",
  );
  await denied(
    () => review(dup, "link", m.id, m.updated_at, "", false),
    "22023",
  );
  await denied(
    () => review(dup, "link", m.id, "2000-01-01T00:00:00Z", "", true),
    "40001",
  );
  check(
    true,
    "Link requires identity confirmation and a current matching-member version",
  );
  const before = JSON.stringify(
    (await q("select * from care_members where id=$1", [m.id]))[0],
  );
  const prefsBefore = JSON.stringify(
    (await q("select * from care_preferences where member_id=$1", [m.id]))[0],
  );
  await review(dup, "link", m.id, m.updated_at, "Identity checked", true);
  check(
    before ===
      JSON.stringify(
        (await q("select * from care_members where id=$1", [m.id]))[0],
      ) &&
      prefsBefore ===
        JSON.stringify(
          (
            await q("select * from care_preferences where member_id=$1", [m.id])
          )[0],
        ),
    "Link preserves existing member details and permissions",
  );
  const [archivedGuest] = await stage(uuid(3));
  await q("update care_members set archived_at=now() where id=$1", [m.id]);
  await denied(() => review(archivedGuest, "create", uuid(13)), "23505");
  await denied(
    () => review(archivedGuest, "link", m.id, m.updated_at, "", true),
    "P0002",
  );
  check(true, "Archived contacts block creation and linking until restored");
  await denied(
    () => review(archivedGuest, "reject", null, null, "short"),
    "22023",
  );
  await review(
    archivedGuest,
    "reject",
    null,
    null,
    "Fictional duplicate card rejected.",
  );
  check(true, "Rejection requires a reason and retains the submission");
  const [stale] = await stage(
    uuid(4),
    card({ phone: "+2348015550004", email: "stale@example.invalid" }),
  );
  await q("update care_guest_submissions set review_notes=$1 where id=$2", [
    "Intervening review note",
    stale.id,
  ]);
  await denied(() => review(stale, "create", uuid(14)), "40001");
  check(true, "A stale guest version cannot create a member");
  const [nonmatch] = await stage(
    uuid(5),
    card({ phone: "+2348015550005", email: "nomatch@example.invalid" }),
  );
  await q("update care_members set archived_at=null where id=$1", [m.id]);
  const [restored] = await q("select * from care_members where id=$1", [m.id]);
  await denied(
    () => review(nonmatch, "link", m.id, restored.updated_at, "", true),
    "40001",
  );
  check(
    true,
    "An arbitrary member ID cannot be linked without matching contact",
  );
  const [rollback] = await stage(
    uuid(6),
    card({ phone: "+2348015550006", email: "rollback@example.invalid" }),
  );
  await denied(() => review(rollback, "create", m.id), "23505");
  check(
    (
      await q("select * from care_guest_submissions where id=$1", [rollback.id])
    )[0].review_status === "pending",
    "Failed member creation leaves the guest pending",
  );
  await as(viewer);
  check(
    (await q("select * from care_guest_submissions")).length === 6,
    "Viewer can read the review queue",
  );
  await denied(() => stage(uuid(7)), "42501");
  await denied(
    () => review(nonmatch, "reject", null, null, "Viewer attempted rejection"),
    "42501",
  );
  check(true, "Viewer cannot submit or review a card");
  await as(outsider);
  check(
    (await q("select * from care_guest_submissions")).length === 0,
    "Non-staff cannot read submissions",
  );
  await denied(() => stage(uuid(7)), "42501");
  await as("", "anon");
  await denied(() => stage(uuid(7)), "42501");
  check(true, "Anonymous direct database intake is denied");
  await as(editor);
  const [ed] = await stage(
    uuid(7),
    card({ phone: "+2348015550007", email: "editor@example.invalid" }),
  );
  await review(ed, "create", uuid(17));
  check(true, "An active editor can complete the review");
  await as("", "service_role");
  const [web] = await stage(
    uuid(8),
    card({ phone: "+2348015550008", email: "web@example.invalid" }),
  );
  check(
    web.source === "wordpress" &&
      web.entered_by === null &&
      web.review_status === "pending",
    "Trusted receiver fixes the website source and leaves staff identity empty",
  );
  await stage(
    uuid(8),
    card({ phone: "+2348015550008", email: "web@example.invalid" }),
  );
  check(true, "Website network retries are idempotent");
  await as(admin);
  const [createdWeb] = await review(web, "create", uuid(18));
  check(
    createdWeb.reviewed_by === admin &&
      (
        await q(
          "select * from care_consent_events where member_id=$1 and previous_value is not null",
          [uuid(18)],
        )
      ).every((e) => e.source === "website"),
    "Website consent history records its origin and verified staff review",
  );
  await db.exec("reset role");
  const [settings] = await q("select * from care_settings where id=1");
  check(
    !settings.sending_enabled &&
      !settings.email_sending_enabled &&
      !settings.sms_sending_enabled,
    "All messaging switches remain paused",
  );
  console.log(checks + " guest database checks passed.");
} finally {
  await db.close();
}
