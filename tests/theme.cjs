const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { JSDOM, VirtualConsole } = require("jsdom");
const source = fs.readFileSync(
  path.resolve(__dirname, "../preview.html"),
  "utf8",
);
const scriptAt = source.lastIndexOf("<script>");
const html = source.slice(0, scriptAt) + "</body></html>";
const app = source
  .slice(scriptAt + 8, source.lastIndexOf("</script>"))
  .replace(
    "mountCareUI(document.getElementById('care-app'));",
    "window.disposeCare = mountCareUI(document.getElementById('care-app'));",
  );
const errors = [];
let count = 0;
function ok(condition, name) {
  assert(condition, name);
  count++;
}
function boot(saved, blocked = false) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", (error) => errors.push(error.message));
  const dom = new JSDOM(html, {
    url: "https://review.example/overview",
    runScripts: "outside-only",
    virtualConsole: vc,
  });
  const w = dom.window;
  w.scrollTo = () => {};
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  if (saved) w.localStorage.setItem("vbc-care-theme", saved);
  if (blocked)
    Object.defineProperty(w, "localStorage", {
      get() {
        throw new Error("Storage is blocked");
      },
    });
  w.eval(w.document.getElementById("care-theme-init").textContent);
  ok(
    w.document.documentElement.dataset.theme ===
      (saved === "light" && !blocked ? "light" : "dark"),
    "Pre-paint preference and default",
  );
  w.eval(app);
  return dom;
}
for (const saved of [undefined, "light", "dark", "invalid-value"]) {
  const dom = boot(saved),
    w = dom.window,
    d = w.document;
  const button = d.getElementById("theme-toggle");
  const initial = d.documentElement.dataset.theme;
  ok(
    button.getAttribute("aria-pressed") === String(initial === "dark"),
    "Accessible toggle state",
  );
  const title = d.querySelector("#main h1").textContent;
  button.click();
  const next = initial === "dark" ? "light" : "dark";
  ok(d.documentElement.dataset.theme === next, "Toggle changes theme");
  ok(
    w.localStorage.getItem("vbc-care-theme") === next,
    "Only theme preference saved",
  );
  ok(w.localStorage.length === 1, "No member records saved");
  ok(
    d.querySelector("#main h1").textContent === title,
    "Theme toggle keeps current screen",
  );
  w.disposeCare();
  button.click();
  ok(
    d.documentElement.dataset.theme === next,
    "Toggle listener removed on cleanup",
  );
  dom.window.close();
}
const blocked = boot(undefined, true);
blocked.window.document.getElementById("theme-toggle").click();
ok(
  blocked.window.document.documentElement.dataset.theme === "light",
  "Toggle works without browser storage",
);
blocked.window.disposeCare();
blocked.window.close();
const tabs = boot("light"),
  tw = tabs.window;
tw.dispatchEvent(
  new tw.StorageEvent("storage", { key: "unrelated", newValue: "dark" }),
);
ok(
  tw.document.documentElement.dataset.theme === "light",
  "Ignore unrelated storage changes",
);
tw.dispatchEvent(
  new tw.StorageEvent("storage", { key: "vbc-care-theme", newValue: "dark" }),
);
ok(
  tw.document.documentElement.dataset.theme === "dark",
  "Theme follows other tab",
);
ok(
  tw.document.getElementById("theme-toggle").getAttribute("aria-label") ===
    "Switch to light mode",
  "Cross-tab accessible label",
);
tw.dispatchEvent(new tw.StorageEvent("storage", { key: null, newValue: null }));
ok(
  tw.document.documentElement.dataset.theme === "dark",
  "Cleared preference returns to default",
);
tw.disposeCare();
tw.close();
ok(errors.length === 0, "No theme runtime errors: " + errors.join("; "));
console.log(
  JSON.stringify({
    assertions: count,
    defaultDark: true,
    persistence: true,
    blockedStorage: true,
    lifecycleCleanup: true,
    runtimeErrors: errors,
  }),
);
