import assert from "node:assert/strict";
const uid = (n) => "80000000-0000-4000-8000-" + String(n).padStart(12, "0");
const worker = "11111111-1111-4111-8111-111111111111";
const records = [
  {
    member_id: uid(1),
    version: 1,
    name: "Fictional Ada Sample",
    status: "visitor",
    assigned_to: worker,
    worker_name: "Fixture administrator",
    intention: "interested",
    official_joined_on: null,
    care_until: null,
    care_status: "ongoing",
    legacy_member: false,
    assignment_conflict: false,
    service_count: 2,
    contact_count: 0,
    registered_at: "2026-10-01T10:00:00Z",
    reported_first_visit: "2026-10-01",
    next_due: "2026-10-03T10:00:00Z",
    phone: "+2348015550998",
    email: "fictional@example.invalid",
    contact_consent: true,
    email_opt_in: true,
    sms_opt_in: true,
  },
  {
    member_id: uid(2),
    version: 1,
    name: "Fictional Bayo Example",
    status: "member",
    assigned_to: worker,
    worker_name: "Fixture administrator",
    intention: "interested",
    official_joined_on: "2026-09-27",
    care_until: "2027-03-27",
    care_status: "ongoing",
    legacy_member: false,
    assignment_conflict: false,
    service_count: 2,
    contact_count: 1,
    registered_at: "2026-09-01T10:00:00Z",
    reported_first_visit: "2026-09-01",
    next_due: "2026-10-25T10:00:00Z",
    phone: null,
    email: null,
    contact_consent: true,
    email_opt_in: true,
    sms_opt_in: true,
  },
];
const contacts = [],
  events = [],
  requests = new Map();
