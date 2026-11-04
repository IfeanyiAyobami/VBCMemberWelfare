import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import ts from "typescript";
let capability = { friend: true, coordinator: false, foundation: false },
  error = null;
const JourneyDesk = () => null;
globalThis.__shell = {
  JourneyDesk,
  CareApp: () => null,
  MemberDesk: () => null,
  StaffAccess: () => null,
  isCareRoute: () => true,
  isMemberId: () => false,
  getStaffSession: async () => ({
    status: "ready",
    staff: { role: "followup_worker", user_id: "fixture" },
  }),
  createClient: async () => ({
    rpc: async (name) => {
      assert.equal(name, "care_journey_register");
      return { data: { capabilities: capability }, error };
    },
  }),
  redirect: (path) => {
    throw Error("REDIRECT " + path);
  },
  notFound: () => {
    throw Error("NOT FOUND");
  },
};
let code = ts.transpileModule(
  await readFile("src/app/[[...screen]]/page.tsx", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
code = code.replace(/^import(?!\s*\{ jsx)[\s\S]*?;/gm, "");
code =
  "const {JourneyDesk,CareApp,MemberDesk,StaffAccess,isCareRoute,isMemberId,getStaffSession,createClient,redirect,notFound}=globalThis.__shell;\n" +
  code;
const temp = new URL("../.friend-shell-test.mjs", import.meta.url);
await writeFile(temp, code);
try {
  const { default: Page } = await import(temp.href);
  let result = await Page({
    params: Promise.resolve({ screen: ["followups"] }),
  });
  assert.equal(result.type, JourneyDesk);
  assert.equal(result.props.friendOnly, true);
  await assert.rejects(
    () => Page({ params: Promise.resolve({ screen: ["overview"] }) }),
    /REDIRECT \/followups/,
  );
  capability = { friend: true, coordinator: true, foundation: false };
  result = await Page({ params: Promise.resolve({ screen: ["followups"] }) });
  assert.equal(result.props.friendOnly, false);
  error = {};
  result = await Page({ params: Promise.resolve({ screen: ["followups"] }) });
  assert.notEqual(result.type, JourneyDesk);
  console.log(
    "PASS server selects Friend-only shell from verified capabilities, redirects main-office routes, preserves Coordinator access and fails closed",
  );
} finally {
  await unlink(temp);
  delete globalThis.__shell;
}
