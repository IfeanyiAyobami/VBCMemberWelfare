import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import ts from "typescript";
import { randomBytes, randomUUID } from "node:crypto";
import { generatePin, hashPin } from "../src/lib/journey/pin.ts";
process.env.FRIEND_PIN_SECRET = "fixture-secret-".repeat(4);
let manager = true,
  existing = false,
  unsafe = false,
  fail = false,
  created = 0,
  deleted = 0,
  save = null,
  hco = false,
  lastAuthEmail = "",
  missingStaff = false,
  inactiveStaff = false,
  staffError = false;
const db = {
  rpc: async (name, args) =>
    name === "care_friend_account_manager"
      ? { data: manager, error: null }
      : ((save = args),
        { data: !fail, error: fail ? { code: "42501" } : null }),
  from: (table) => {
    const q = {
      select: () => q,
      eq: () => q,
      then: (resolve) =>
        Promise.resolve({
          data: hco ? [{ id: "cell-assignment" }] : [],
          error: null,
        }).then(resolve),
      maybeSingle: async () => ({
        data:
          table === "care_staff" && !missingStaff
            ? {
                role: unsafe ? "administrator" : "followup_worker",
                is_active: !inactiveStaff,
              }
            : null,
        error:
          table === "care_staff" && staffError
            ? { message: "database unavailable" }
            : null,
      }),
    };
    return q;
  },
  auth: {
    admin: {
      createUser: async (input) => {
        lastAuthEmail = input.email;
        created++;
        return {
          data: { user: { id: "11111111-1111-4111-8111-111111111112" } },
          error: null,
        };
      },
      deleteUser: async () => {
        deleted++;
        return {};
      },
    },
  },
};
globalThis.__account = {
  authJSON: (b, s = 200) => Response.json(b, { status: s }),
  hasSameOrigin: (r) => r.headers.get("origin") === "https://care.test",
  readJson: (r) => r.json(),
  PayloadError: class extends Error {},
  createClient: async () => ({ rpc: db.rpc }),
  getStaffSession: async () => ({
    status: "ready",
    staff: {
      user_id: "11111111-1111-4111-8111-111111111111",
      role: "followup_worker",
    },
  }),
  adminDb: () => db,
  findAccountByIdentity: async () =>
    existing ? { id: "existing-user" } : null,
  normalizeLoginPhone: (s) => (s === "08015550111" ? "+2348015550111" : null),
  hashPin,
  generatePin,
  randomBytes,
  randomUUID,
};
let code = ts
  .transpileModule(
    await readFile("src/app/api/journey/friends/route.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    },
  )
  .outputText.replace(/^import[\s\S]*?;/gm, "");
code =
  "const {authJSON,hasSameOrigin,readJson,PayloadError,createClient,getStaffSession,adminDb,findAccountByIdentity,normalizeLoginPhone,hashPin,generatePin,randomBytes,randomUUID}=globalThis.__account;\n" +
  code;
const temp = new URL("../.account-route-test.mjs", import.meta.url);
await writeFile(temp, code);
try {
  const { POST } = await import(temp.href);
  const req = (extra = {}, origin = "https://care.test") =>
    new Request("https://care.test/api/journey/friends", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        name: "Fictional Friend",
        email: "friend@gmail.com",
        phone: "08015550111",
        ...extra,
      }),
    });
  assert.equal((await POST(req({}, "https://bad.test"))).status, 403);
  manager = false;
  assert.equal((await POST(req())).status, 403);
  manager = true;
  assert.equal((await POST(req({ phone: "bad" }))).status, 400);
  assert.equal(created, 0);
  let r = await POST(req());
  assert.equal(r.status, 200);
  let d = await r.json();
  assert.match(d.pin, /^\d{4}$/);
  assert.equal(d.loginPath, "/friend-login");
  assert.equal(save.p_phone, "+2348015550111");
  assert(!("pin_hash" in d));
  assert(!("password" in d));
  existing = true;
  unsafe = true;
  assert.equal((await POST(req())).status, 409);
  assert.equal(created, 1);
  existing = false;
  unsafe = false;
  fail = true;
  r = await POST(req());
  assert.equal(r.status, 403);
  assert.equal(deleted, 1);
  assert(!("pin" in (await r.json())));
  fail = false;
  existing = true;
  hco = true;
  unsafe = true;
  const before = created;
  r = await POST(req());
  assert.equal(r.status, 200);
  assert.equal(created, before + 1);
  assert(lastAuthEmail.endsWith("@friend-login.invalid"));
  assert.equal(save.p_email, "friend@gmail.com");
  assert.equal(save.p_phone, "+2348015550111");
  assert.equal(save.p_user, "11111111-1111-4111-8111-111111111112");
  missingStaff = true;
  const beforeMissing = created;
  r = await POST(req());
  assert.equal(r.status, 200);
  assert.equal(created, beforeMissing + 1);
  assert.equal(save.p_user, "11111111-1111-4111-8111-111111111112");
  assert.match((await r.json()).pin, /^\d{4}$/);
  missingStaff = false;
  inactiveStaff = true;
  const beforeInactive = created;
  r = await POST(req());
  assert.equal(r.status, 409);
  assert.equal(created, beforeInactive);
  assert(!("pin" in (await r.json())));
  inactiveStaff = false;
  staffError = true;
  r = await POST(req());
  assert.equal(r.status, 503);
  assert.equal(created, beforeInactive);
  staffError = false;
  console.log(
    "PASS Home Cell leader with missing staff record; explicit inactive record and database errors remain blocked",
  );
  console.log(
    "PASS independent Friend identity for an existing Home Cell leader, preserving Home Cell identifiers and protected roles",
  );
  console.log(
    "PASS Coordinator account-management guard, origin/input checks, phone normalization, four-digit-only credential response, elevated-user reuse denial and failed-provision cleanup",
  );
} finally {
  await unlink(temp);
  delete globalThis.__account;
}
