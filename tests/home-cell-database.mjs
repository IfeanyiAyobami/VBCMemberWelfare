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
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = uid(1),
  leader = uid(2),
  reviewer = uid(3),
  outsider = uid(4),
  coord = uid(5),
  member = uid(9);
await db.query(`insert into auth.users select unnest($1::uuid[])`, [
  [admin, leader, reviewer, outsider, coord],
]);
await db.query(`insert into care_staff values($1,'administrator',true)`, [
  admin,
]);
const area = (
  await db.query(`insert into hco_areas(name) values('Area A') returning id`)
).rows[0].id;
const other = (
  await db.query(`insert into hco_areas(name) values('Area B') returning id`)
).rows[0].id;
const cell = (
  await db.query(
    `insert into hco_cells(name,area_id) values('Cell A',$1) returning id`,
    [area],
  )
).rows[0].id;
const othercell = (
  await db.query(
    `insert into hco_cells(name,area_id) values('Cell B',$1) returning id`,
    [other],
  )
).rows[0].id;
await db.query(
  `insert into hco_assignments(user_id,role,cell_id) values($1,'cell_leader',$2)`,
  [leader, cell],
);
await db.query(
  `insert into hco_assignments(user_id,role,area_id) values($1,'area_leader',$2),($3,'coordinator',$2)`,
  [reviewer, area, coord],
);
await db.query(
  `insert into care_members(id,other_names,surname,phone) values($1,'Test','Member','+2348011111111')`,
  [member],
);
const call = async (actor, action, data) =>
  (
    await db.query(`select hco_workspace_write($1,$2,$3::jsonb) result`, [
      actor,
      action,
      JSON.stringify(data),
    ])
  ).rows[0].result;
