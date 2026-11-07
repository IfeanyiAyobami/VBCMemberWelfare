import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import ts from "typescript";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
const dom = new JSDOM('<div id="root"></div>', {
  url: "https://fixture.test/cfc",
});
for (const key of [
  "window",
  "document",
  "navigator",
  "localStorage",
  "HTMLElement",
])
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: dom.window[key],
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const now = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const person = {
  id: "p",
  name: "Fictional Ada",
  cohorts: ["a", "b"],
  attendance: [1, 2, 4, 5, 6, 7]
    .map((n) => ({
      session_id: "s" + n,
      lesson: n,
      status: "present",
      date: "2026-01-10",
      cohort_id: "a",
    }))
    .concat([
      {
        session_id: "missed",
        lesson: 3,
        status: "absent",
        date: "2026-01-10",
        cohort_id: "a",
      },
      {
        session_id: "makeup",
        lesson: 3,
        status: "present",
        date: "2026-03-10",
        cohort_id: "b",
      },
    ]),
};
const missing = {
  id: "q",
  name: "Fictional Samuel",
  cohorts: ["a"],
  attendance: person.attendance.filter((a) => a.session_id !== "makeup"),
};
const trainee = {
  id: "r",
  name: "Fictional Chidi",
  cohorts: ["b"],
  attendance: [],
};
const fixture = {
  manager: false,
  canOrganize: true,
  name: "Grace",
  people: [person, missing, trainee],
  cohorts: [
    { id: "a", name: "Cohort A", starts_on: "2026-01-01" },
    { id: "b", name: "Cohort B", starts_on: "2026-03-01" },
  ],
  sessions: [
    {
      id: "next",
      cohort_id: "b",
      lesson: 3,
      held_on: now,
      topic: "The Holy Spirit",
      venue: "Church annex",
    },
  ],
  leaders: [],
  teaching: [],
  candidates: [],
};
const writes = [];
globalThis.fetch = async (_url, opts) => {
  if (opts?.method === "POST") {
    writes.push(JSON.parse(opts.body));
    return Response.json({ ok: true });
  }
  return Response.json(fixture);
};
const file = new URL("../.cfc-ui.mjs", import.meta.url);
const source = ts
  .transpileModule(await readFile("src/components/CfcDashboard.tsx", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  })
  .outputText.replace(/^import ['"].*?css['"];?$/gm, "");
await writeFile(file, source);
const root = createRoot(document.getElementById("root"));
try {
  const { default: CfcDashboard, completedLessons } = await import(file.href);
  assert.equal(completedLessons(person).length, 7);
  assert.equal(completedLessons(missing).length, 6);
  await act(async () => {
    root.render(
      React.createElement(CfcDashboard, { initial: fixture, embedded: true }),
    );
  });
  assert.ok(document.querySelector(".cfc-embedded"));
  const button = (text, scope = document) =>
    [...scope.querySelectorAll("button")].find((b) =>
      b.textContent.trim().endsWith(text),
    );
  const click = async (text, scope) => {
    const b = button(text, scope);
    assert.ok(b, text);
    await act(async () => b.click());
  };
  const nav = document.querySelector('nav[aria-label="CFC dashboard"]');
  assert.equal(nav.querySelectorAll("button").length, 3);
  assert.match(document.body.textContent, /Class 3 · The Holy Spirit/);
  await click("Take attendance");
  assert.match(document.querySelector("h1").textContent, /Who came/);
  assert.equal(document.querySelectorAll("select").length, 0);
  await click(
    "Came",
    document.querySelector('[aria-label="Attendance for Fictional Chidi"]'),
  );
  assert.doesNotMatch(document.body.textContent, /Reason for changing/);
  await click("Save attendance");
  assert.deepEqual(writes, [
    {
      action: "attendance",
      data: { member: "r", session: "next", status: "present", note: "" },
    },
  ]);
  assert.match(
    document.querySelector("[role=status]").textContent,
    /Attendance saved/,
  );
  await click(
    "Absent",
    document.querySelector('[aria-label="Attendance for Fictional Chidi"]'),
  );
  assert.match(document.body.textContent, /Reason for changing a saved mark/);
  assert.ok(button("Save attendance").disabled);
  await click("Classes");
  await click("Groups, dates and topics›");
  assert.match(document.body.textContent, /Create cohort/);
  assert.ok(button("Find attendance by participant"));
  await click("Find attendance by participant");
  assert.ok(button("Add participant"));
  assert.match(document.body.textContent, /7 of 7 distinct classes completed/);
  const cards = [...document.querySelectorAll("article")];
  await click(
    "View progress",
    cards.find((el) => el.textContent.includes(missing.name)),
  );
  assert.match(document.body.textContent, /Missing Class 3\. Next Class 3 is/);
  assert.ok(document.querySelector('[aria-label="Class 3: missing"]'));
  assert.ok(button("Add to that class"));
  assert.match(document.body.textContent, /Attendance history/);
  await click("Add to that class");
  assert.deepEqual(writes.at(-1), {
    action: "enrol",
    data: { member: "q", cohort: "b" },
  });
  await click("People");
  await click(
    "View progress",
    [...document.querySelectorAll("article")].find((el) =>
      el.textContent.includes(person.name),
    ),
  );
  assert.ok(button("Submit completion for review"));
  assert.ok(!button("Approve completion"));
  await click("Classes", document.querySelector("nav"));
  await click("Register and schedule›");
  assert.ok(button("Register for baptism"));
  await click("Help");
  assert.ok(button("Log out"));
  assert.equal(document.querySelector('a[href="/followups"]'), null);
  assert.equal(document.querySelector('a[href="/overview"]'), null);
  console.log(
    "PASS CFC embedded navigation, chosen-class attendance save and correction, seven distinct credits, missing-class enrolment, approval gate, baptism and account",
  );
} finally {
  await act(async () => root.unmount());
  await unlink(file);
}
