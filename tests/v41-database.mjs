import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const q = async (s, a = []) => (await db.query(s, a)).rows;
const id = (n) => "70000000-0000-4000-8000-" + String(n).padStart(12, "0");
let count = 0;
const ok = (v, label) => {
  assert(v, label);
  console.log("PASS JOURNEY", ++count, label);
};
const denied = async (fn, code) => assert.rejects(fn, (e) => e.code === code);
const as = async (n) => {
  await db.exec("reset role");
  await q(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",
    [id(n)],
  );
  await db.exec("set role authenticated");
};
let request = 1000;
const write = async (action, data, req = id(++request)) =>
  (
    await q("select public.care_journey_write($1,$2::jsonb,$3) result", [
      action,
      JSON.stringify(data),
      req,
    ])
  )[0].result;
const read = async (member = null) =>
  (await q("select public.care_journey_read($1) result", [member]))[0].result;
const data = async (member, extra = {}) => ({
  memberId: id(member),
  version: (await read(id(member))).detail.person.version,
  ...extra,
});
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,phone text);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`,
  );
  for (const file of [
    "tests/fixtures/001_care_schema.sql",
    "tests/fixtures/002_care_functions.sql",
    "supabase/004_care_controls.sql",
    "supabase/005_guest_review.sql",
    "supabase/006_wordpress_gateway.sql",
    "supabase/007_followup_management.sql",
    "supabase/008_default_communication_preferences.sql",
    "supabase/009_home_cell_office.sql",
    "tests/fixtures/010_home_cell_directory.sql",
    "supabase/011_home_cell_workflows.sql",
    "supabase/012_home_cell_leader_directory.sql",
    "supabase/013_home_cell_phone_usernames.sql",
    "supabase/014_home_cell_member_onboarding.sql",
    "supabase/015_home_cell_rate_limits.sql",
    "supabase/016_home_cell_password_recovery.sql",
  ])
    await db.exec(
      (await readFile(file, "utf8")).replace(
        "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
        "",
      ),
    );
  for (const [n, role] of [
    [1, "administrator"],
    [2, "followup_worker"],
    [3, "followup_worker"],
    [4, "editor"],
    [5, "viewer"],
  ]) {
    await q("insert into auth.users(id) values($1)", [id(n)]);
    await q(
      "insert into care_staff(user_id,display_name,role) values($1,$2,$3)",
      [id(n), "Fictional staff " + n, role],
    );
  }
  for (const [n, status] of [
    [10, "visitor"],
    [11, "visitor"],
    [12, "member"],
  ]) {
    await q(
      "insert into care_members(id,surname,other_names,status) values($1,$2,$3,$4)",
      [id(n), "Fixture", "Person " + n, status],
    );
    await q(
      "insert into care_preferences(member_id) values($1) on conflict do nothing",
      [id(n)],
    );
  }
  await q(
    "insert into care_guest_submissions(id,submission_key,member_id,surname,other_names,visit_date,phone,review_status) values($1,$2,$3,'Fixture','Original Guest','2026-08-30','+2348015550190','accepted')",
    [id(500), id(501), id(10)],
  );
  await db.exec(await readFile("supabase/017_visitor_journey.sql", "utf8"));
  await db.exec(await readFile("supabase/017_visitor_journey.sql", "utf8"));
  await db.exec(
    await readFile("supabase/018_member_care_integration.sql", "utf8"),
  );
  await db.exec(await readFile("supabase/019_journey_reporting.sql", "utf8"));
  await db.exec(
    await readFile("supabase/018_member_care_integration.sql", "utf8"),
  );
  await db.exec(await readFile("supabase/019_journey_reporting.sql", "utf8"));
  ok(true, "018 and 019 apply twice after the complete migration chain");

  await db.exec(
    `create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);create function storage.foldername(p text) returns text[] language sql immutable as $$select string_to_array(p,'/')$$;alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant insert on storage.objects to authenticated;`,
  );
  for (const migration of [
    "supabase/022_friend_direct_registration.sql",
    "supabase/023_saved_programmes.sql",
    "supabase/024_follow_through_registers.sql",
  ]) {
    await db.exec(await readFile(migration, "utf8"));
    await db.exec(await readFile(migration, "utf8"));
  }
  await as(2);
  await denied(
    () =>
      q(
        "insert into storage.objects(bucket_id,name) values('care-programme-flyers',$1)",
        [id(2) + "/" + id(999) + ".png"],
      ),
    "42501",
  );
  const direct = async (data, requestId = id(++request)) =>
    (
      await q("select public.care_journey_direct($1::jsonb,$2) result", [
        JSON.stringify(data),
        requestId,
      ])
    )[0].result;
  const record = {
    first: "New Fictional",
    last: "Friend Case",
    phone: "08015550998",
    note: "Registered at church desk",
    smsOptIn: false,
  };
  const req = id(++request),
    created = await direct(record, req);
  assert.equal((await direct(record, req)).memberId, created.memberId);
  const own = await read(created.memberId);
  assert.equal(own.detail.person.assigned_to, id(2));
  assert.equal(own.detail.person.status, "visitor");
  assert.equal(
    own.items.find((p) => p.member_id === created.memberId).sms_opt_in,
    false,
  );
  await denied(() => direct(record), "23505");
  await as(3);
  await denied(() => read(created.memberId), "42501");
  await denied(
    () =>
      direct({
        existingId: created.memberId,
        identityConfirmed: "true",
        note: "Try changing another friend case",
      }),
    "42501",
  );
  await as(5);
  await denied(() => direct({ ...record, phone: "08015550997" }), "42501");
  console.log(
    "PASS Friend direct registration, self assignment, idempotent retry, duplicate guard, other-friend isolation, viewer denied",
  );
  const save = async (data, key = id(++request)) =>
    (
      await q("select public.care_programme_save($1::jsonb,$2) result", [
        JSON.stringify(data),
        key,
      ])
    )[0].result;
  await denied(() => save({ title: "Denied" }), "42501");
  await as(1);
  const programme = {
    title: "Fictional Sunday service",
    recurrence: "weekly",
    weekday: 0,
    time: "08:00",
    venue: "Training auditorium",
    description: "Recurring example",
    date: "",
  };
  await q(
    "insert into storage.objects(bucket_id,name) values('care-programme-flyers',$1)",
    [id(1) + "/" + id(999) + ".png"],
  );
  await denied(
    () =>
      q(
        "insert into storage.objects(bucket_id,name) values('care-programme-flyers',$1)",
        [id(2) + "/" + id(999) + ".png"],
      ),
    "42501",
  );
  const key = id(++request),
    saved = await save(programme, key);
  assert.equal(saved.event_date, null);
  assert.equal(saved.weekday, 0);
  assert.equal((await save(programme, key)).id, saved.id);
  await as(5);
  assert.equal((await q("select * from care_programmes")).length, 1);
  await denied(
    () => q("insert into care_programmes(title) values('bypass')"),
    "42501",
  );
  await as(1);
  const edited = await save({
    ...programme,
    id: saved.id,
    version: 1,
    title: "Updated Sunday",
  });
  assert.equal(edited.version, 2);
  await denied(() => save({ ...programme, id: saved.id, version: 1 }), "40001");
  await denied(
    () => save({ ...programme, recurrence: "once", date: "", weekday: null }),
    "23514",
  );
  await denied(() => save({ ...programme, weekday: 9 }), "23514");
  await denied(
    () => save({ ...programme, flyerPath: id(2) + "/" + id(900) + ".png" }),
    "42501",
  );
  await denied(
    () => save({ ...programme, flyerPath: id(1) + "/" + id(998) + ".png" }),
    "22023",
  );
  const withFlyer = await save({
    ...programme,
    id: saved.id,
    version: 2,
    flyerPath: id(1) + "/" + id(999) + ".png",
  });
  assert(withFlyer.flyer_path);
  const one = await save({
    ...programme,
    recurrence: "once",
    date: "2027-01-01",
    weekday: null,
    title: "Fictional New Year",
  });
  assert.equal(one.event_date, "2027-01-01");
  await db.exec("reset role");
  assert.equal(
    (await q("select count(*)::int n from care_programmes"))[0].n,
    2,
  );
  console.log(
    "PASS persisted programmes, recurring without date, one-off date, save retry, RLS, stale edits, invalid schedule and flyer scope",
  );
  const register = (
    await q("select public.care_journey_register(null,'',0,'all','all') result")
  )[0].result;
  assert.equal(
    register.items.find((p) => p.member_id === created.memberId).gender,
    null,
  );
  assert(Array.isArray(register.items[0].cfc_weeks));
  const today = (
    await q("select (now() at time zone 'Africa/Lagos')::date::text d")
  )[0].d;
  for (let n = 200; n < 235; n++)
    await q(
      "insert into care_members(id,other_names,surname,status) values($1,'Fictional report','Case','visitor')",
      [id(n)],
    );
  const report = (
    await q(
      "select public.care_journey_report($1::date-10,$1::date,null,0,30) result",
      [today],
    )
  )[0].result;
  assert.equal(report.rows.length, 30);
  assert.equal(
    report.friend_summary.reduce((n, s) => n + Number(s.people), 0),
    report.total,
  );
  await as(2);
  const friendRegister = (
    await q("select public.care_journey_register(null,'',0,'all','all') result")
  )[0].result;
  assert.equal(friendRegister.items.length, 1);
  assert.equal(friendRegister.items[0].member_id, created.memberId);
  const friendReport = (
    await q(
      "select public.care_journey_report($1::date-10,$1::date,null,0,30) result",
      [today],
    )
  )[0].result;
  assert.equal(friendReport.friend_summary.length, 1);
  assert.equal(friendReport.friend_summary[0].assigned_to, id(2));
  console.log(
    "PASS register field scope and whole-report friend totals independent of 30-row pagination",
  );
} finally {
  await db.close();
}
