import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
const db = new PGlite();
let count = 0;
const ok = (x, m) => {
  assert(x, m);
  count++;
  console.log("PASS", m);
};
await db.exec(
  `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now());create schema care_private;create function care_private.valid_month_day(integer,integer) returns boolean language sql as $$ select true $$;create table care_staff(user_id uuid primary key references auth.users(id),role text,is_active boolean);`,
);
const fixture = fs.readFileSync(
  root + "/tests/fixtures/001_care_schema.sql",
  "utf8",
);
await db.exec(
  fixture.slice(
    fixture.indexOf("create table public.care_members ("),
    fixture.indexOf("create table public.care_preferences ("),
  ),
);
await db.exec(
  fixture.slice(
    fixture.indexOf("create table public.care_guest_submissions ("),
    fixture.indexOf("create table public.care_notes ("),
  ),
);
await db.exec(
  `alter table care_guest_submissions add column entered_by uuid references auth.users(id);alter table care_guest_submissions add column consent_evidence text;`,
);
await db.exec(
  fs
    .readFileSync(root + "/supabase/009_home_cell_office.sql", "utf8")
    .replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", ""),
);
await db.exec(
  fs.readFileSync(root + "/supabase/011_home_cell_workflows.sql", "utf8"),
);
ok(
  true,
  "009 + 011 parse and apply against original Member Care fixture columns",
);

