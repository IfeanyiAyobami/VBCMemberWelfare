import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import ts from "typescript";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.test" });
for (const k of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLDialogElement",
  "FormData",
])
  Object.defineProperty(globalThis, k, {
    configurable: true,
    value: dom.window[k],
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const files = [];
const compile = async (src, out) => {
  let code = ts
    .transpileModule(await readFile(src, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    })
    .outputText.replace('"./JourneyImport"', '"./.friend-csv-test.mjs"')
    .replace('"./JourneyExtensions"', '"./.friend-fields-test.mjs"')
    .replaceAll('"@/lib/journey/model"', '"./src/lib/journey/model.ts"')
    .replaceAll('"@/lib/journey/intake"', '"./src/lib/journey/intake.ts"');
  const p = new URL("../" + out, import.meta.url);
  files.push(p);
  await writeFile(p, code);
  return p;
};
await compile(
  "src/components/JourneyExtensions.tsx",
  ".friend-fields-test.mjs",
);
await compile("src/components/JourneyImport.tsx", ".friend-csv-test.mjs");
const module = await compile(
  "src/components/FriendRegistration.tsx",
  ".friend-reg-test.mjs",
);
let requests = [],
  saved = 0,
  fail = true;
globalThis.fetch = async (url, options) => {
  if (!options) return Response.json({ items: [] });
  requests.push(JSON.parse(options.body));
  return fail
    ? Response.json({ message: "Fixture interruption" }, { status: 503 })
    : Response.json({ memberId: "fixture-new" });
};
const root = createRoot(document.getElementById("root"));
try {
  const { default: Form } = await import(module.href);
  await act(async () =>
    root.render(
      React.createElement(Form, { onClose: () => {}, onSaved: () => saved++ }),
    ),
  );
  const form = document.querySelector("form");
  // Submit real fields with controlled registration draft values.
  for (const [name, value] of [
    ["first", "Fictional"],
    ["last", "Person"],
    ["phone", "08015550111"],
  ]) {
    const input = form.querySelector(`[name="${name}"]`);
    const props = Object.keys(input).find((k) => k.startsWith("__reactProps"));
    await act(async () => input[props].onChange({ target: { value } }));
  }
  const evidence = form.querySelector('[name="note"]');
  assert(evidence);
  evidence.value = "Met at church welcome desk";
  const props = Object.keys(form).find((k) => k.startsWith("__reactProps"));
  await act(async () =>
    form[props].onSubmit({ preventDefault() {}, currentTarget: form }),
  );
  assert.equal(saved, 0);
  assert(document.body.textContent.includes("Fixture interruption"));
  assert.equal(form.querySelector('[name="first"]').value, "Fictional");
  fail = false;
  await act(async () =>
    form[props].onSubmit({ preventDefault() {}, currentTarget: form }),
  );
  assert.equal(saved, 1);
  assert.equal(requests[0].requestId, requests[1].requestId);
  assert.equal(requests[1].action, "direct");
  assert.equal(requests[1].data.contactConsent, true);
  assert(!document.body.textContent.includes("full view"));
  console.log(
    "PASS in-dashboard registration preserves fields on failure, retries idempotently, uses consent values and never opens full view",
  );
} finally {
  await act(async () => root.unmount());
  await Promise.all(files.map((p) => unlink(p)));
  dom.window.close();
}