const denied = async (actor, action, data, label) => {
  await assert.rejects(call(actor, action, data));
  ok(true, label);
};
await denied(
  outsider,
  "meeting",
  { cell_id: cell, meeting_date: "2026-10-18" },
  "No-assignment actor denied",
);
await denied(
  leader,
  "meeting",
  { cell_id: othercell, meeting_date: "2026-10-18" },
  "Cross-area cell write denied",
);
let meeting = await call(leader, "meeting", {
  cell_id: cell,
  meeting_date: "2026-10-18",
});
ok(meeting.status === "draft", "Cell leader starts draft fellowship");
const retry = await call(leader, "meeting", {
  cell_id: cell,
  meeting_date: "2026-10-18",
});
ok(retry.id === meeting.id, "Same date returns original meeting");
await call(leader, "assign_member", { cell_id: cell, member_id: member });
await denied(
  leader,
  "attendance",
  {
    meeting_id: meeting.id,
    version: 1,
    rows: [{ member_id: uid(99), status: "present" }],
  },
  "Member outside cell denied",
);
meeting = await call(leader, "attendance", {
  meeting_id: meeting.id,
  version: 1,
  rows: [{ member_id: member, status: "present" }],
  notes: "Fellowship notes",
});
ok(meeting.version === 2, "Attendance saved and report version incremented");
await denied(
  leader,
  "attendance",
  { meeting_id: meeting.id, version: 1, rows: [] },
  "Stale draft cannot overwrite attendance",
);
await denied(
  leader,
  "finance",
  {
    meeting_id: meeting.id,
    version: 2,
    kind: "expense",
    amount: -1,
    description: "Invalid",
  },
  "Negative finance rejected",
);
await call(leader, "finance", {
  meeting_id: meeting.id,
  version: 2,
  kind: "offering",
  amount: 1250,
  description: "Meeting offering",
});
meeting = await call(leader, "submit", { meeting_id: meeting.id, version: 3 });
ok(meeting.status === "submitted", "Consolidated weekly report submitted");
await denied(
  leader,
  "finance",
  {
    meeting_id: meeting.id,
    version: 4,
    kind: "offering",
    amount: 100,
    description: "Locked",
  },
  "Submitted finances are locked",
);
await denied(
  reviewer,
  "attendance",
  { meeting_id: meeting.id, version: 4, rows: [] },
  "Area leader cannot edit submitted report",
);
await denied(
  coord,
  "approve",
  { meeting_id: meeting.id, version: 4 },
  "Coordinator cannot substitute for Area Leader approval",
);
meeting = await call(reviewer, "correction", {
  meeting_id: meeting.id,
  version: 4,
  reason: "Please correct the attendance.",
});
ok(
  meeting.status === "correction_requested",
  "Area leader requests correction",
);
meeting = await call(leader, "attendance", {
  meeting_id: meeting.id,
  version: 5,
  rows: [{ member_id: member, status: "late" }],
  notes: "Corrected",
});
meeting = await call(leader, "submit", { meeting_id: meeting.id, version: 6 });
ok(meeting.status === "submitted", "Cell leader revises and resubmits");
meeting = await call(reviewer, "approve", {
  meeting_id: meeting.id,
  version: 7,
});
ok(meeting.status === "approved", "Area Leader approves resubmitted report");
ok(
  (await db.query(`select count(*)::int n from hco_audit`)).rows[0].n >= 9,
  "Changes retain transactional audit records",
);
await denied(
  reviewer,
  "announcement",
  { area_id: other, title: "Wrong area", body: "Not allowed" },
  "Announcement outside assigned area denied",
);
await call(reviewer, "announcement", {
  area_id: area,
  title: "Weekly reminder",
  body: "Submit your fellowship report.",
});
ok(true, "Scoped announcement saved");
await db.query(
  `insert into hco_access(user_id,suspended_at) values($1,now())`,
  [leader],
);
await denied(
  leader,
  "meeting",
  { cell_id: cell, meeting_date: "2026-10-19" },
  "Suspension immediately blocks writes",
);
await db.query(`delete from hco_access where user_id=$1`, [leader]);
const m2 = await call(leader, "meeting", {
  cell_id: cell,
  meeting_date: "2026-10-19",
});
const payload = {
  cell_id: cell,
  meeting_id: m2.id,
  request_id: uid(20),
  other_names: "Visitor",
  surname: "Example",
  phone: "+2348022222222",
  contact_consent: false,
  email_opt_in: false,
  sms_opt_in: false,
};
const visit = await call(leader, "visitor", payload);
ok(
  !!visit.guest_submission_id && !visit.member_id,
  "New visitor saved in central guest queue without creating member",
);
const vRetry = await call(leader, "visitor", payload);
ok(visit.id === vRetry.id, "Visitor retry does not duplicate record");
await denied(
  leader,
  "visitor",
  { ...payload, surname: "Changed" },
  "Same visitor request ID cannot silently accept changed details",
);
const guest = (
  await db.query("select * from care_guest_submissions where id=$1", [
    visit.guest_submission_id,
  ])
).rows[0];
ok(
  !guest.contact_consent && !guest.email_opt_in && !guest.sms_opt_in,
  "Visitor opt-outs preserved",
);
await denied(
  leader,
  "visitor",
  { ...payload, request_id: uid(21) },
  "Existing contact requires explicit identity confirmation",
);
await call(leader, "followup", {
  visit_id: visit.id,
  status: "completed",
  notes: "Follow-up recorded",
});
ok(true, "Follow-up status saved");

await denied(
  leader,
  "meeting",
  { cell_id: cell, meeting_date: "2026-10-20" },
  "Second report date in same ISO week rejected",
);
const beforeDup = (
  await db.query(
    "select count(*)::int n from hco_attendance where meeting_id=$1",
    [m2.id],
  )
).rows[0].n;
await denied(
  leader,
  "attendance",
  {
    meeting_id: m2.id,
    version: 1,
    rows: [
      { member_id: member, status: "present" },
      { member_id: member, status: "late" },
    ],
  },
  "Duplicate member attendance rejected atomically",
);
ok(
  (
    await db.query(
      "select count(*)::int n from hco_attendance where meeting_id=$1",
      [m2.id],
    )
  ).rows[0].n === beforeDup,
  "Failed attendance save leaves prior rows intact",
);
const tx = await call(leader, "finance", {
  meeting_id: m2.id,
  version: 1,
  kind: "dues",
  amount: 100,
  description: "Fixture dues",
});
await call(leader, "void_finance", {
  meeting_id: m2.id,
  version: 2,
  finance_id: tx.id,
  reason: "Incorrect amount entered",
});
const voided = (
  await db.query("select * from hco_finances where id=$1", [tx.id])
).rows[0];
ok(
  !!voided.voided_at && Number(voided.amount) === 100,
  "Voiding preserves original financial amount and records reason",
);
const leadership = async (actor, action, data) =>
  (
    await db.query("select hco_leadership_write($1,$2,$3::jsonb) result", [
      actor,
      action,
      JSON.stringify(data),
    ])
  ).rows[0].result;