// v4.13 regression fixtures, no real accounts.
await db.exec(`alter table auth.users add column email text,add column phone text,add column raw_app_meta_data jsonb default '{}';create table care_journey_roles(user_id uuid,capability text);`);
for(const name of ['013_home_cell_phone_usernames.sql','014_home_cell_member_onboarding.sql','030_home_cell_leader_pins.sql','033_leader_app.sql']) await db.exec(fs.readFileSync(root+'/supabase/'+name,'utf8'));
const migration = fs.readFileSync(root+'/supabase/034_global_home_cell_coordinators.sql','utf8');
const separate = fs.readFileSync(root+'/supabase/035_separate_home_cell_logins.sql','utf8');
const uid=n=>`80000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const admin=uid(1),owner=uid(2),alias=uid(3),coord=uid(4),outsider=uid(5);
await db.query(`insert into auth.users(id,email) values($1,'admin@test.invalid'),($2,'owner@example.test'),($3,$6),($4,'coord@example.test'),($5,'outsider@example.test')`,[admin,owner,alias,coord,outsider,'cell-'+owner+'@home-cell.invalid']);
await db.query(`update auth.users set raw_app_meta_data=jsonb_build_object('hco_cell_login_for',$1::text) where id=$2`,[owner,alias]);
await db.query(`insert into care_staff values($1,'administrator',true)`,[admin]);
const area=(await db.query(`insert into hco_areas(name) values('Area A') returning id`)).rows[0].id;
const areaB=(await db.query(`insert into hco_areas(name) values('Area B') returning id`)).rows[0].id;
const cell=(await db.query(`insert into hco_cells(area_id,name) values($1,'Cell A') returning id`,[area])).rows[0].id;
const cellB=(await db.query(`insert into hco_cells(area_id,name) values($1,'Cell B') returning id`,[areaB])).rows[0].id;
await db.query(`insert into hco_assignments(user_id,role,area_id,cell_id) values($1,'coordinator',$3,null),($1,'coordinator',$4,null),($2,'cell_leader',null,$5),($2,'church_admin',null,null)`,[coord,owner,area,areaB,cell]);
await db.exec(migration);await db.exec(migration);await db.exec(separate);await db.exec(separate);
ok(true,'034 and 035 apply and rerun');
ok((await db.query(`select count(*)::int n from hco_assignments where user_id=$1 and active and role='coordinator'`,[coord])).rows[0].n===1,'Existing area Coordinator roles consolidate without deleting history');
ok((await db.query(`select area_id from hco_assignments where user_id=$1 and active and role='coordinator'`,[coord])).rows[0].area_id===null,'Coordinator is church-wide');
const write=async(who,action,data)=>(await db.query('select hco_leadership_write($1,$2,$3) v',[who,action,JSON.stringify(data)])).rows[0].v;
await write(admin,'add_role',{user_id:outsider,role:'coordinator',reason:'Church-wide appointment'});
ok(true,'Create Coordinator with no area or cell');
await assert.rejects(write(coord,'add_role',{user_id:alias,role:'church_admin',reason:'Cannot promote'}));ok(true,'Coordinator cannot grant administrator roles');
await db.query(`insert into auth.users(id,email) values($1,'newleader@test.invalid')`,[uid(6)]);
const assigned=await write(coord,'add_role',{user_id:uid(6),role:'cell_leader',cell_id:cellB,reason:'Assign across areas'});ok(!!assigned.id,'Coordinator assigns a leader in any area');
const hash='a'.repeat(32)+':'+ 'b'.repeat(128);
const save=async(who=admin)=>db.query('select hco_cell_login_save($1,$2,$3,$4)',[who,owner,alias,hash]);
await assert.rejects(save(coord));ok(true,'Only Church Admin provisions a privileged person’s separate leader login');
await assert.rejects(db.query('select hco_cell_login_save($1,$2,$3,$4)',[owner,owner,alias,hash]));ok(true,'Self-provisioning is denied');
await save();ok(true,'Admin provisions linked PIN while keeping staff roles on owner');
const attempt=async(identity='owner@example.test')=>(await db.query('select hco_leader_pin_attempt($1) v',[identity])).rows[0].v;
const first=await attempt();ok(first.user_id===alias,'Public email + PIN resolves only to separate leader Auth identity');
await db.query('insert into hco_phone_usernames(phone,user_id) values($1,$2)',['+2348035550161',owner]);
ok((await attempt('+2348035550161')).user_id===alias,'Owner phone also resolves to leader identity');
ok((await db.query(`select count(*)::int n from hco_assignments where user_id=$1 and active and role<>'cell_leader'`,[alias])).rows[0].n===0,'PIN identity has no administrator or Coordinator assignment');
ok((await db.query(`select count(*)::int n from care_staff where user_id=$1`,[alias])).rows[0].n===0,'PIN identity has no main dashboard staff account');
ok((await db.query(`select count(*)::int n from hco_leader_pin_accounts where user_id=$1`,[owner])).rows[0].n===0,'Owner PIN removed to prevent staff session issuance');
const ownerCutoff=(await db.query('select session_revoked_after from hco_access where user_id=$1',[owner])).rows[0].session_revoked_after;
await save();ok((await db.query('select session_revoked_after from hco_access where user_id=$1',[owner])).rows[0].session_revoked_after?.toISOString()===ownerCutoff?.toISOString(),'Later leader PIN reset leaves staff session cutoff unchanged');
ok((await db.query('select hco_leader_pin_complete($1,$2) v',[alias,first.version])).rows[0].v===false,'PIN reset invalidates old version');
for(let n=0;n<5;n++)ok((await attempt()).user_id===alias,'PIN attempt recorded '+n);
ok(Object.keys(await attempt()).length===0,'Five-attempt lock retained');await save();
await db.query(`insert into hco_access(user_id,suspended_at) values($1,now()) on conflict(user_id) do update set suspended_at=now()`,[owner]);
ok(Object.keys(await attempt()).length===0,'Owner suspension blocks linked PIN');
ok((await db.query('select hco_cell_login_sync($1) v',[alias])).rows[0].v===false,'Owner suspension blocks existing linked session checks');
await db.query('update hco_access set suspended_at=null where user_id=$1',[owner]);await save();
const call=async(who,action,data)=>(await db.query('select hco_workspace_write($1,$2,$3) v',[who,action,JSON.stringify(data)])).rows[0].v;
const date=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
let report=await call(alias,'meeting',{cell_id:cell,meeting_date:date});
await db.query(`update hco_meetings set status='submitted',submitted_by=$1 where id=$2`,[alias,report.id]);
await assert.rejects(call(owner,'approve',{meeting_id:report.id,version:report.version}),/HCO_CANNOT_REVIEW_OWN_CELL_REPORT/);ok(true,'Owner cannot approve alias submission');
await assert.rejects(call(owner,'correction',{meeting_id:report.id,version:report.version,reason:'Send back'}),/HCO_CANNOT_REVIEW_OWN_CELL_REPORT/);ok(true,'Owner cannot send back alias submission');
await db.query(`update hco_assignments set active=false where user_id=$1 and role='cell_leader'`,[owner]);
await assert.rejects(call(owner,'approve',{meeting_id:report.id,version:report.version}),/HCO_CANNOT_REVIEW_OWN_CELL_REPORT/);ok(true,'Linked self-approval stays blocked after assignment removal');
ok(Object.keys(await attempt()).length===0,'Removing Cell Leader assignment revokes PIN');
await assert.rejects(call(alias,'meeting',{cell_id:cell,meeting_date:date}),/HCO_ACCESS_DENIED/);ok(true,'Revocation is enforced again inside database write, not only UI');
await db.query(`update hco_assignments set active=true where user_id=$1 and role='cell_leader'`,[owner]);await save();
await assert.rejects(call(alias,'meeting',{cell_id:cellB,meeting_date:date}),/HCO_CELL_LEADER_ACCESS_REQUIRED/);ok(true,'PIN session cannot write another cell');
await assert.rejects(write(alias,'add_role',{user_id:outsider,role:'church_admin',reason:'Cannot escalate'}));ok(true,'PIN identity cannot grant itself broader powers');
const b=await call(admin,'meeting',{cell_id:cellB,meeting_date:date});await db.query(`update hco_meetings set status='submitted',submitted_by=$1 where id=$2`,[admin,b.id]);
await call(coord,'correction',{meeting_id:b.id,version:b.version,reason:'Please verify this report'});ok(true,'Global Coordinator reviews reports in any area');
await db.exec('set role authenticated');await assert.rejects(db.exec('select * from hco_cell_logins'));await assert.rejects(db.query('select hco_cell_login_sync($1)',[alias]));ok(true,'Link table and sync RPC are server-only');
await db.exec('reset role');await db.close();console.log(JSON.stringify({checks:count,passed:true}));
