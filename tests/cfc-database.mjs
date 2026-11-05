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

 await db.exec("alter table auth.users add column email text,add column raw_app_meta_data jsonb default '{}'::jsonb");
 for(const file of ["017_visitor_journey.sql","018_member_care_integration.sql","019_journey_reporting.sql","020_whatsapp_dual_sending.sql","021_journey_queue_filters.sql","022_friend_direct_registration.sql","023_saved_programmes.sql","024_follow_through_registers.sql","025_historical_guests.sql","026_celebration_greetings.sql","027_friend_pin_accounts.sql","028_follow_through_scope_and_dates.sql","029_friend_assignment_without_reason.sql","030_home_cell_leader_pins.sql","031_cfc_leader_dashboard.sql"]) await db.exec(await readFile("supabase/"+file,"utf8"));
 await db.exec(await readFile("supabase/031_cfc_leader_dashboard.sql","utf8"));
 console.log('PASS migrations through 031 and rerun');
 await db.exec('reset role');
 await q("insert into care_journey_roles(user_id,capability,granted_by) values($1,'coordinator',$1) on conflict do nothing",[id(1)]);
 await q("update care_journeys set official_joined_on='2026-01-01' where member_id=$1",[id(12)]);
 const hash='a'.repeat(32)+':'+ 'b'.repeat(128);
 await q("select care_cfc_pin_save($1,$2,'CFC Leader','leader@test.invalid',null,$3)",[id(1),id(3),hash]);
 await assert.rejects(q("select care_cfc_pin_save($1,$2,'Other Leader','other@test.invalid',null,$3)",[id(1),id(2),hash]));
 await as(3);
 const call=(action,data)=>q('select care_cfc_write($1,$2::jsonb)',[action,JSON.stringify(data)]);
 const snapshot=async()=>(await q("select care_cfc_read('') as v"))[0].v;
 await call('cohort',{name:'Cohort A',date:'2026-01-01'});await call('cohort',{name:'Cohort B',date:'2026-03-01'});
 const cohorts=(await snapshot()).cohorts;const a=cohorts.find(c=>c.name==='Cohort A').id,b=cohorts.find(c=>c.name==='Cohort B').id;
 await call('enrol',{member:id(12),cohort:a});await call('enrol',{member:id(12),cohort:b});
 await assert.rejects(call('enrol',{member:id(10),cohort:a}),/official membership/);
 for(let n=1;n<=7;n++)await call('session',{cohort:a,lesson:n,date:'2026-01-10',topic:'Class '+n});
 for(const s of (await snapshot()).sessions.filter(s=>s.cohort_id===a)) await call('attendance',{member:id(12),session:s.id,status:s.lesson===3?'absent':'present'});
 assert.equal((await snapshot()).people[0].attendance.filter(x=>x.status==='present').length,6);
 await assert.rejects(call('submit',{member:id(12)}),/seven distinct/);
 await call('session',{cohort:b,lesson:3,date:'2026-03-10',topic:'Make-up Class 3'});
 const makeup=(await snapshot()).sessions.find(s=>s.cohort_id===b);
 await call('attendance',{member:id(12),session:makeup.id,status:'present'});
 let p=(await snapshot()).people[0];assert.equal(new Set(p.attendance.filter(x=>x.status==='present').map(x=>x.lesson)).size,7);assert.equal(p.attendance.length,8);
 await call('attendance',{member:id(12),session:makeup.id,status:'present'});assert.equal((await snapshot()).people[0].attendance.length,8);
 await assert.rejects(call('attendance',{member:id(12),session:makeup.id,status:'absent'}),/correction reason/);
 await db.exec('reset role');
 await q("update care_journey_cfc_attendance set attendance_status='absent',attended_on='2026-01-10' where member_id=$1 and week=3",[id(12)]);
 await db.exec(await readFile('supabase/031_cfc_leader_dashboard.sql','utf8'));
 await as(3);assert.equal((await snapshot()).people[0].attendance.length,8);
 await call('submit',{member:id(12)});await assert.rejects(call('approve',{member:id(12)}),/coordinator access/);
 await assert.rejects(q("select care_journey_register(null,'',0,'all','all')"),/access/);
 await assert.rejects(q('select * from care_cfc_leaders'),/permission denied/);
 await as(2);await assert.rejects(snapshot(),/CFC access/);
 await as(1);await call('approve',{member:id(12)}).catch(()=>{});
 await db.exec('reset role');await q("update care_journey_policy set cfc_policy='All seven distinct classes and coordinator review' where id=1");
 await as(1);await call('approve',{member:id(12)});assert.ok((await snapshot()).people[0].completed_on);
 await call('suspend',{leader:id(3)});await as(3);await assert.rejects(snapshot(),/CFC access/);
 console.log('PASS single leader, leader-owned cohorts/enrolment, cross-cohort Class 3 make-up, 7 distinct classes, retry deduplication, history, correction guards, review/approval, no full journey access, RLS and suspension');
}finally{await db.close();}