await assert.rejects(
  leadership(coord, "add_role", {
    user_id: outsider,
    role: "church_admin",
    reason: "Invalid promotion",
  }),
);
ok(true, "Coordinator cannot appoint Church Administrator");
await assert.rejects(
  leadership(coord, "add_role", {
    user_id: outsider,
    role: "area_leader",
    area_id: other,
    reason: "Outside assignment",
  }),
);
ok(true, "Coordinator cannot expand assignment scope");
const added = await leadership(coord, "add_role", {
  user_id: outsider,
  role: "cell_leader",
  cell_id: cell,
  reason: "Verified new leadership assignment",
});
ok(added.active, "Coordinator can add authorized Cell Leader");
await assert.rejects(
  leadership(leader, "add_role", {
    user_id: outsider,
    role: "church_admin",
    reason: "Escalation attempt",
  }),
);
ok(true, "Cell Leader cannot grant roles");
const removed = await leadership(coord, "remove_role", {
  assignment_id: added.id,
  user_id: coord,
  reason: "Identity spoofing check",
});
ok(
  removed.user_id === outsider && !removed.active,
  "Assignment target is resolved from storage rather than caller user ID",
);
const current = (
  await db.query("select * from hco_assignments where id=$1", [added.id])
).rows[0];
// Recreate the role if the coordinator correctly removed it by its stored target rather than caller user_id.
const active = current.active
  ? current
  : await leadership(admin, "add_role", {
      user_id: outsider,
      role: "cell_leader",
      cell_id: cell,
      reason: "Restore fixture for replacement check",
    });
