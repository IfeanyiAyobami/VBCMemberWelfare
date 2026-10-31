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
  await as(1);
  await denied(
    async () =>
      write(
        "join",
        await data(10, {
          date: "2026-10-01",
          note: "No previous attendance is documented",
        }),
      ),
    "22023",
  );
  const attendance = {
    date: "2026-09-01",
    serviceKey: "VBC church visit",
    serviceType: "Sunday service",
    source: "phone",
    verification: "self_report",
    note: "",
  };
  await write("attendance", await data(10, attendance));
  ok(
    (await read(id(10))).detail.person.service_count === 1,
    "One reported VBC church visit is retained without an invented screening policy",
  );
  await write(
    "intention",
    await data(10, {
      intention: "invited",
      note: "Invited for upcoming membership Sunday",
    }),
  );
  await write(
    "join",
    await data(10, {
      date: "2026-09-20",
      note: "Coordinator confirmed official membership after one previous visit",
    }),
  );
  let p = (await read(id(10))).detail.person;
  ok(
    p.official_joined_on === "2026-09-20" && p.care_until === "2027-03-20",
    "One previous visit permits explicit joining and starts six calendar months of care",
  );
  ok(
    (await read(id(10))).detail.guests[0].id === id(500),
    "Original guest link survives the new eligibility rule",
  );
  await write(
    "attendance",
    await data(11, { ...attendance, date: "2026-10-01" }),
  );
  await denied(
    async () =>
      write(
        "join",
        await data(11, {
          date: "2026-10-01",
          note: "Attempting same day first visit and joining",
        }),
      ),
    "22023",
  );
  ok(true, "Unapproved same-day first-time joining remains blocked");
  const direct = async (d, r = id(++request)) =>
    (
      await q("select care_journey_direct($1::jsonb,$2) result", [
        JSON.stringify(d),
        r,
      ])
    )[0].result;
  const card = {
    first: "Direct",
    last: "Fixture",
    phone: "+2348015550912",
    email: "direct.fixture@example.invalid",
    note: "Walk-in Membership Sunday registration; prior attendance not yet documented",
  };
  const req = id(899);
  const created = await direct(card, req);
  await direct(card, req);
  ok(
    created.memberId &&
      (await read(created.memberId)).detail.person.registration_source ===
        "direct",
    "Direct registration creates one central person without requiring a guest submission",
  );
  await denied(() => direct(card), "23505");
  await denied(() => direct({ ...card, first: "Changed retry" }, req), "22023");
  const dperson = (await read(created.memberId)).detail.person;
  await denied(
    () =>
      write("join", {
        memberId: created.memberId,
        version: dperson.version,
        date: "2026-10-01",
        note: "No attendance evidence supplied",
      }),
    "22023",
  );
  await direct({
    existingId: created.memberId,
    identityConfirmed: true,
    note: "Same walk-in person, previous attendance confirmed",
    previousVisitDate: "2026-09-13",
    visitEvidence: "Visitor reported VBC attendance on this date",
  });
  const dp = (await read(created.memberId)).detail.person;
  await write("join", {
    memberId: created.memberId,
    version: dp.version,
    date: "2026-09-27",
    note: "Coordinator confirmed direct joiner after known previous visit",
  });
  ok(
    (await read(created.memberId)).detail.person.official_joined_on ===
      "2026-09-27",
    "Direct joiner can become a member without an online guest form",
  );
  await write(
    "assign",
    await data(11, {
      worker: id(2),
      note: "Assigned a named follow-through friend",
    }),
  );
  await as(2);
  await write(
    "purpose",
    await data(11, {
      purpose: "special_occasion",
      note: "Visitor attended thanksgiving",
    }),
  );
  await write(
    "support",
    await data(11, {
      note: "Fictional welfare request for pastoral follow-up",
    }),
  );
  await write(
    "followup_state",
    await data(11, {
      state: "paused",
      note: "Visitor requested a temporary pause",
    }),
  );
  ok(
    (await read(id(11))).detail.person.followup_state === "paused",
    "Assigned friend can classify and pause a visitor without blocking membership",
  );
  await denied(
    async () =>
      write(
        "ministry_add",
        await data(11, {
          team: "Choir",
          responsibility: "Singer",
          date: "2026-10-01",
        }),
      ),
    "42501",
  );
  await as(1);
  await write(
    "ministry_add",
    await data(10, {
      team: "Choir",
      responsibility: "Singer",
      date: "2026-09-21",
    }),
  );
  await write(
    "ministry_add",
    await data(10, { team: "Media", responsibility: "Volunteer", date: "" }),
  );
  let ministries = (await read(id(10))).detail.ministry;
  ok(
    ministries.length === 2 && ministries.some((x) => x.joined_on === null),
    "Multiple ministry teams retain unknown joining dates",
  );
  const choir = ministries.find((x) => x.team_name === "Choir");
  await write(
    "ministry_end",
    await data(10, {
      ministryId: choir.id,
      date: "2026-10-01",
      note: "Moved to a different activity team",
    }),
  );
  ok(
    (await read(id(10))).detail.ministry.length === 2,
    "Ending a ministry assignment preserves its history",
  );
  await denied(
    async () =>
      write(
        "ministry_add",
        await data(10, {
          team: "Media",
          responsibility: "Duplicate",
          date: "",
        }),
      ),
    "23505",
  );
  const report = async (worker = null) =>
    (
      await q(
        "select care_journey_report('2026-08-01','2026-10-01',$1,0,1000) result",
        [worker],
      )
    )[0].result;
  let rep = await report();
  ok(
    rep.scoreboard.direct_joiners === 1,
    "Reporting identifies direct joiners separately",
  );
  ok(
    rep.scoreboard.new_visitors >= 1 &&
      rep.rows.some((x) => x.registration_source === "direct"),
    "Reports preserve visitor and direct intake attribution",
  );
  await as(2);
  rep = await report();
  ok(
    rep.rows.every((x) => x.assigned_to === id(2)),
    "Friend reports include only currently assigned people",
  );
  await denied(() => report(id(3)), "42501");
  await denied(
    () =>
      direct({
        ...card,
        phone: "+2348015550913",
        email: "another@example.invalid",
      }),
    "42501",
  );
  await as(1);
  await write("role", {
    worker: id(4),
    capability: "foundation",
    enabled: true,
    note: "Foundation Coordinator assignment",
  });
  await as(4);
  await denied(() => report(), "42501");
  ok(true, "Foundation-only role cannot export outreach contact data");
  await db.exec("reset role");
  const [cell] = await q("select id from hco_cells limit 1");
  await q("insert into hco_member_cells(member_id,cell_id) values($1,$2)", [
    id(10),
    cell.id,
  ]);
  await as(1);
  ok(
    (await read(id(10))).detail.home_cells[0].cell_id === cell.id,
    "Profile reuses the existing Home Cell membership table",
  );
  await db.exec("reset role;set role anon");
  await denied(
    () => q("select care_journey_report('2026-08-01','2026-10-01')"),
    "42501",
  );
  await as(1);
  const unknown = await direct({
    first: "Undated",
    last: "Previous Visit",
    phone: "+2348015550966",
    note: "Person confirms a previous VBC visit without remembering its exact date",
    previousVisitConfirmed: true,
    beforeDate: "2026-09-27",
    visitEvidence:
      "Visitor confirms attending VBC before 27 September; exact service date unknown",
  });
  let up = (await read(unknown.memberId)).detail.person;
  ok(
    up.service_count === 0 && up.previous_visit_confirmed,
    "Undated previous attendance is a separate fact, not an invented service date",
  );
  await write("join", {
    memberId: unknown.memberId,
    version: up.version,
    date: "2026-09-27",
    note: "Coordinator confirmed joining based on the documented previous-visit claim",
  });
  ok(
    (await read(unknown.memberId)).detail.person.official_joined_on ===
      "2026-09-27",
    "Known previous attendance permits joining even when the exact visit date is unknown",
  );
  let unknownDetail = (await read(unknown.memberId)).detail;
  await write("void_previous_visit", {
    memberId: unknown.memberId,
    version: unknownDetail.person.version,
    visitId: unknownDetail.previous_visits[0].id,
    note: "Coordinator corrected a mistaken previous-visit confirmation",
  });
  ok(
    (await read(unknown.memberId)).detail.person.membership_review,
    "Voiding the only visit claim flags joined membership for review",
  );
  await write("cohort", { name: "V38 CFC cohort", date: "2026-09-21" });
  const cohort = (await read()).cohorts[0].id;
  await write("enrol", await data(10, { cohort, date: "2026-09-21" }));
  await write(
    "class_attendance",
    await data(10, {
      week: 1,
      date: "2026-09-22",
      attendanceStatus: "absent",
      note: "Actual class register marks absence",
    }),
  );
  await write(
    "class_attendance",
    await data(10, {
      week: 2,
      date: "2026-09-29",
      attendanceStatus: "present",
      note: "Actual class register confirms attendance",
    }),
  );
  let cls = (await read(id(10))).detail.cfc_attendance;
  ok(
    cls.filter((x) => x.attendance_status === "absent").length === 1 &&
      cls.filter((x) => x.attendance_status === "present").length === 1,
    "Missed classes are explicitly recorded and distinguished from unknown weeks",
  );
  await write(
    "class_attendance",
    await data(10, {
      week: 1,
      date: "2026-09-22",
      attendanceStatus: "present",
      correction: "on",
      note: "Register correction with actual evidence",
    }),
  );
  ok(
    (await read(id(10))).detail.cfc_attendance.every(
      (x) => x.attendance_status === "present",
    ),
    "Class corrections retain the audit reason and update present/absent status",
  );
  rep = await report();
  ok(
    rep.scoreboard.cfc_enrolments_in_period === 1,
    "Monthly/quarterly reporting uses the actual CFC enrolment date",
  );
  ok(
    rep.rows.find((x) => x.member_id === id(10)).cohort_date === "2026-08-30",
    "Earlier reported first visit is preserved as the cohort date instead of being overwritten by a later return visit",
  );
  await write("policy", {
    serviceTypes: [],
    firstContactHours: 48,
    cfcPolicy: "Approved manual assessment and award rules.",
    carePolicy: "Approved documented care review.",
    note: "Fixture church policy approval",
  });
  await write(
    "complete_cfc",
    await data(10, {
      date: "2026-09-30",
      note: "Foundation Coordinator assessed completion against approved rules",
    }),
  );
  await write(
    "certificate",
    await data(10, {
      number: "V38-FIXTURE-001",
      date: "2026-10-01",
      note: "Certificate award recorded from the actual register",
    }),
  );
  rep = await report();
  ok(
    rep.scoreboard.certificate_awards_in_period === 1 &&
      rep.rows.find((x) => x.member_id === id(10)).care_status === "ongoing",
    "Actual certificate award date appears in period reporting without ending continuing care",
  );
  await denied(
    () => q("select care_journey_report('2026-10-01','2999-01-01')"),
    "22023",
  );
  ok(
    !JSON.stringify(rep).includes("Fictional welfare request"),
    "Private welfare/support notes never appear in the standard report",
  );
  await as(2);
  await denied(
    async () =>
      write(
        "contact",
        await data(11, {
          method: "phone",
          outcome: "positive",
          occurredAt: new Date().toISOString(),
          note: "Attempt while paused",
        }),
      ),
    "22023",
  );
  await write(
    "followup_state",
    await data(11, {
      state: "active",
      note: "Visitor agreed to resume ordinary contact",
    }),
  );
  await write(
    "contact",
    await data(11, {
      method: "phone",
      outcome: "no_further_contact",
      occurredAt: new Date().toISOString(),
      note: "Visitor requested all future contact to stop",
    }),
  );
  await denied(
    async () =>
      write(
        "followup_state",
        await data(11, {
          state: "active",
          note: "Cannot override an explicit opt-out",
        }),
      ),
    "22023",
  );
  ok(
    (await read(id(11))).detail.person.followup_state === "declined_contact",
    "Declined-contact category cannot be resumed without separately restoring contact permission",
  );
  await as(1);
  const beforeArchive = await report();
  await db.exec("reset role");
  await q("update care_members set archived_at=now() where id=$1", [id(11)]);
  await as(1);
  const afterArchive = await report();
  ok(
    afterArchive.scoreboard.new_visitors ===
      beforeArchive.scoreboard.new_visitors &&
      afterArchive.rows.some((r) => r.member_id === id(11)),
    "Archiving a case does not erase it from Coordinator historical reports or inflate visitor conversion",
  );
  await as(2);
  ok(
    !(await report()).rows.some((r) => r.member_id === id(11)),
    "Assigned friends cannot export archived records",
  );
  await as(1);
  const firstToday = await direct({
    first: "Today",
    last: "Direct Visit",
    phone: "+2348015550955",
    previousVisitDate: new Date().toISOString().slice(0, 10),
    visitEvidence: "Actual first church attendance on this date",
    note: "Direct intake allowed even when the first actual visit is today",
  });
  let ft = (await read(firstToday.memberId)).detail.person;
  ok(
    ft.service_count === 1,
    "Today’s first visit can be recorded during direct registration without inventing an earlier visit",
  );
  await denied(
    () =>
      write("join", {
        memberId: firstToday.memberId,
        version: ft.version,
        date: new Date().toISOString().slice(0, 10),
        note: "Unapproved same-day exception",
      }),
    "22023",
  );
  await as(1);
  await write("role", {
    worker: id(4),
    capability: "friend",
    enabled: true,
    note: "Temporary friend capability for revocation check",
  });
  await write(
    "assign",
    await data(10, {
      worker: id(4),
      note: "Assigned Foundation staff as friend for access check",
    }),
  );
  await write(
    "support",
    await data(10, {
      note: "Private support information for capability revocation fixture",
    }),
  );
  await as(4);
  ok(
    (await read(id(10))).detail.welfare.length > 0,
    "Assigned friend with Foundation capability can read own private support",
  );
  await as(1);
  await write("role", {
    worker: id(4),
    capability: "friend",
    enabled: false,
    note: "Remove friend capability but retain Foundation",
  });
  await as(4);
  const restricted = (await read(id(10))).detail;
  ok(
    restricted.welfare.length === 0 &&
      restricted.contacts.length === 0 &&
      restricted.person.phone == null,
    "Removing friend capability immediately removes outreach/private support access despite an old assignment",
  );

  await db.exec("reset role");
  await db.exec(
    await readFile("supabase/020_whatsapp_dual_sending.sql", "utf8"),
  );
  await db.exec(
    await readFile("supabase/020_whatsapp_dual_sending.sql", "utf8"),
  );
  const rpc = async (name, args = []) => (await q(name, args))[0]?.result;
  const wa = (m) => rpc("select public.care_wa_read($1) result", [m]);
  await as(1);
  const person = (
    await direct({
      first: "WhatsApp",
      last: "Fixture",
      phone: "+2348015550888",
      note: "WhatsApp dual sending database fixture",
    })
  ).memberId;
  const campaign = await rpc(
    "select public.care_wa_campaign($1,$2,$3,$4) result",
    ["Sunday invitation", "Hello {{1}}", "vbc_sunday", "en"],
  );
  const prep = (mode, req = id(++request), body = "Hello fictional visitor") =>
    rpc("select public.care_wa_prepare($1,$2,$3,$4,$5) result", [
      person,
      campaign,
      mode,
      body,
      req,
    ]);
  const manual = await prep("assisted");
  ok(
    manual.state === "opened",
    "Preparing WhatsApp handoff never records a sent message",
  );
  await denied(() => prep("api"), "22023");
  await q(
    "select public.care_wa_permission($1,true,'Visitor explicitly agreed to WhatsApp messages')",
    [person],
  );
  const apiId = id(++request),
    a = await prep("api", apiId);
  ok(
    a.state === "queued",
    "API invitation requires explicit WhatsApp permission",
  );
  ok(
    (await prep("api", apiId)).replayed,
    "Same API request safely replays without another message",
  );
  await denied(() => prep("api"), "23505");
  ok(
    true,
    "A second API request for the same person/campaign cannot duplicate a paid invitation",
  );
  await as(2);
  await denied(() => wa(person), "42501");
  await denied(
    () =>
      rpc(
        "select public.care_wa_campaign('Unauthorized','Hello',null,'en') result",
      ),
    "42501",
  );
  await as(1);
  await write("assign", {
    memberId: person,
    version: (await read(person)).detail.person.version,
    worker: id(2),
    note: "Assigned friend for WhatsApp scope check",
  });
  await as(2);
  ok(
    (await wa(person)).messages.length === 2,
    "Assigned friend sees scoped invitation history",
  );
  await denied(() => prep("api"), "42501");
  await denied(
    () => q("select public.care_wa_claim($1,100)", [apiId]),
    "42501",
  );
  const service = async () => {
    await db.exec("reset role;set role service_role");
  };
  await service();
  const claim = await rpc("select public.care_wa_claim($1,100) result", [
    apiId,
  ]);
  ok(claim.id === apiId, "Service dispatch claims the API invitation once");
  ok(
    (await rpc("select public.care_wa_claim($1,100) result", [apiId])) === null,
    "Second dispatcher cannot send the same invitation",
  );
  await q("select public.care_wa_finish($1,'unknown',null,'timeout')", [apiId]);
  const status = (state, time = "1793448000") =>
    q("select public.care_wa_webhook($1::jsonb,'[]'::jsonb)", [
      JSON.stringify([
        {
          id: "wamid.fixture",
          callback: apiId,
          recipient: "2348015550888",
          timestamp: time,
          status: state,
        },
      ]),
    ]);
  await status("delivered");
  await status("sent");
  await status("failed");
  await as(1);
  ok(
    (await wa(person)).messages.find((x) => x.id === apiId).state ===
      "delivered",
    "Callback correlation resolves uncertain dispatch and out-of-order events never downgrade delivery",
  );
  await service();
  await status("read");
  await status("delivered");
  await q("select public.care_wa_finish($1,'accepted','wamid.fixture',null)", [
    apiId,
  ]);
  await as(1);
  ok(
    (await wa(person)).messages.find((x) => x.id === apiId).state === "read",
    "Late HTTP acknowledgement never overwrites a read receipt",
  );
  const before = (await read(person)).detail.contacts.length;
  await q(
    "select public.care_wa_record($1,'sent','Staff sent flyer but no reply yet',null)",
    [manual.id],
  );
  await q(
    "select public.care_wa_record($1,'sent','Staff sent flyer but no reply yet',null)",
    [manual.id],
  );
  const detail = (await read(person)).detail;
  ok(
    detail.contacts.length === before + 1 && !detail.contacts[0].successful,
    "Staff-reported sent activity is idempotent and is not a successful conversation",
  );
  await service();
  const reply = JSON.stringify([
    {
      id: "reply.stop",
      from: "2348015550888",
      timestamp: "1793448000",
      body: "STOP",
    },
  ]);
  await q("select public.care_wa_webhook('[]'::jsonb,$1::jsonb)", [reply]);
  await q("select public.care_wa_webhook('[]'::jsonb,$1::jsonb)", [reply]);
  await as(1);
  const stopped = await wa(person);
  ok(
    stopped.replies.length === 1 && !stopped.permission.allowed,
    "Inbound replies deduplicate and STOP disables further WhatsApp outreach",
  );
  await denied(() => prep("assisted", manual.id), "22023");
  await q(
    "select public.care_wa_permission($1,true,'Fresh explicit WhatsApp permission after opt-out')",
    [person],
  );
  const campaign2 = await rpc(
    "select public.care_wa_campaign('Second invitation','Hello {{1}}','vbc_sunday','en') result",
  );
  const second = await rpc(
    "select public.care_wa_prepare($1,$2,'api','unused',$3) result",
    [person, campaign2, id(++request)],
  );
  await service();
  await q("select public.care_wa_claim($1,1)", [second.id]);
  await as(1);
  ok(
    (await wa(person)).messages.find((x) => x.id === second.id).error_code ===
      "daily_limit_reached",
    "Global daily dispatch cap blocks excess paid sends",
  );
  const campaign3 = await rpc(
    "select public.care_wa_campaign('Third invitation','Hello {{1}}','vbc_sunday','en') result",
  );
  const third = await rpc(
    "select public.care_wa_prepare($1,$2,'api','unused',$3) result",
    [person, campaign3, id(++request)],
  );
  await q(
    "select public.care_wa_permission($1,false,'Visitor changed permission before dispatch')",
    [person],
  );
  await service();
  ok(
    (await rpc("select public.care_wa_claim($1,100) result", [third.id])) ===
      null,
    "Permission changes before dispatch prevent API sending",
  );
  await as(4);
  await denied(() => wa(person), "42501");
  ok(true, "Foundation-only staff cannot read WhatsApp conversations");
  await as(1);
  await q(
    "select public.care_wa_permission($1,true,'WhatsApp permission confirmed for recovery fixture')",
    [person],
  );
  const campaign4 = await rpc(
    "select public.care_wa_campaign('Retry fixture','Hello {{1}}','vbc_sunday','en') result",
  );
  const rejected = await rpc(
    "select public.care_wa_prepare($1,$2,'api','unused',$3) result",
    [person, campaign4, id(++request)],
  );
  await service();
  await q("select public.care_wa_claim($1,100)", [rejected.id]);
  await q(
    "select public.care_wa_finish($1,'failed',null,'template_check_unavailable')",
    [rejected.id],
  );
  await as(1);
  const retried = await rpc(
    "select public.care_wa_prepare($1,$2,'api','unused',$3) result",
    [person, campaign4, id(++request)],
  );
  ok(
    retried.id !== rejected.id,
    "Definitely rejected sends allow an explicit new attempt while retaining the old attempt",
  );
  await service();
  await q("select public.care_wa_claim($1,100)", [retried.id]);
  await q("select public.care_wa_finish($1,'unknown',null,'timeout')", [
    retried.id,
  ]);
  await as(1);
  await denied(
    () =>
      rpc("select public.care_wa_prepare($1,$2,'api','unused',$3) result", [
        person,
        campaign4,
        id(++request),
      ]),
    "23505",
  );
  ok(
    true,
    "Uncertain provider results still prevent another API attempt for the same campaign",
  );
  await db.exec('reset role');
  await q("update public.care_members set phone='+2348015550777' where id=$1",[person]);
  await service();await q("select public.care_wa_webhook('[]'::jsonb,$1::jsonb)",[JSON.stringify([{id:'reply.old-number',from:'2348015550888',timestamp:'1793448000',body:'Reply from a number no longer attached to this person'}])]);
  await as(1);ok((await wa(person)).replies.length===1,"Replies from a former phone number are not attributed to the person after their contact changes");
  console.log(
    `WhatsApp integration checks passed; ${count} combined journey and WhatsApp checks`,
  );
} catch (e) {
  console.error(e.message, e.code, e.where);
  process.exitCode = 1;
} finally {
  await db.close();
}
