import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import ts from "typescript";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.test" });
for (const key of [
  "window",
  "document",
  "navigator",
  "localStorage",
  "HTMLElement",
  "HTMLDialogElement",
])
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: dom.window[key],
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
HTMLElement.prototype.scrollIntoView = () => {};
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const owner = "fixture-friend";
const base = {
  version: 1,
  status: "visitor",
  assigned_to: owner,
  followup_state: "active",
  contact_consent: true,
  contact_count: 0,
  phone: "08000000000",
  email: null,
  next_due: "2020-01-01T09:00:00Z",
  membership_eligible: false,
};
const items = [
  { ...base, member_id: "a", name: "Fictional Ada" },
  {
    ...base,
    member_id: "b",
    name: "Fictional Ben",
    status: "member",
    next_due: null,
  },
  {
    ...base,
    member_id: "private",
    name: "Other worker person",
    assigned_to: "another-worker",
  },
];
let themes = 0,
  full = 0;
globalThis.fetch = async () =>
  Response.json({ items, total: items.length, policy: { service_types: [] } });
const temp = new URL("../.mobile-ui-test.mjs", import.meta.url);
const code = ts
  .transpileModule(await readFile("src/components/FriendDesk.tsx", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  })
  .outputText.replaceAll(
    '"@/lib/journey/model"',
    '"./src/lib/journey/model.ts"',
  )
  .replaceAll('"@/lib/journey/outbox"', '"./src/lib/journey/outbox.ts"')
  .replace('import "./friend.css";', "");
await writeFile(temp, code);
const root = createRoot(document.getElementById("root"));
const buttons = () => [...document.querySelectorAll("button")];
const click = async (text) => {
  const b = buttons().find((b) => b.textContent.trim() === text);
  assert(b, "Missing button: " + text);
  await act(async () => b.click());
};
try {
  const { default: FriendDesk } = await import(temp.href);
  await act(async () => {
    root.render(
      React.createElement(FriendDesk, {
        staff: { user_id: owner, display_name: "Fixture Friend" },
        dark: true,
        onTheme: () => themes++,
        onFullView: () => full++,
        onSignOut: () => {},
      }),
    );
  });
  assert.equal(document.querySelector("h1").textContent, "TODAY");
  assert(!document.body.textContent.includes("Other worker person"));
  {
    const summary = document.querySelector(".fm-summary").textContent;
    assert(summary.includes("1 to contact today"), summary);
    assert(summary.includes("1 is late"), summary);
    assert(summary.includes("2 people in your care"), summary);
  }
  await click("My people");
  assert.equal(document.querySelector("h1").textContent, "MY PEOPLE");
  assert.equal(document.querySelectorAll(".fm-card-open").length, 2);
  await click("Members");
  assert.equal(document.querySelectorAll(".fm-card-open").length, 1);
  assert(document.querySelector(".fm-card-open").textContent.includes("Ben"));
  await click("All");
  const input = document.querySelector('input[type="search"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    ).set.call(input, "Ada");
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  // Input events are additionally exercised through React's native props in this DOM-only harness.
  const props = Object.keys(input).find((k) => k.startsWith("__reactProps"));
  await act(async () => input[props].onChange({ target: { value: "Ada" } }));
  assert.equal(document.querySelectorAll(".fm-card-open").length, 1);
  assert(document.querySelector(".fm-card-open").textContent.includes("Ada"));
  await act(async () =>
    input[props].onChange({ target: { value: "no match" } }),
  );
  assert.equal(document.querySelectorAll(".fm-card-open").length, 0);
  assert(document.body.textContent.includes("No people match"));
  await click("Register / import people");
  assert.equal(full, 1);
  await act(async () =>
    document.querySelector('[aria-label="Use light colours"]').click(),
  );
  assert.equal(themes, 1);
  await click("Account");
  assert.equal(document.querySelector("h1").textContent, "MY ACCOUNT");
  assert(document.body.textContent.includes("Fixture Friend"));
  await click("Done today");
  assert.equal(document.querySelector("h1").textContent, "DONE TODAY");
  console.log(
    "PASS rendered Friend navigation, live metrics, assigned-person isolation, search/filter, empty results, theme toggle and registration handoff",
  );
} finally {
  await act(async () => root.unmount());
  await unlink(temp);
  dom.window.close();
}