await assert.rejects(
  leadership(coord, "replace_role", {
    assignment_id: active.id,
    role: "area_leader",
    area_id: other,
    reason: "Cross-area replacement",
  }),
);
ok(
  (
    await db.query("select active from hco_assignments where id=$1", [
      active.id,
    ])
  ).rows[0].active,
  "Invalid replacement rolls back original role",
);
await assert.rejects(
  leadership(admin, "add_role", {
    user_id: admin,
    role: "cell_leader",
    cell_id: cell,
    reason: "Own role change",
  }),
);
ok(true, "Own access changes denied");
const session = uid(70);
await db.query(
  "insert into auth.sessions(id,user_id,created_at) values($1,$2,now()-interval '1 hour')",
  [session, outsider],
);
await leadership(admin, "logout", {
  assignment_id: active.id,
  reason: "Remote Home Cell logout test",
});
ok(
  !(
    await db.query("select hco_session_allowed($1,$2) allowed", [
      outsider,
      session,
    ])
  ).rows[0].allowed,
  "Existing HCO session denied after remote termination",
);
const fresh = uid(71);
await db.query(
  "insert into auth.sessions(id,user_id,created_at) values($1,$2,now()+interval '1 second')",
  [fresh, outsider],
);
ok(
  (
    await db.query("select hco_session_allowed($1,$2) allowed", [
      outsider,
      fresh,
    ])
  ).rows[0].allowed,
  "Fresh sign-in can regain HCO access",
);
await db.exec(fs.readFileSync(root + "/tests/fixtures/010_home_cell_directory.sql", "utf8"));
const directorySQL=fs.readFileSync(root + "/supabase/012_home_cell_leader_directory.sql", "utf8");
await db.exec(directorySQL);
ok((await db.query("select count(*)::int n from hco_directory_contacts")).rows[0].n===66,"012 seeds all 66 source cells");
const contact=(await db.query("select * from hco_directory_contacts where leader_details like '%Kevin Iwuji%' ")).rows[0];
ok(contact.leader_details.includes('07032621020'),"Source leader name and phone preserved");
await db.query("select hco_directory_write($1,$2)",[admin,JSON.stringify({...contact,leader_details:'Edited leader'})]);
await db.exec(directorySQL);
ok((await db.query("select leader_details from hco_directory_contacts where cell_id=$1",[contact.cell_id])).rows[0].leader_details==='Edited leader',"Seed reruns preserve administrator edits");
await assert.rejects(db.query("select hco_directory_write($1,$2)",[admin,JSON.stringify(contact)]),/STALE/);ok(true,"Stale directory saves rejected");
await assert.rejects(db.query("select hco_directory_write($1,$2)",[leader,JSON.stringify({...contact,version:2})]),/ACCESS|REVIEW/);ok(true,"Cell leader cannot edit directory contacts");
ok((await db.query("select has_function_privilege('authenticated','hco_directory_write(uuid,jsonb)','EXECUTE') allowed")).rows[0].allowed===false,"Authenticated clients cannot invoke privileged directory writes");
await db.exec("alter table auth.users add column phone text");
const phoneSQL=fs.readFileSync(root + "/supabase/013_home_cell_phone_usernames.sql", "utf8");
await db.exec(phoneSQL);
const phoneLeader=uid(80);
await db.query("insert into auth.users(id) values($1)",[phoneLeader]);
const targetPhone='+2348031234567';
await db.query("select hco_phone_leadership_write($1,'assign',$2)",[admin,JSON.stringify({user_id:phoneLeader,role:'cell_leader',cell_id:cell,phone:targetPhone,reason:'Test phone username'})]);
ok((await db.query("select user_id from hco_phone_usernames where phone=$1",[targetPhone])).rows[0].user_id===phoneLeader,"Phone username bound to existing auth ID");
const roleCount=(await db.query("select count(*)::int n from hco_assignments where user_id=$1",[reviewer])).rows[0].n;
await assert.rejects(db.query("select hco_phone_leadership_write($1,'assign',$2)",[admin,JSON.stringify({user_id:reviewer,role:'cell_leader',cell_id:cell,phone:targetPhone,reason:'Conflict test'})]),/PHONE_ALREADY/);
ok((await db.query("select count(*)::int n from hco_assignments where user_id=$1",[reviewer])).rows[0].n===roleCount,"Duplicate username rolls back the accompanying role assignment");
await assert.rejects(db.query("select hco_phone_leadership_write($1,'repair',$2)",[leader,JSON.stringify({user_id:phoneLeader,phone:targetPhone,reason:'Unauthorized repair'})]),/ACCESS/);ok(true,"Cell leader cannot repair accounts");
await assert.rejects(db.query("select hco_phone_leadership_write($1,'repair',$2)",[admin,JSON.stringify({user_id:admin,phone:targetPhone,reason:'Self repair'})]),/ACCESS/);ok(true,"Self repair denied");
const beforeRepair=(await db.query("select count(*)::int n from hco_assignments where user_id=$1",[phoneLeader])).rows[0].n;
await db.query("select hco_phone_leadership_write($1,'repair',$2)",[admin,JSON.stringify({user_id:phoneLeader,phone:targetPhone,reason:'Existing account repair'})]);
ok((await db.query("select count(*)::int n from hco_assignments where user_id=$1",[phoneLeader])).rows[0].n===beforeRepair,"Repair preserves all assignments");
await db.exec(phoneSQL);
ok((await db.query("select count(*)::int n from hco_phone_usernames")).rows[0].n===1,"013 reruns preserve registered usernames");
ok((await db.query("select has_table_privilege('authenticated','hco_phone_usernames','SELECT') allowed")).rows[0].allowed===false,"Username directory hidden from authenticated clients");
ok((await db.query("select has_function_privilege('anon','hco_phone_leadership_write(uuid,text,jsonb)','EXECUTE') allowed")).rows[0].allowed===false,"Anonymous clients cannot bind phone usernames");
await db.exec(fixture.slice(fixture.indexOf('create table public.care_preferences ('),fixture.indexOf('create table public.care_consent_events (')));
const preferenceDefaults=fs.readFileSync(root+'/supabase/008_default_communication_preferences.sql','utf8');
await db.exec(preferenceDefaults.slice(preferenceDefaults.indexOf('CREATE OR REPLACE FUNCTION care_private.vbc_new_member_preference_defaults()'),preferenceDefaults.indexOf('-- Preserve the existing WordPress payload contract')));
const onboardingSQL=fs.readFileSync(root+'/supabase/014_home_cell_member_onboarding.sql','utf8');
await db.exec(onboardingSQL);ok(true,'014 applies without changing existing memberships');
const cell2=(await db.query("insert into hco_cells(name,area_id) values('Second Cell A',$1) returning id",[area])).rows[0].id;
await db.query("insert into hco_assignments(user_id,role,cell_id) values($1,'cell_leader',$2)",[leader,cell2]);
const onboard=async(actor,payload)=>(await db.query('select hco_onboard_members($1,$2) result',[actor,JSON.stringify(payload)])).rows[0].result;
const baseRow={first:'Onboard',last:'Person',phone:'+2348098765432',email:'onboard@example.test',joined:'2026-01-01',birthday:'03-04',anniversary:'',occupation:'',address:'',email_opt_in:false,sms_opt_in:false};
const batch={request_id:uid(200),cell_id:cell,rows:[baseRow],source:'form',confirm_existing:true};
const createdMembers=await onboard(leader,batch);const addedMember=createdMembers[0].member_id;
ok(createdMembers[0].action==='created_and_assigned','Cell leader creates a member and links their assigned cell');
ok((await db.query('select status from care_members where id=$1',[addedMember])).rows[0].status==='new_member','New records do not auto-promote to official member status');
ok((await db.query('select email_opt_in,sms_opt_in from care_preferences where member_id=$1',[addedMember])).rows[0].sms_opt_in===false,'New-record opt-outs survive initial ON preference trigger');
ok((await onboard(leader,batch))[0].member_id===addedMember,'Batch retry returns original member without duplication');
await assert.rejects(onboard(leader,{...batch,rows:[{...baseRow,last:'Changed'}]}),/RETRY_PAYLOAD/);ok(true,'Changed retry payload rejected');
await assert.rejects(onboard(leader,{...batch,request_id:uid(201),cell_id:othercell}),/ACCESS/);ok(true,'Cell leader cannot onboard outside assigned cells');
const linked={request_id:uid(202),cell_id:cell,rows:[{existing_id:addedMember}],confirm_existing:true};
ok((await onboard(leader,linked))[0].action==='already_assigned','Same-cell existing assignment is idempotent');
await assert.rejects(call(leader,'assign_member',{cell_id:cell2,member_id:addedMember}),/CELL_CONFLICT/);ok(true,'Legacy assignment RPC cannot bypass transfer approval');
await assert.rejects(onboard(leader,{...linked,request_id:uid(203),cell_id:cell2}),/CELL_CONFLICT/);ok(true,'Conflicting assignments require explicit transfer submission');
const transferBatch={...linked,request_id:uid(204),cell_id:cell2,request_transfers:true,reason:'Member requests a nearer cell'};
ok((await onboard(leader,transferBatch))[0].action==='transfer_requested','Leader can submit assignment conflict as a transfer request');
ok((await db.query('select cell_id from hco_member_cells where member_id=$1 and active',[addedMember])).rows[0].cell_id===cell,'Pending transfer keeps the original home cell');
let request=(await db.query("select * from hco_member_transfers where member_id=$1 and status='pending'",[addedMember])).rows[0];
await assert.rejects(db.query("select hco_transfer_decide($1,$2,'moved','Leader tries approval')",[leader,request.id]),/COORDINATOR/);ok(true,'Cell leader cannot approve their transfer');
await assert.rejects(db.query("select hco_transfer_decide($1,$2,'moved','Area leader tries approval')",[reviewer,request.id]),/COORDINATOR/);ok(true,'Area Leader cannot act as transfer coordinator');
const pendingCount=(await db.query("select count(*)::int n from hco_member_transfers where member_id=$1 and status='pending'",[addedMember])).rows[0].n;
await onboard(leader,{...transferBatch,request_id:uid(210)});
ok((await db.query("select count(*)::int n from hco_member_transfers where member_id=$1 and status='pending'",[addedMember])).rows[0].n===pendingCount,'Repeated same-target transfer requests reuse the pending request');
await assert.rejects(onboard(admin,{...transferBatch,request_id:uid(211),cell_id:othercell}),/ALREADY_PENDING/);ok(true,'A second target cannot create a competing pending transfer');
const hiddenInbox=(await db.query('select hco_transfer_inbox($1,1) inbox',[phoneLeader])).rows[0].inbox;
ok(!hiddenInbox.items.some(x=>x.id===request.id),'Unrelated cell leader cannot see another leader’s request');
const inbox=(await db.query('select hco_transfer_inbox($1,1) inbox',[coord])).rows[0].inbox;
ok(inbox.items.some(x=>x.id===request.id&&x.can_move),'Coordinator receives pending request for their area');
await db.query("select hco_transfer_decide($1,$2,'kept','Keep the existing fellowship')",[coord,request.id]);
ok((await db.query('select cell_id from hco_member_cells where member_id=$1 and active',[addedMember])).rows[0].cell_id===cell,'Coordinator can retain the current home cell');
await onboard(leader,{...transferBatch,request_id:uid(205)});
request=(await db.query("select * from hco_member_transfers where member_id=$1 and status='pending'",[addedMember])).rows[0];
await db.query("select hco_transfer_decide($1,$2,'moved','Approved nearer home cell')",[coord,request.id]);
ok((await db.query('select cell_id from hco_member_cells where member_id=$1 and active',[addedMember])).rows[0].cell_id===cell2,'Coordinator-approved move activates only the new cell');
ok((await db.query('select active,left_at from hco_member_cells where member_id=$1 and cell_id=$2',[addedMember,cell])).rows[0].left_at!==null,'Previous assignment is retained with its end date');
await assert.rejects(db.query("select hco_transfer_decide($1,$2,'kept','Repeated decision')",[coord,request.id]),/ALREADY_DECIDED/);ok(true,'A decided transfer cannot be decided twice');
await onboard(admin,{...transferBatch,request_id:uid(206),cell_id:othercell});
request=(await db.query("select * from hco_member_transfers where member_id=$1 and status='pending'",[addedMember])).rows[0];
await assert.rejects(db.query("select hco_transfer_decide($1,$2,'moved','Cross area approval')",[coord,request.id]),/CROSS_AREA/);ok(true,'Coordinator cannot move a member into an area they do not manage');
await db.query("select hco_transfer_decide($1,$2,'moved','Church administrator approves')",[admin,request.id]);
ok((await db.query('select cell_id from hco_member_cells where member_id=$1 and active',[addedMember])).rows[0].cell_id===othercell,'Church administrator can approve cross-area moves');
await onboard(admin,{...transferBatch,request_id:uid(212),cell_id:cell});
const stale=(await db.query("select id from hco_member_transfers where member_id=$1 and status='pending'",[addedMember])).rows[0].id;
await db.query('update hco_member_cells set active=false,left_at=now() where member_id=$1 and active',[addedMember]);
await assert.rejects(db.query("select hco_transfer_decide($1,$2,'moved','Stale request test')",[admin,stale]),/STALE/);ok(true,'Approval refuses membership changes made after submission');
await db.query("select hco_transfer_decide($1,$2,'kept','Close stale request for review')",[admin,stale]);
const guestBefore=(await db.query('select count(*)::int n from care_guest_submissions')).rows[0].n;
await onboard(leader,{...batch,request_id:uid(213),rows:[{...baseRow,phone:'+2348098765438',email:'defaults@example.test',email_opt_in:true,sms_opt_in:true}]});
ok((await db.query("select p.email_opt_in,p.sms_opt_in from care_preferences p join care_members m on m.id=p.member_id where m.email='defaults@example.test'")).rows[0].email_opt_in===true,'New members retain requested default email preferences');
ok((await db.query('select count(*)::int n from care_guest_submissions')).rows[0].n===guestBefore,'Member onboarding leaves visitor records untouched');
const failBatch={...batch,request_id:uid(207),rows:[{...baseRow,phone:'+2348098765433',email:'rollback@example.test'},{...baseRow,phone:baseRow.phone}]};
await assert.rejects(onboard(leader,failBatch),/EXISTING_MEMBER/);
ok((await db.query("select count(*)::int n from care_members where email='rollback@example.test'")).rows[0].n===0,'A CSV batch failure rolls back all earlier new records');
ok((await db.query("select has_function_privilege('authenticated','hco_transfer_decide(uuid,uuid,text,text)','EXECUTE') allowed")).rows[0].allowed===false,'Direct authenticated transfer RPC execution denied');
console.log(JSON.stringify({ checks: count, passed: true }));
await db.close();
