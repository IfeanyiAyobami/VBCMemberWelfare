import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const db = new PGlite();
const q = async (s, a = []) => (await db.query(s, a)).rows;
const id = (n) => "90000000-0000-4000-8000-" + String(n).padStart(12, "0");
let count = 0;
const ok = (v, label) => {
  assert(v, label);
  console.log("PASS GREETINGS", ++count, label);
};
const as = async (n) => {
  await db.exec("reset role");
  await q(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",
    [n ? id(n) : ""],
  );
  await db.exec("set role authenticated");
};
const rejects = (fn, label) =>
  assert.rejects(fn).then(() => console.log("PASS GREETINGS", ++count, label));

await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,phone text);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`,
);
for (const file of [
  "tests/fixtures/001_care_schema.sql",
  "tests/fixtures/002_care_functions.sql",
  "supabase/004_care_controls.sql",
])
  await db.exec(
    (await readFile(file, "utf8")).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", ""),
  );
for (const [n, role] of [
  [1, "administrator"],
  [2, "editor"],
  [3, "viewer"],
]) {
  await q("insert into auth.users(id) values($1)", [id(n)]);
  await q("insert into care_staff(user_id,display_name,role) values($1,$2,$3)", [
    id(n),
    "Fictional staff " + n,
    role,
  ]);
}
await q("insert into auth.users(id) values($1)", [id(4)]);
await q(
  "insert into care_staff(user_id,display_name,role,is_active) values($1,'Former staff','editor',false)",
  [id(4)],
);
await q(
  "insert into care_members(id,surname,other_names,status) values($1,'Fixture','Celebrant','member')",
  [id(10)],
);
await q(
  "insert into care_members(id,surname,other_names,status,archived_at) values($1,'Fixture','Archived','member',now())",
  [id(11)],
);

const migration = await readFile("supabase/026_celebration_greetings.sql", "utf8");
await db.exec(migration);
await db.exec(migration);
ok(true, "migration applies and reruns");

const insert = (member, occasion = "birthday", year = 2026, channel = "whatsapp", spoof = null) =>
  q(
    `insert into care_celebration_greetings(member_id,occasion,occasion_year,channel${spoof ? ",greeted_by,greeted_by_name" : ""}) values($1,$2,$3,$4${spoof ? ",$5,'Someone else'" : ""}) returning greeted_by,greeted_by_name`,
    spoof ? [id(member), occasion, year, channel, id(spoof)] : [id(member), occasion, year, channel],
  );

await as(2);
const row = (await insert(10))[0];
ok(row.greeted_by === id(2) && row.greeted_by_name === "Fictional staff 2", "editor records a greeting under their own name");
await rejects(() => insert(10), "the same birthday year cannot be recorded twice");
const spoofed = (await insert(10, "anniversary", 2026, "phone", 1))[0];
ok(
  spoofed.greeted_by === id(2) && spoofed.greeted_by_name === "Fictional staff 2",
  "greeter and name cannot be set by the client",
);
await rejects(() => insert(11, "birthday", 2026), "archived members cannot be greeted");
await rejects(() => insert(10, "christmas", 2027), "only birthdays and anniversaries");

await as(3);
ok((await q("select count(*)::int n from care_celebration_greetings"))[0].n === 2, "viewer can see greetings");
await rejects(() => insert(10, "birthday", 2027), "viewer cannot record greetings");

await as(4);
await rejects(() => insert(10, "birthday", 2028), "inactive staff cannot record greetings");
ok((await q("select count(*)::int n from care_celebration_greetings"))[0].n === 0, "inactive staff cannot read greetings");

await db.exec("reset role");
await q("select set_config('request.jwt.claim.sub','',false)");
await db.exec("set role anon");
await rejects(() => q("select * from care_celebration_greetings"), "anonymous visitors cannot read greetings");

console.log(`PASS greetings database: ${count} checks`);
