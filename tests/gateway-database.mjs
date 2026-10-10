// Actual guarded SQL/RLS in an isolated PostgreSQL-compatible engine.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(
  process.env.CARE_PGLITE_MODULE || "@electric-sql/pglite"
);
const db = new PGlite();
const q = async (s, a = []) => (await db.query(s, a)).rows;
let count = 0;
const check = (ok, label) => {
  assert(ok, label);
  count++;
  console.log("PASS GATEWAY DB: " + label);
};
const id = (n) => "20000000-0000-4000-8000-" + String(n).padStart(12, "0");
const card = {
  surname: "Fixture",
  other_names: "Gateway Visitor",
  visit_date: "2026-10-01",
  occupation: null,
  gender: null,
  age_range: null,
  marital_status: null,
  phone: "+2348015550123",
  whatsapp: null,
  email: null,
  residential_address: null,
  born_again: null,
  home_visit: null,
  discovery_source: null,
  discovery_details: null,
  invited_by: null,
  contact_consent: true,
  email_opt_in: false,
  sms_opt_in: false,
  celebrations_opt_in: false,
  programmes_opt_in: false,
  newsletters_opt_in: false,
  birthday_month: null,
  birthday_day: null,
  anniversary_month: null,
  anniversary_day: null,
};
const evidence = "WordPress Gateway records visitor follow-up consent only.";
const call = async (
  key,
  patch = {},
  hash = "b".repeat(64),
  stamp = "2026-10-10 09:05:00",
) =>
  (
    await q(
      "select public.care_ingest_wordpress_gateway($1,$2::jsonb,$3,$4,$5) as result",
      [key, JSON.stringify({ ...card, ...patch }), evidence, hash, stamp],
    )
  )[0].result;
