const fs = require("fs");
const assert = require("assert");
const { JSDOM, VirtualConsole } = require("jsdom");
const root = require("path").resolve(__dirname, "..");
const source = fs.readFileSync(root + "/preview.html", "utf8");
const scriptAt = source.lastIndexOf("<script>");
const js = source.slice(scriptAt + 8, source.lastIndexOf("</script>"));
const html = source.slice(0, scriptAt) + "</body></html>";
const errors = [],
  vc = new VirtualConsole();
vc.on("jsdomError", (e) => {
  if (!/navigation.*not implemented/i.test(e.message)) errors.push(e.message);
});
const dom = new JSDOM(html, {
  url: "https://review.example/#overview",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const w = dom.window,
  d = w.document;
w.scrollTo = () => {};
w.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
w.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
w.eval(js);
let count = 0;
const ok = (condition, msg) => {
  assert(condition, msg);
  count++;
};
const tick = () => new Promise((r) => setTimeout(r, 50));
const q = (s) => {
  const el = d.querySelector(s);
  assert(el, "Missing " + s);
  return el;
};
const click = (s) => q(s).click();
const route = async (s) => {
  w.history.pushState(null, "", "/" + s);
  w.dispatchEvent(new w.PopStateEvent("popstate"));
  await tick();
};
const val = (s, v, evt = "input") => {
  const el = q(s);
  el.value = v;
  el.dispatchEvent(new w.Event(evt, { bubbles: true }));
};
const submit = (s) =>
  q(s).dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
const text = () => q("#main").textContent;
(async () => {
  ok(text().includes("Every person matters"), "Overview");
  const screens = [
    "members",
    "profile/m1",
    "celebrations",
    "programmes",
    "campaigns",
    "newsletters",
    "templates",
    "automations",
    "delivery",
    "settings",
    "settings/providers",
    "settings/team",
    "budget",
    "guide",
    "join",
    "preferences",
    "access",
    "access/recover",
    "import",
    "compose",
  ];
  for (const screen of screens) {
    await route(screen);
    ok(q("#main").children.length > 0, "Route " + screen);
    ok(q("#main h1") !== null, "Heading " + screen);
    const ids = [...d.querySelectorAll("[id]")].map((x) => x.id);
    ok(new Set(ids).size === ids.length, "Unique IDs " + screen);
    for (const label of d.querySelectorAll("label[for]"))
      ok(d.getElementById(label.htmlFor) !== null, "Label " + label.htmlFor);
  }
  await route("members");
  val("#member-search", "zzzz");
  ok(text().includes("No members match"), "Empty search");
  click('[data-action="reset-filters"]');
  val("#member-search", "Tomi");
  ok(d.querySelectorAll("tbody tr").length === 1, "Search");
  val("#member-search", "");
  val("#member-status", "Visitor", "change");
  ok(d.querySelectorAll("tbody tr").length === 3, "Filter visitors");
  click('[data-action="add-member"]');
  submit("#member-form");
  ok(
    q("#member-errors").textContent.includes("first name"),
    "Member validation",
  );
  val("#member-first", "Femi");
  val("#member-last", "Adebayo");
  val("#member-email", "femi@example.com");
  submit("#member-form");
  ok(!q("#modal").open, "Member saved");
  val("#member-status", "all", "change");
  ok(text().includes("Femi Adebayo"), "New member appears");
  await route("profile/m1");
  click('[data-action="profile-tab"][data-value="history"]');
  ok(text().includes("Birthday greeting"), "Member history");
  click('[data-action="profile-tab"][data-value="details"]');
  val("#care-note", "Call after Sunday service");
  submit("#note-form");
  await route("overview");
  await route("profile/m1");
  ok(q("#care-note").value === "Call after Sunday service", "Note retention");
  await route("celebrations");
  click('[data-action="cal-type"][data-value="anniversary"]');
  ok(text().includes("Bisi Akinola"), "Anniversary calendar");
  click('[data-action="cal-day"][data-day="9"]');
  ok(text().includes("A quiet day"), "Calendar empty state");
  await route("programmes");
  click('[data-action="add-event"]');
  submit("#event-form");
  ok(q("#event-errors").textContent.includes("venue"), "Event validation");
  val("#event-title", "Prayer Morning");
  val("#event-date", "2026-11-07");
  val("#event-time", "08:00");
  val("#event-venue", "Church auditorium");
  submit("#event-form");
  ok(text().includes("Prayer Morning"), "Event created");
  await route("campaigns");
  click('[data-action="new-campaign"]');
  await tick();
  submit("#campaign-form");
  ok(
    q("#campaign-errors").textContent.includes("name"),
    "Campaign name required",
  );
  val("#campaign-name", "October invitation");
  q('input[value="both"]').checked = true;
  q('input[value="both"]').dispatchEvent(
    new w.Event("change", { bubbles: true }),
  );
  submit("#campaign-form");
  ok(text().includes("People in audience"), "Audience step");
  submit("#campaign-form");
  ok(q("#campaign-body") !== null, "Message step");
  val("#campaign-sms", "Happy birthday, {{first_name}}! 🎉 ".repeat(4));
  ok(
    q("#sms-count").textContent.includes("Unicode"),
    "Unicode segment calculation",
  );
  val(
    "#campaign-sms",
    "Hi {{first_name}}, come for {{programme}} on {{date}}. Vine Branch Church.",
  );
  val("#campaign-body", "Hi {{unsupported}}, welcome.");
  submit("#campaign-form");
  ok(
    q("#campaign-errors").textContent.includes("supported"),
    "Unknown token blocked",
  );
  val(
    "#campaign-body",
    "Hi {{first_name}}, join us for {{programme}} on {{date}}.",
  );
  submit("#campaign-form");
  ok(text().includes("SMS segments in total"), "Review cost");
  submit("#campaign-form");
  ok(
    q("#campaign-errors").textContent.includes("Confirm"),
    "Schedule confirmation required",
  );
  q("#campaign-confirm").checked = true;
  val("#campaign-schedule", "2026-10-20T09:00");
  submit("#campaign-form");
  ok(
    q("#campaign-errors").textContent.includes("before the programme"),
    "Invitation scheduled before event",
  );
  val("#campaign-schedule", "2026-10-15T09:00");
  submit("#campaign-form");
  ok(text().includes("Scheduled in this prototype"), "Schedule success");
  await route("campaigns");
  ok(text().includes("October invitation"), "Campaign saved");
  ok(text().includes("Demo scheduled"), "Simulated status");
  await route("templates");
  val("#template-message", "Dear {{first_name}}, God bless you.");
  ok(
    q("#template-preview-body").textContent.includes("Dear Tomi"),
    "Live template preview",
  );
  submit("#template-form");
  click('[data-action="template-channel"][data-value="sms"]');
  val("#template-message", "A happy birthday, {{first_name}}!");
  submit("#template-form");
  ok(q("#template-preview-body").textContent.includes("Tomi"), "SMS template");
  await route("automations");
  click('[data-action="toggle-automation"][data-id="birthday"]');
  ok(
    q('[data-id="birthday"][role="switch"]').getAttribute("aria-checked") ===
      "false",
    "Pause",
  );
  click('[data-action="configure-automation"][data-id="birthday"]');
  val("#automation-time", "09:15");
  submit("#automation-form");
  ok(text().includes("09:15"), "Rule update");
  await route("delivery");
  click('[data-action="delivery-filter"][data-value="Failed"]');
  ok(d.querySelectorAll("tbody tr").length === 1, "Failed filter");
  click('[data-action="log-detail"]');
  ok(q("#modal").textContent.includes("timeout"), "Failure detail");
  click('[data-action="retry-log"]');
  ok(text().includes("No failed messages"), "Failure leaves filtered queue");
  click('[data-action="delivery-filter"][data-value="Queued"]');
  ok(text().includes("Queued"), "Retry state");
  await route("import");
  click('[data-action="sample-import"]');
  ok(text().includes("4 rows detected"), "CSV parsed");
  click('[data-action="review-import"]');
  ok(text().includes("Duplicate contact"), "Duplicate detection");
  ok(text().includes("Name is missing"), "Invalid row");
  click('[data-action="finish-import"]');
  await tick();
  ok(text().includes("Ada Nnamdi"), "Valid import");
  val("#member-search", "Ada");
  ok(text().includes("No permissions"), "Import consent defaults off");
  val("#member-search", "");
  await route("join");
  submit("#join-form");
  ok(
    q("#join-errors").textContent.includes("surname"),
    "Guest required validation",
  );
  click('[data-action="sample-join"]');
  submit("#join-form");
  ok(q("#join-birthday") !== null, "Milestone inputs");
  val("#join-phone", "123");
  submit("#join-form");
  ok(
    q("#join-errors").textContent.includes("Nigerian mobile"),
    "Guest phone validation",
  );
  val("#join-phone", "08000001100");
  submit("#join-form");
  ok(q("#join-born_again") !== null, "Guest faith step");
  click('[data-action="join-back"]');
  ok(q("#join-phone").value === "08000001100", "Guest back retention");
  submit("#join-form");
  submit("#join-form");
  ok(text().includes("Kemi Ogunleye"), "Guest review");
  submit("#join-form");
  ok(
    q("#join-errors").textContent.includes("permission"),
    "Consent validation",
  );
  q("#join-contact_consent").checked = true;
  submit("#join-form");
  ok(text().includes("We’re so glad you came"), "Welcome message");
  click('a[href^="/profile/m"]');
  await tick();
  ok(
    text().includes("Kemi Ogunleye"),
    "Guest to member at " + w.location.pathname + " " + text().slice(0, 250),
  );
  await route("preferences/m1");
  click('[data-action="unsubscribe"]');
  ok(q("#modal").textContent.includes("Turn off"), "Unsubscribe confirmation");
  click('[data-action="confirm-unsubscribe"]');
  ok(
    !q("#pref-emailOpt").checked && !q("#pref-smsOpt").checked,
    "Preferences off",
  );
  await route("profile/m1");
  ok(text().includes("Off"), "Profile reflects optout");
  await route("budget");
  const initial = text();
  val("#budget-smsAudience", "100");
  submit("#budget-form");
  ok(text() !== initial, "Budget scenario updates");
  val("#budget-members", "1000");
  val("#budget-email", "9");
  submit("#budget-form");
  ok(text().includes("higher-tier quote"), "Pricing tier warning");
  await route("newsletters");
  ok(text().includes("The family letter"), "Newsletter route");
  val(
    "#newsletter-body",
    "Dear {{first_name}}, welcome to our monthly newsletter.",
  );
  ok(
    q("#newsletter-preview-body").textContent.includes("Dear Tomi"),
    "Newsletter preview",
  );
  val("#newsletter-batch", "300");
  submit("#newsletter-form");
  ok(
    q("#newsletter-errors").textContent.includes("must not exceed 300"),
    "Shared quota validation",
  );
  val("#newsletter-batch", "250");
  submit("#newsletter-form");
  ok(q("#modal").textContent.includes("Email recipients"), "Newsletter review");
  click('[data-action="confirm-newsletter"]');
  ok(
    q("#newsletter-confirm-error").textContent.includes("Confirm"),
    "Newsletter confirmation",
  );
  q("#newsletter-confirm").checked = true;
  click('[data-action="confirm-newsletter"]');
  ok(text().includes("Newsletter schedule previewed"), "Newsletter success");
  await route("preferences/m3");
  ok(q("#pref-newsletterOpt").checked, "Separate newsletter permission");
  q("#pref-newsletterOpt").checked = false;
  submit("#preferences-form");
  await route("newsletters");
  click('[data-action="open-newsletter"]');
  submit("#newsletter-form");
  ok(
    q("#modal").textContent.includes("Review newsletter"),
    "Updated recipients",
  );
  click('[data-action="close"]');
  await route("settings/general");
  val("#settings-email", "invalid");
  submit("#settings-form");
  ok(
    q("#settings-errors").textContent.includes("valid sender"),
    "Settings validation",
  );
  val("#settings-email", "office@example.com");
  submit("#settings-form");
  ok(q("#toast").textContent.includes("Settings saved"), "Settings saved");
  await route("access/recover");
  submit("#access-form");
  ok(q("#modal").textContent.includes("sent no email"), "Recovery demo");
  click('[data-action="close"]');
  ok(errors.length === 0, "No runtime errors: " + errors.join("\n"));
  ok(!/fetch\s*\(|XMLHttpRequest/.test(js), "No network code");
  const records =
    fs.readFileSync(root + "/src/lib/care-runtime.js", "utf8") +
    fs.readFileSync(root + "/src/lib/demo-state.js", "utf8");
  ok(!/localStorage|sessionStorage/.test(records), "No member record storage");
  const css =
    fs.readFileSync(root + "/src/app/globals.css", "utf8") +
    fs.readFileSync(root + "/src/app/themes.css", "utf8");
  const csstree = require("css-tree");
  const cssErrors = [];
  csstree.parse(css, { onParseError: (e) => cssErrors.push(e.message) });
  ok(!cssErrors.length, "CSS parsed");
  ok(
    /max-width:\s*720px/.test(css) && /max-width:\s*400px/.test(css),
    "Mobile breakpoints",
  );
  ok(css.includes("prefers-reduced-motion"), "Reduced motion");
  console.log(
    JSON.stringify({
      assertions: count,
      screens: screens.length,
      runtimeErrors: errors,
      networkCalls: 0,
      cssParsed: true,
    }),
  );
  w.close();
})().catch((e) => {
  console.error(e.stack);
  w.close();
  process.exit(1);
});
