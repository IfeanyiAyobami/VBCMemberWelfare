import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import ts from "typescript";
const owner = "assigned-friend";
let ready = true,
  filter = null,
  queries = 0,
  failure = false;
const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  month: "numeric",
  day: "numeric",
}).formatToParts(new Date());
const month = Number(parts.find((p) => p.type === "month").value),
  day = Number(parts.find((p) => p.type === "day").value);
const person = (name, enabled = true) => ({
  member_id: name,
  care_members: {
    other_names: name,
    surname: "Fixture",
    birthday_month: month,
    birthday_day: day,
    care_preferences: {
      contact_consent: enabled,
      celebrations_opt_in: enabled,
    },
  },
});
globalThis.__celebrations = {
  getStaffSession: async () =>
    ready
      ? { status: "ready", staff: { user_id: owner } }
      : { status: "unauthenticated" },
  createClient: async () => ({}),
  authJSON: (body, status = 200) => Response.json(body, { status }),
  adminDb: () => ({
    from: (table) => {
      queries++;
      assert.equal(table, "care_journeys");
      return {
        select: () => ({
          eq: async (key, value) => {
            filter = [key, value];
            return {
              data: [person("Allowed"), person("OptedOut", false)],
              error: failure ? {} : null,
            };
          },
        }),
      };
    },
  }),
};
let code = ts
  .transpileModule(
    await readFile("src/app/api/journey/friend-celebrations/route.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    },
  )
  .outputText.replace(/^import[\s\S]*?;/gm, "");
code =
  "const {getStaffSession,createClient,authJSON,adminDb}=globalThis.__celebrations;\n" +
  code;
const temp = new URL("../.friend-celebrations-test.mjs", import.meta.url);
await writeFile(temp, code);
try {
  const { GET } = await import(temp.href);
  ready = false;
  assert.equal((await GET()).status, 403);
  assert.equal(queries, 0);
  ready = true;
  let r = await GET();
  assert.equal(r.status, 200);
  assert.deepEqual(filter, ["assigned_to", owner]);
  assert.deepEqual((await r.json()).items, [
    { memberId: "Allowed", name: "Allowed Fixture", kind: "Birthday" },
  ]);
  failure = true;
  assert.equal((await GET()).status, 503);
  console.log(
    "PASS celebrations require active login, scope to verified assignments and respect contact/celebration opt-outs",
  );
} finally {
  await unlink(temp);
  delete globalThis.__celebrations;
}