async function role(name, user = "") {
  await db.exec("reset role");
  await q(
    "select set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub',$2,false)",
    [name, user],
  );
  if (name !== "postgres") await db.exec("set role " + name);
}
async function denied(fn, code) {
  await assert.rejects(fn, (e) => e.code === code);
}
try {
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`,
  );
  for (const f of [
    "tests/fixtures/001_care_schema.sql",
    "tests/fixtures/002_care_functions.sql",
    "supabase/004_care_controls.sql",
    "supabase/005_guest_review.sql",
    "supabase/006_wordpress_gateway.sql",
    "supabase/006_wordpress_gateway.sql",
  ])
    await db.exec(await readFile(f, "utf8"));
  check(true, "Additive migration applies twice");
  const a = id(90),
    v = id(91),
    e = id(92);
  for (const [u, r] of [
    [a, "administrator"],
    [v, "viewer"],
    [e, "editor"],
  ]) {
    await q("insert into auth.users(id) values($1)", [u]);
    await q(
      "insert into care_staff(user_id,display_name,role) values($1,$2,$3)",
      [u, "Fixture " + r, r],
    );
  }
  for (const r of ["anon", "authenticated"]) {
    await role(r, a);
    await denied(() => call(id(1)), "42501");
  }
  check(
    true,
    "Anonymous and signed-in administrators cannot call the service-only RPC",
  );
  await role("service_role");
  const first = await call(id(1));
  check(
    first.id && first.duplicate === false,
    "New ingestion returns its existing guest queue ID",
  );
  check(
    (await call(id(1))).id === first.id && (await call(id(1))).duplicate,
    "Identical retries confirm the original row",
  );
  await role("postgres");
  const [g] = await q("select * from care_guest_submissions where id=$1", [
    first.id,
  ]);
  check(
    g.submission_key === id(1) &&
      g.source === "wordpress" &&
      g.entered_by === null &&
      g.review_status === "pending" &&
      g.member_id === null,
    "Original submission ID, trusted source and pending review retained",
  );
  const [stamp] = await q(
    "select to_char(gateway_submitted_at,'YYYY-MM-DD HH24:MI:SS') as value from care_guest_submissions where id=$1",
    [first.id],
  );
  check(
    g.gateway_payload_hash === "b".repeat(64) &&
      stamp.value === "2026-10-10 09:05:00",
    "Fingerprint and original site-local timestamp retained",
  );
  check(
    [
      "email_opt_in",
      "sms_opt_in",
      "celebrations_opt_in",
      "programmes_opt_in",
      "newsletters_opt_in",
    ].every((k) => g[k] === false),
    "All five sending choices remain false",
  );
  await role("service_role");
  await denied(() => call(id(1), {}, "c".repeat(64)), "23505");
  await denied(
    () => call(id(1), {}, "b".repeat(64), "2026-10-10 09:05:01"),
    "23505",
  );
  await denied(() => call(id(1), { surname: "Changed" }), "23505");
  check(
    true,
    "Conflicting fingerprint, timestamp or mapped content cannot overwrite a guest",
  );
  for (const patch of [
    { contact_consent: false },
    { email_opt_in: true },
    { birthday_month: 2, birthday_day: 29 },
    { source: "manual" },
  ])
    await denied(() => call(id(2), patch), "22023");
  await denied(() => call(id(2), {}, "bad"), "22023");
  await denied(
    () => call(id(2), {}, "b".repeat(64), "2026-02-30 00:00:00"),
    "22008",
  );
  check(
    true,
    "Database independently guards consent, milestones, actor metadata and envelopes",
  );
  await denied(() => call(id(2), { gender: "Unsupported" }), "23514");
  const recovered = await call(id(2));
  check(
    !recovered.duplicate,
    "Failed insert rolls back fully; identical ID can recover",
  );
  // Promise.all exercises simultaneous callers into this engine. PGlite queues
  // statements on one connection; this is not a multi-session load benchmark.
  const repeats = await Promise.all(
    Array.from({ length: 12 }, () => call(id(3))),
  );
  check(
    repeats.every((r) => r.id === repeats[0].id) &&
      repeats.filter((r) => !r.duplicate).length === 1,
    "Twelve submitted retries commit one guest",
  );
  await role("postgres");
  check(
    Number(
      (
        await q(
          "select count(*) n from care_guest_submissions where submission_key=$1",
          [id(3)],
        )
      )[0].n,
    ) === 1,
    "Unique external ID is enforced by storage",
  );
  await denied(
    () =>
      q(
        "insert into care_guest_submissions(submission_key,surname,other_names,visit_date,phone) values($1,$2,$3,$4,$5)",
        [id(3), "Duplicate", "Fixture", "2026-10-01", "+2348015550199"],
      ),
    "23505",
  );
  check(true, "Direct inserts cannot bypass the UNIQUE constraint");
  await role("authenticated", v);
  check(
    (await q("select id from care_guest_submissions where id=$1", [first.id]))
      .length === 1,
    "Active viewer retains guest read access",
  );
  await denied(
    () =>
      q(
        "update care_guest_submissions set gateway_payload_hash=$1 where id=$2",
        ["c".repeat(64), first.id],
      ),
    "42501",
  );
  await denied(
    () =>
      q("select public.care_review_guest($1,$2,$3,$4,$5,$6,$7)", [
        g.id,
        g.updated_at,
        "reject",
        null,
        null,
        "Fictional review rejection",
        false,
      ]),
    "42501",
  );
  check(true, "Viewer cannot edit receipt metadata or review guests");
  await role("authenticated", e);
  await q("select public.care_review_guest($1,$2,$3,$4,$5,$6,$7)", [
    g.id,
    g.updated_at,
    "reject",
    null,
    null,
    "Fictional review rejection",
    false,
  ]);
  await role("service_role");
  check(
    (await call(id(1))).duplicate,
    "Retry remains successful after staff review",
  );
  await role("postgres");
  check(
    (
      await q("select review_status from care_guest_submissions where id=$1", [
        first.id,
      ])
    )[0].review_status === "rejected",
    "Retry does not reset staff decisions",
  );
  // Stage via service role, as a collision with the old bridge (no fingerprint).
  await role("service_role");
  await q("select * from care_record_guest($1,$2,$3)", [
    id(4),
    JSON.stringify(card),
    evidence,
  ]);
  await denied(() => call(id(4)), "23505");
  check(
    true,
    "Legacy records with the same ID require explicit reconciliation",
  );
  await role("postgres");
  check(
    Number((await q("select count(*) n from care_members"))[0].n) === 0 &&
      Number((await q("select count(*) n from care_message_jobs"))[0].n) === 0,
    "Ingestion creates no members or outbound jobs",
  );
  check(
    (
      await q("select email_enabled,sms_enabled from care_settings where id=1")
    ).every((s) => !s.email_enabled && !s.sms_enabled),
    "Sending controls stay disabled",
  );
  console.log(count + " Gateway SQL/RLS checks passed. Isolated engine only.");
} finally {
  await db.close();
}
