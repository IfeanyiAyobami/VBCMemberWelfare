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
    await db.exec((await readFile(file, "utf8")).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", ""));
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
  ok(true, "Migration safely reruns");
  await as(4);
  await denied(() => read(), "42501");
  ok(true, "Editor does not silently become Coordinator");
  await as(1);
  ok(
    (await read()).items.length === 3,
    "Coordinator sees real central records",
  );
  await write("role", {
    worker: id(4),
    capability: "foundation",
    enabled: true,
    note: "Approved Foundation Class Coordinator",
  });
  await write(
    "assign",
    await data(10, { worker: id(2), note: "Initial care assignment" }),
  );
  await as(2);
  ok((await read()).total === 1, "Friend sees only own person");
  await denied(() => read(id(11)), "42501");
  await denied(
    async () =>
      write(
        "join",
        await data(10, { date: "2026-10-01", note: "Unauthorized joining" }),
      ),
    "42501",
  );
  await write(
    "contact",
    await data(10, {
      method: "phone",
      outcome: "positive",
      occurredAt: new Date(Date.now() - 60000).toISOString(),
      note: "Good conversation",
    }),
  );
  ok(
    (await read()).items[0].service_count === 0,
    "Positive contact does not count as attendance",
  );
  await denied(
    async () =>
      write(
        "contact",
        await data(10, {
          method: "phone",
          outcome: "callback",
          occurredAt: new Date().toISOString(),
        }),
      ),
    "22023",
  );
  ok(true, "Callback requires due date");
  await as(1);
  await denied(
    async () =>
      write(
        "join",
        await data(10, { date: "2026-10-01", note: "Too few church services" }),
      ),
    "22023",
  );
  await write("policy", {
    serviceTypes: ["Sunday service", "Midweek service"],
    firstContactHours: 48,
    cfcPolicy:
      "Church-approved assessment and certificate numbering, verified manually by Foundation Coordinator.",
    carePolicy:
      "Coordinator documents contact history and final care assessment.",
    note: "Church approval recorded for isolated fixture only",
  });
  const attendance = {
    date: "2026-09-01",
    serviceKey: "Sunday main",
    serviceType: "Sunday service",
    source: "church_staff",
    verification: "independently_confirmed",
    note: "Church staff register verified",
  };
  await write("attendance", await data(10, attendance));
  await denied(
    async () => write("attendance", await data(10, attendance)),
    "23505",
  );
  await write(
    "attendance",
    await data(10, {
      ...attendance,
      date: "2026-09-08",
      verification: "self_report",
    }),
  );
  ok(
    (await read()).items.find((x) => x.member_id === id(10)).service_count ===
      2,
    "Recorded self-reported services qualify while their evidence level remains explicit",
  );
  await write(
    "attendance",
    await data(10, { ...attendance, date: "2026-09-15" }),
  );
  const joinData = await data(10, {
    date: "2026-09-20",
    note: "Coordinator confirmed actual joining",
  });
  const req = id(9900);
  await write("join", joinData, req);
  await write("join", joinData, req);
  let person = (await read(id(10))).detail.person;
  ok(
    (await read(id(10))).detail.guests[0].id === id(500),
    "Original guest submission and source link survive official joining",
  );
  ok(
    person.official_joined_on === "2026-09-20" &&
      person.care_until === "2027-03-20" &&
      person.assigned_to === id(2),
    "Joining anchors six calendar months and preserves friend",
  );
  await denied(
    async () => write("join", { ...joinData, note: "Changed retry" }, req),
    "22023",
  );
  ok(true, "Request replay cannot change payload");
  await denied(
    () => q("update care_members set status='member' where id=$1", [id(11)]),
    "22023",
  );
  ok(true, "Legacy profile editing cannot bypass official joining");
  await write(
    "assign",
    await data(10, { worker: id(3), note: "Coordinator reassignment" }),
  );
  await as(2);
  ok((await read()).total === 0, "Former friend immediately loses access");
  await denied(() => q("select public.care_followup_list()"), "42501");
  await as(3);
  await write(
    "contact",
    await data(10, {
      method: "phone",
      outcome: "no_further_contact",
      occurredAt: new Date().toISOString(),
      note: "Person requested all contact to stop",
    }),
  );
  ok(!(await read()).items[0].contact_consent, "No-contact disables outreach");
  await denied(
    async () =>
      write(
        "contact",
        await data(10, {
          method: "phone",
          outcome: "positive",
          occurredAt: new Date().toISOString(),
        }),
      ),
    "22023",
  );
  await as(4);
  ok(
    (await read()).items.length === 2,
    "Foundation sees joined and legacy members only",
  );
  ok(
    (await read(id(10))).detail.contacts.length === 0,
    "Foundation-only staff cannot read private outreach notes",
  );
  await write("cohort", { name: "Fictional CFC cohort", date: "2026-09-21" });
  const cohort = (await read()).cohorts[0].id;
  await write("enrol", await data(10, { cohort }));
  await write(
    "class_attendance",
    await data(10, { week: 1, date: "2026-09-22" }),
  );
  ok(
    (await read(id(10))).detail.cfc_attendance.length === 1,
    "Foundation records class attendance",
  );
  await denied(
    async () =>
      write(
        "class_attendance",
        await data(10, { week: 1, date: "2026-09-22" }),
      ),
    "22023",
  );
  await as(1);
  await denied(
    async () =>
      write(
        "care_review",
        await data(10, {
          decision: "complete",
          note: "Trying to finish care too early",
        }),
      ),
    "22023",
  );
  ok(true, "CFC does not shorten six-month care");
  await denied(async () => write("enrol", await data(12, { cohort })), "22023");
  ok(
    (await read(id(12))).detail.person.official_joined_on === null,
    "Legacy dates are never invented",
  );
  await as(5);
  await denied(() => read(), "42501");
  await denied(
    async () =>
      write("role", {
        worker: id(5),
        capability: "coordinator",
        enabled: true,
        note: "Self grant",
      }),
    "42501",
  );
  await db.exec("reset role");
  const rows = await q(
    "select status,joined_on from care_members where id=$1",
    [id(10)],
  );
  ok(
    rows[0].status === "member" && rows[0].joined_on !== "2026-09-20",
    "Official joining preserves original joined_on field",
  );

  // Caller-supplied direct table writes cannot alter official dates or role grants.
  await as(3);
  await denied(
    () =>
      q(
        "update care_journeys set official_joined_on=current_date where member_id=$1",
        [id(10)],
      ),
    "42501",
  );
  await denied(
    () =>
      q("insert into care_journey_roles values($1,'coordinator',$1)", [id(3)]),
    "42501",
  );
  ok(true, "Direct table writes cannot grant roles or rewrite official dates");
  await as(4);
  await denied(
    () =>
      write("role", {
        worker: id(4),
        capability: "coordinator",
        enabled: true,
        note: "Unauthorized self promotion",
      }),
    "42501",
  );
  ok(true, "Foundation role cannot promote itself");
  await as(1);
  await denied(
    async () =>
      write(
        "assign",
        await data(11, {
          worker: id(5),
          note: "Viewer without friend capability",
        }),
      ),
    "22023",
  );
  const stale = await data(11, { intention: "deferred" });
  await write("intention", stale);
  await denied(() => write("intention", stale), "40001");
  ok(true, "Stale edits are rejected rather than overwriting another update");
  await denied(
    async () =>
      write(
        "attendance",
        await data(11, { ...attendance, serviceType: "Home Cell fellowship" }),
      ),
    "22023",
  );
  await denied(
    async () =>
      write(
        "attendance",
        await data(11, { ...attendance, date: "2999-01-01" }),
      ),
    "22023",
  );
  ok(true, "Home Cell and future services cannot qualify");
  await write("policy", {
    serviceTypes: [],
    firstContactHours: 48,
    cfcPolicy: "",
    carePolicy: "",
    note: "Unapproved rules explicitly cleared",
  });
  await write(
    "attendance",
    await data(11, { ...attendance, date: "2026-09-01" }),
  );
  ok(
    (await read(id(11))).detail.person.service_count === 0,
    "Pending service classification never grants eligibility",
  );
  await denied(
    async () =>
      write(
        "complete_cfc",
        await data(10, {
          date: "2026-10-01",
          note: "Unapproved completion attempt",
        }),
      ),
    "22023",
  );
  ok(true, "Unapproved CFC policy blocks completion");
  await write(
    "contact",
    await data(11, {
      method: "phone",
      outcome: "callback",
      occurredAt: new Date().toISOString(),
      nextDue: new Date(Date.now() + 86400000).toISOString(),
      note: "Requested a callback tomorrow",
    }),
  );
  await write(
    "contact",
    await data(11, {
      method: "phone",
      outcome: "no_further_contact",
      occurredAt: new Date().toISOString(),
      note: "Visitor requested all contact stopped",
    }),
  );
  let tasks = (await read(id(11))).detail.tasks;
  ok(tasks.length === 0, "No-contact pauses pending outreach tasks");
  await db.exec("reset role");
  const prefs = (
    await q("select * from care_preferences where member_id=$1", [id(11)])
  )[0];
  ok(
    [
      "contact_consent",
      "email_opt_in",
      "sms_opt_in",
      "celebrations_opt_in",
      "programmes_opt_in",
      "newsletters_opt_in",
    ].every((k) => prefs[k] === false),
    "All requested no-contact preferences remain off despite migration 008 defaults",
  );
  ok(
    (
      await q(
        "select * from care_consent_events where member_id=$1 and new_value=false",
        [id(11)],
      )
    ).length >= 6,
    "No-contact writes six auditable preference changes",
  );
  // Late-month membership uses PostgreSQL calendar arithmetic, not 180-day approximation.
  await as(1);
  await write(
    "legacy_date",
    await data(12, {
      date: "2026-08-31",
      note: "Reliable legacy membership register reviewed",
    }),
  );
  ok(
    (await read(id(12))).detail.person.care_until === "2027-02-28",
    "Month-end anchor clamps to the next calendar month correctly",
  );
  const before = (await read(id(10))).detail.person.version;
  await write("policy", {
    serviceTypes: ["Sunday service"],
    firstContactHours: 48,
    cfcPolicy: "Approved assessment and manual awards.",
    carePolicy: "Approved Coordinator review criteria.",
    note: "Fixture policy approval restored",
  });
  await as(4);
  await write(
    "complete_cfc",
    await data(10, {
      date: "2026-10-01",
      note: "Assessment against church approved rules",
    }),
  );
  await write(
    "certificate",
    await data(10, {
      number: "FIXTURE-CFC-001",
      note: "Certificate awarded from approved register",
    }),
  );
  const c = (await read(id(10))).detail;
  ok(
    c.cfc.certificate_number === "FIXTURE-CFC-001" &&
      c.person.care_status === "ongoing",
    "Certificate award preserves independent continuing-care track",
  );
  await write(
    "class_attendance",
    await data(10, {
      week: 1,
      date: "2026-09-23",
      correction: "on",
      note: "Corrected class register date from original evidence",
    }),
  );
  ok(
    (await read(id(10))).detail.cfc_attendance[0].attended_on === "2026-09-23",
    "Foundation can correct class attendance with an audit reason",
  );
  await as(1);
  const original = (await read(id(10))).detail.attendance.filter(
    (a) => !a.voided_at,
  );
  for (const entry of original.slice(0, 2))
    await write(
      "void_attendance",
      await data(10, {
        attendanceId: entry.id,
        note: "Administrator correction of erroneous service evidence",
      }),
    );
  let reviewed = (await read(id(10))).detail;
  ok(
    reviewed.person.membership_review &&
      reviewed.person.status === "member" &&
      reviewed.guests[0].id === id(500),
    "Post-joining corrections flag evidence review without deleting membership or guest history",
  );
  await denied(
    async () =>
      write(
        "review_membership",
        await data(10, { note: "Insufficient evidence remains" }),
      ),
    "22023",
  );
  await write(
    "attendance",
    await data(10, { ...attendance, date: original[0].service_date }),
  );
  await write(
    "review_membership",
    await data(10, {
      note: "Administrator reconciled the two original qualifying services",
    }),
  );
  reviewed = (await read(id(10))).detail;
  ok(
    !reviewed.person.membership_review &&
      reviewed.attendance.filter((a) => a.voided_at).length === 2,
    "Reconciled evidence clears review flag while original voided records remain",
  );
  const deferred = (
    await q(
      "select public.care_journey_read(null,'',0,'membership','deferred') result",
    )
  )[0].result;
  ok(
    deferred.items.some((p) => p.member_id === id(11)),
    "Membership queue retains deferred visitors rather than losing them",
  );
  await db.exec("reset role");
  for (let n = 100; n < 165; n++)
    await q(
      "insert into care_members(id,surname,other_names,status) values($1,'Pagination','Fictional visitor','visitor')",
      [id(n)],
    );
  await as(1);
  const paged = await read();
  ok(
    paged.items.length === 30 &&
      paged.total === 68 &&
      paged.stats.visitors === 66,
    "Pagination retains server-wide scoped totals instead of counting only loaded rows",
  );
  await db.exec("reset role;set role anon");
  await denied(() => q("select care_journey_read()"), "42501");
  ok(true, "Anonymous callers cannot read any journey data");
  await db.exec('reset role');
  const [cell]=await q('select id from hco_cells order by id limit 1');
  const hcoPayload={request_id:id(9988),cell_id:cell.id,source:'form',confirm_existing:true,rows:[{first:'Fictional',last:'Home Cell Onboard',phone:'+2348015550944',email:'fictional.onboard@example.invalid',joined:'2026-10-01',birthday:'',anniversary:'',occupation:'',address:'',email_opt_in:false,sms_opt_in:false}]};
  const [{result:hco}]=await q('select hco_onboard_members($1,$2::jsonb) result',[id(1),JSON.stringify(hcoPayload)]);
  const [onboarded]=await q('select m.status,j.official_joined_on,p.email_opt_in,p.sms_opt_in from care_members m join care_journeys j on j.member_id=m.id join care_preferences p on p.member_id=m.id where m.id=$1',[hco[0].member_id]);
  ok(onboarded.status==='new_member'&&onboarded.official_joined_on===null&&!onboarded.email_opt_in&&!onboarded.sms_opt_in,'Complete migration chain preserves Home Cell onboarding, preference opt-outs and central journey linkage');
  console.log(`Journey database checks passed: ${count}`);
} catch (e) {
  console.error(e.message, e.code, e.where);
  process.exitCode = 1;
} finally {
  await db.close();
}