let failContact = true;
let loseAck = true;
export async function journeyMock(req, res, url, auth, json) {
  if (!url.pathname.startsWith("/rest/v1/rpc/care_journey_")) return false;
  if (
    !auth?.user?.active ||
    !["administrator", "followup_worker"].includes(auth.user.role)
  ) {
    json(res, 403, { code: "42501", message: "Journey access not assigned" });
    return true;
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const d = JSON.parse(raw);
  const admin = auth.user.role === "administrator";
  if (url.pathname.endsWith("care_journey_write")) {
    if (d.p_action === "contact" && failContact) {
      failContact = false;
      json(res, 400, {
        code: "22023",
        message: "Fixture connection recovered. Please check and retry.",
      });
      return true;
    }
    const prev = requests.get(d.p_request);
    if (prev) {
      json(res, 200, prev);
      return true;
    }
    const p = records.find((p) => p.member_id === d.p_data.memberId);
    if (!p) {
      json(res, 400, { code: "22023", message: "Select a person." });
      return true;
    }
    if (d.p_action === "contact") {
      contacts.unshift({
        id: uid(50 + contacts.length),
        method: d.p_data.method,
        outcome: d.p_data.outcome,
        note: d.p_data.note,
        occurred_at: d.p_data.occurredAt,
      });
      p.contact_count++;
      p.next_due = d.p_data.nextDue || null;
    }
    if (d.p_action === "join") {
      p.status = "member";
      p.official_joined_on = d.p_data.date;
      p.care_until = "2027-04-24";
    }
    p.version++;
    events.unshift({
      id: uid(100 + events.length),
      action: d.p_action,
      detail: d.p_data,
      created_at: new Date().toISOString(),
    });
    requests.set(d.p_request, { saved: true });
    if (
      d.p_action === "contact" &&
      d.p_data.note === "Lost acknowledgement fixture" &&
      loseAck
    ) {
      loseAck = false;
      json(res, 503, { code: "fixture_lost_ack" });
      return true;
    }
    json(res, 200, { saved: true });
    return true;
  }
  let items = records.filter((p) => admin || p.assigned_to === auth.user.id);
  if (d.p_search)
    items = items.filter((p) =>
      p.name.toLowerCase().includes(d.p_search.toLowerCase()),
    );
  if (d.p_view === "membership")
    items = items.filter((p) => p.status !== "member");
  if (d.p_view === "visitors")
    items = items.filter((p) => p.status !== "member");
  if (["care", "cfc"].includes(d.p_view))
    items = items.filter((p) => p.status === "member");
  const p = records.find((p) => p.member_id === d.p_member);
  const detail = p
    ? {
        person: p,
        attendance: [
          {
            id: uid(4),
            service_key: "Main service",
            service_date: "2026-10-04",
            service_type: "Sunday service",
            source: "phone",
            evidence: "Fictional visitor reported attendance during follow-up",
            verification: "self_report",
            qualifies: true,
          },
        ],
        contacts,
        tasks: p.next_due
          ? [
              {
                id: uid(30),
                kind: "callback",
                due_at: p.next_due,
                note: "Fictional next action",
              },
            ]
          : [],
        events,
        guests: [
          {
            id: uid(20),
            visit_date: p.reported_first_visit,
            source: "wordpress",
            review_status: "accepted",
          },
        ],
        legacy_contacts: [],
        cfc: null,
        cfc_attendance: [],
      }
    : null;
  json(res, 200, {
    items,
    total: items.length,
    detail,
    stats: {
      visitors: records.filter((p) => p.status !== "member").length,
      unassigned: 0,
      eligible: records.filter((p) => p.status !== "member").length,
      members: 1,
      care: 1,
      overdue: 1,
    },
    capabilities: {
      coordinator: admin,
      foundation: admin,
      administrator: admin,
      friend: true,
    },
    policy: {
      service_types: ["Sunday service"],
      first_contact_hours: 48,
      cfc_policy: null,
      care_policy: null,
    },
    team: [
      {
        id: worker,
        name: "Fixture administrator",
        role: "administrator",
        capabilities: [],
      },
    ],
    cohorts: [],
  });
  return true;
}
export async function runJourneyBrowser(page, origin) {
  const errors = [];
  const listener = (e) => errors.push(e.message);
  page.on("pageerror", listener);
  await page.goto(origin + "/followups");
  await page.getByRole("heading", { name: "From a warm welcome" }).waitFor();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    for (const [width, height] of [
      [1440, 1000],
      [834, 1112],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(240);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "Journey has no horizontal overflow",
      );
      if (process.env.HCO_SCREENSHOT_DIR)
        await page.screenshot({
          path:
            process.env.HCO_SCREENSHOT_DIR + `/journey-${theme}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator(".vj-person-row")
    .filter({ hasText: "Fictional Ada Sample" })
    .click();
  await page.getByRole("heading", { name: "Fictional Ada Sample" }).waitFor();
  await page
    .getByRole("button", { name: "Record activity", exact: true })
    .click();
  await page
    .getByLabel("Care note", { exact: true })
    .fill("Retain this note while changing the theme and retrying.");
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  assert.equal(
    await page.getByLabel("Care note", { exact: true }).inputValue(),
    "Retain this note while changing the theme and retrying.",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Your entered details are still here" })
    .waitFor();
  assert.equal(
    await page.getByLabel("Care note", { exact: true }).inputValue(),
    "Retain this note while changing the theme and retrying.",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Saved successfully" })
    .waitFor();
  await page
    .getByRole("button", { name: "Record activity", exact: true })
    .click();
  await page
    .getByLabel("Care note", { exact: true })
    .fill("Lost acknowledgement fixture");
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .evaluate((e) => {
        const r = e.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      }),
    "Mobile dialog keeps its save action reachable",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Your entered details are still here" })
    .waitFor();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    contacts.length,
    2,
    "Retry after lost acknowledgement cannot create duplicate activity",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  const invalid = await page.request.get(
    origin + "/api/journey?memberId=not-a-person",
  );
  assert.equal(invalid.status(), 400);
  const foreign = await page.request.post(origin + "/api/journey", {
    headers: { Origin: "https://foreign.invalid" },
    data: {},
  });
  assert.equal(foreign.status(), 403);
  const oversized = await page.request.post(origin + "/api/journey", {
    headers: { Origin: origin },
    data: { note: "x".repeat(18000) },
  });
  assert.equal(oversized.status(), 413);
  const privateRead = await page.request.get(origin + "/api/journey");
  assert.match(privateRead.headers()["cache-control"], /no-store/);
  await page.getByRole("button", { name: "history", exact: true }).click();
  await page.getByText("MAIN CHURCH WEBSITE", { exact: false }).waitFor();
  await page
    .getByRole("button", { name: "membership", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Confirm joined", exact: true })
    .click();
  await page
    .getByLabel("Joining confirmation and evidence")
    .fill("Fictional joining confirmed by the fixture Coordinator");
  await page
    .getByRole("button", { name: "Confirm official joining", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Official membership confirmed" })
    .waitFor();
  await page.getByRole("button", { name: "history", exact: true }).click();
  assert(
    await page.getByText("MAIN CHURCH WEBSITE", { exact: false }).isVisible(),
    "Original guest source remains visible after joining",
  );
  await page.getByRole("button", { name: "CFC", exact: true }).first().click();
  assert(
    await page
      .getByText(
        "Completion, make-up and certificate rules await church approval.",
      )
      .isVisible(),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("vbc-care-theme")),
    "dark",
  );
  await page.reload();
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    "dark",
  );
  assert.deepEqual(errors, []);
  page.off("pageerror", listener);
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    "PASS Journey desktop/tablet/mobile in both themes, form retention after error/theme changes, contact save, explicit joining and original guest history retention",
  );
}
