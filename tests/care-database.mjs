// Optional PostgreSQL-compatible isolation test. NEVER connects to hosted Supabase.
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
  outsider = "00000000-0000-4000-8000-000000000004",
  member = "10000000-0000-4000-8000-000000000011",
  noteId = "20000000-0000-4000-8000-000000000011";
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
  console.log("PASS DB: " + label);
}
async function rejected(sql, args, code) {
  let err;
  try {
    await q(sql, args);
  } catch (e) {
    err = e;
  }
  assert.equal(err?.code, code);
}
const prefs = (
  patch,
  version,
  evidence = "Fictional consent confirmed in a test conversation on 10 October 2026.",
) =>
  q(
    "select * from public.care_update_preferences_guarded($1,$2::jsonb,$3,$4)",
    [member, JSON.stringify(patch), version, evidence],
  );
const note = (body = "Fictional follow-up note.", id = noteId) =>
  q("select * from public.care_add_note_guarded($1,$2,$3)", [member, id, body]);
try {
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    grant usage on schema auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  for (const name of [
    "fixtures/001_care_schema.sql",
    "fixtures/002_care_functions.sql",
  ])
    await db.exec(await readFile(new URL(name, import.meta.url), "utf8"));
  const migration = await readFile(
    new URL("../supabase/004_care_controls.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
  await db.exec(migration);
  check(true, "Additive migration succeeds twice");
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
  await q(
    "insert into care_members(id,surname,other_names,email) values($1,'Fixture','Database','db@example.invalid')",
    [member],
  );
  let [initial] = await q("select * from care_preferences where member_id=$1", [
    member,
  ]);
  check(
    initial.contact_consent === false && initial.newsletters_opt_in === false,
    "New permissions stay off",
  );
  const [saved] = await prefs(
    { contact_consent: true, email_opt_in: true, newsletters_opt_in: true },
    initial.updated_at,
  );
  check(
    saved.contact_consent &&
      saved.email_opt_in &&
      saved.newsletters_opt_in &&
      !saved.sms_opt_in,
    "Explicit independent permissions persist",
  );
  const history = await q(
    "select * from care_consent_events where member_id=$1 and previous_value is not null",
    [member],
  );
  check(
    history.length === 3 &&
      history.every(
        (r) =>
          r.recorded_by === admin &&
          r.source === "admin" &&
          r.evidence_note.includes("Fictional"),
      ),
    "History records each changed permission and verified actor",
  );
  await rejected(
    "select * from care_update_preferences_guarded($1,$2::jsonb,$3,$4)",
    [
      member,
      '{"email_opt_in":false}',
      initial.updated_at,
      "Fictional withdrawal evidence.",
    ],
    "40001",
  );
  check(true, "Old consent version cannot overwrite newer consent");
  await rejected(
    "select * from care_update_preferences_guarded($1,$2::jsonb,$3,$4)",
    [
      member,
      '{"unknown":true}',
      saved.updated_at,
      "Fictional evidence details.",
    ],
    "22023",
  );
  check(true, "Unknown consent fields rejected by database");
  await rejected(
    "select * from care_update_preferences_guarded($1,$2::jsonb,$3,$4)",
    [
      member,
      '{"email_opt_in":"yes"}',
      saved.updated_at,
      "Fictional evidence details.",
    ],
    "22023",
  );
  check(true, "Non-boolean consent rejected by database");
  await rejected(
    "select * from care_update_preferences_guarded($1,$2::jsonb,$3,$4)",
    [member, '{"email_opt_in":false}', saved.updated_at, ""],
    "22023",
  );
  check(true, "Missing evidence rejected by database");
  await rejected(
    "update care_preferences set email_opt_in=false where member_id=$1",
    [member],
    "42501",
  );
  check(true, "Direct preference writes remain denied");
  const [n] = await note();
  check(
    n.created_by === admin && n.body === "Fictional follow-up note.",
    "Note stamps current staff actor",
  );
  await note();
  check(
    (await q("select * from care_notes")).length === 1,
    "Repeated note request does not duplicate notes",
  );
  await rejected(
    "select * from care_add_note_guarded($1,$2,$3)",
    [member, noteId, "Different details."],
    "23505",
  );
  check(true, "Reused note ID cannot replace saved text");
  await as(viewer);
  check(
    (await q("select * from care_notes")).length === 1 &&
      (await q("select * from care_consent_events")).length === 9,
    "Viewer can read notes and permission history",
  );
  await rejected(
    "select * from care_add_note_guarded($1,$2,$3)",
    [member, "20000000-0000-4000-8000-000000000012", "Viewer write."],
    "42501",
  );
  await rejected(
    "select * from care_update_preferences_guarded($1,$2::jsonb,$3,$4)",
    [
      member,
      '{"email_opt_in":false}',
      saved.updated_at,
      "Viewer fake evidence.",
    ],
    "42501",
  );
  check(true, "Viewer cannot write notes or permissions");
  check(
    (
      await q(
        "update care_members set archived_at=now() where id=$1 returning id",
        [member],
      )
    ).length === 0,
    "Viewer cannot archive records",
  );
  await as(editor);
  const [withdrawn] = await prefs(
    { email_opt_in: false },
    saved.updated_at,
    "Fictional member withdrew email permission during test.",
  );
  check(
    !withdrawn.email_opt_in && withdrawn.newsletters_opt_in,
    "Withdrawal preserves separate topic permission",
  );
  await note("Editor follow-up.", "20000000-0000-4000-8000-000000000013");
  check(
    (await q("select * from care_notes")).length === 2,
    "Editor can save a care note",
  );
  let [m] = await q("select * from care_members where id=$1", [member]);
  const [archived] = await q(
    "update care_members set archived_at=now() where id=$1 and updated_at=$2 returning *",
    [member, m.updated_at],
  );
  check(!!archived.archived_at, "Editor can archive with expected version");
  check(
    (
      await q(
        "update care_members set archived_at=null where id=$1 and updated_at=$2 returning id",
        [member, m.updated_at],
      )
    ).length === 0,
    "Old archive version cannot restore newer record",
  );
  await rejected(
    "select * from care_add_note_guarded($1,$2,$3)",
    [member, "20000000-0000-4000-8000-000000000014", "Archived note."],
    "P0002",
  );
  await rejected(
    "select * from care_update_preferences_guarded($1,$2::jsonb,$3,$4)",
    [
      member,
      '{"email_opt_in":true}',
      withdrawn.updated_at,
      "Fictional archived consent.",
    ],
    "P0002",
  );
  check(true, "Archived records reject note and consent writes");
  await as("", "service_role");
  check(
    !(
      await q(
        "select care_private.can_send($1,'email','newsletter') as allowed",
        [member],
      )
    )[0].allowed,
    "Archived member excluded from sending eligibility",
  );
  await as(editor);
  await q(
    "update care_members set archived_at=null where id=$1 and updated_at=$2",
    [member, archived.updated_at],
  );
  check(
    (await q("select * from care_notes where member_id=$1", [member]))
      .length === 2 &&
      (
        await q(
          "select newsletters_opt_in from care_preferences where member_id=$1",
          [member],
        )
      )[0].newsletters_opt_in,
    "Restore retains notes and independent preferences",
  );
  await as(outsider);
  check(
    (await q("select * from care_notes")).length === 0,
    "An Auth account without staff cannot read notes",
  );
  await rejected(
    "select * from care_add_note_guarded($1,$2,$3)",
    [member, noteId, "Outsider."],
    "42501",
  );
  check(true, "Nonstaff cannot invoke guarded note RPC");
  await as("", "anon");
  await rejected(
    "select * from care_update_preferences_guarded($1,$2::jsonb,$3,$4)",
    [member, "{}", saved.updated_at, "Anonymous evidence."],
    "42501",
  );
  check(true, "Anonymous cannot invoke consent RPC");
  await as("", "postgres");
  const [settings] = await q(
    "select email_enabled,sms_enabled from care_settings",
  );
  check(
    !settings.email_enabled && !settings.sms_enabled,
    "Sending remains disabled after all mutations",
  );
  console.log(
    checks +
      " isolated database checks passed. No hosted project or provider contacted.",
  );
} finally {
  await db.close();
}
