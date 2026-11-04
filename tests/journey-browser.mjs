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
    registration_source: "visitor_form",
    visit_purpose: "not_specified",
    followup_state: "active",
    ministry_count: 0,
    home_cell_name: "Fictional Central Cell",
    service_count: 1,
    first_visit_on: "2026-10-04",
    membership_eligible: true,
    previous_visit_confirmed: true,
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
    cfc_cohort: "Fictional Foundation cohort",
    cfc_weeks: [{week:1,status:"present",date:"2026-10-04"},{week:2,status:"absent",date:"2026-10-11"}],
    care_status: "ongoing",
    legacy_member: false,
    assignment_conflict: false,
    registration_source: "visitor_form",
    visit_purpose: "not_specified",
    followup_state: "active",
    ministry_count: 0,
    home_cell_name: "Fictional Central Cell",
    service_count: 1,
    first_visit_on: "2026-10-04",
    membership_eligible: true,
    previous_visit_confirmed: true,
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
const ministries = new Map(),
  supportNotes = new Map();
const contacts = [],
  events = [],
  requests = new Map();
let failContact = true;
let loseAck = true;
let friendOnly = false;
export function setJourneyFriendOnly(value) {
  friendOnly = value;
}
export const journeyFixture = { records, contacts, events };
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
  if (url.pathname.endsWith("care_journey_can_register")) {json(res,200,true);return true;}
  if (url.pathname.endsWith("care_journey_report")) {
    const rows = records
      .filter((p) => !d.p_worker || p.assigned_to === d.p_worker)
      .map((p) => ({
        ...p,
        cohort_date: "2026-10-01",
        cohort_date_basis: "Fictional fixture",
        joined_by_period_end: p.official_joined_on,
        followup_outcomes: [],
        church_attendance: [],
        ministry: [],
        home_cells: [],
      }));
    json(res, 200, {
      from: d.p_from,
      to: d.p_to,
      total: rows.length,
      rows,
      scoreboard: {
        new_visitors: 1,
        direct_joiners: records.filter(
          (p) => p.registration_source === "direct" && p.official_joined_on,
        ).length,
        conversion_rate: 100,
      },
      definitions: {
        conversion: "Direct joiners are excluded from visitor conversion.",
        current_metrics: "Current assignment filter.",
      },
      friend_summary: [{friend:"Fixture administrator",people:rows.length,joined_by_period_end:1,contact_attempts:1,conversations:1,overdue_now:1,cfc_enrolled_now:1}],
      generated_at: new Date().toISOString(),
    });
    return true;
  }
  if (url.pathname.endsWith("care_journey_direct")) {
    const prev = requests.get(d.p_request);
    if (prev) {
      json(res, 200, prev);
      return true;
    }
    const x = d.p_data;
    const p = {
      ...records[0],
      member_id: uid(records.length + 1),
      name: x.first + " " + x.last,
      registration_source: "direct",
      service_count: x.previousVisitDate ? 1 : 0,
      first_visit_on: x.previousVisitDate || null,
      membership_eligible: !!x.previousVisitDate,
      previous_visit_confirmed:
        !!x.previousVisitDate || x.previousVisitConfirmed === "true",
      status: "visitor",
      official_joined_on: null,
      care_until: null,
      phone: x.phone,
      email: x.email,
      visit_purpose: "not_specified",
      followup_state: "active",
      contact_consent: x.contactConsent !== false,
    };
    records.push(p);
    const result = { saved: true, memberId: p.member_id };
    requests.set(d.p_request, result);
    json(res, 200, result);
    return true;
  }
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
    if (d.p_action === "purpose") p.visit_purpose = d.p_data.purpose;
    if (d.p_action === "followup_state") p.followup_state = d.p_data.state;
    if (d.p_action === "ministry_add") {
      const list = ministries.get(p.member_id) || [];
      list.push({
        id: uid(600 + list.length),
        team_name: d.p_data.team,
        responsibility: d.p_data.responsibility,
        joined_on: d.p_data.date || null,
        left_on: null,
        active: true,
      });
      ministries.set(p.member_id, list);
    }
    if (d.p_action === "support") {
      const list = supportNotes.get(p.member_id) || [];
      list.push({
        id: uid(700 + list.length),
        note: d.p_data.note,
        actor: worker,
        created_at: new Date().toISOString(),
      });
      supportNotes.set(p.member_id, list);
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
  if(d.p_stage==='eligible')items=items.filter(p=>p.membership_eligible&&p.status!=='member');
  if(d.p_stage==='unassigned')items=items.filter(p=>!p.assigned_to&&p.status!=='member'&&p.followup_state==='active');
  if(d.p_stage==='overdue')items=items.filter(p=>(p.contact_count===0&&p.next_due&&p.status!=='member'&&Date.parse(p.registered_at)<Date.now()-7*86400000)||(p.contact_count>0&&Date.parse(p.next_due)<Date.now()));
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
            evidence: "Fictional visitor reported attendance during Follow Through",
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
        ministry: ministries.get(p.member_id) || [],
        home_cells: [
          {
            id: uid(600),
            cell_id: uid(601),
            cell_name: "Fictional Central Cell",
            area_name: "Fictional Area",
            active: true,
            joined_at: "2026-09-01",
            left_at: null,
          },
        ],
        home_transfers: [],
        welfare: supportNotes.get(p.member_id) || [],
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
      coordinator: admin && !friendOnly,
      foundation: admin && !friendOnly,
      administrator: admin && !friendOnly,
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
  await page.getByRole("heading", { name: "Today’s care" }).waitFor();
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
  await page.setViewportSize({width:1440,height:1000});
  async function todayPage(){await page.goto(origin+'/followups');await page.getByRole('heading',{name:'Today’s care'}).waitFor();}
  for(const [label,view,stage] of [['Ready to join','membership','eligible'],['Awaiting a friend','visitors','unassigned'],['Overdue','all','overdue']]){
    const response=page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname==='/api/journey'&&u.searchParams.get('view')===view&&u.searchParams.get('stage')===stage;});
    await page.getByRole('button',{name:new RegExp('^'+label)}).click();
    assert.equal((await response).status(),200,'Metric opens a matching server filter');
    if(stage==='eligible')await page.getByLabel('Membership queue').selectOption('eligible');
    if(stage==='unassigned')await page.locator('.vj-person-row').first().waitFor({state:'hidden'});
    if(stage==='overdue')assert.equal(await page.getByLabel('Today queue').inputValue(),'overdue');
    await todayPage();
  }
  for(const state of ['paused','inactive']){
    records[0].followup_state=state;
    await page.goto(origin+'/followups?person='+uid(1));
    await page.getByRole('heading',{name:'Fictional Ada Sample',exact:true}).waitFor();
    assert.equal(await page.locator('a[href^="tel:"]').count(),0,'Call links respect '+state+' outreach');
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator('.vj-quickbar').getByRole('button',{name:'WhatsApp',exact:true}).count(),0,'Mobile WhatsApp shortcut respects '+state);
    await page.setViewportSize({width:1440,height:1000});
  }
  records[0].followup_state='active';await todayPage();
  await page.keyboard.press("/");
  await page
    .getByRole("combobox", { name: "Search people or sections" })
    .fill("Fictional Ada");
  await page
    .getByRole("option", { name: /Fictional Ada Sample/ })
    .waitFor();
  let releaseSearch;const delayed=new Promise(r=>releaseSearch=r);
  const delayedRoute=async route=>{const r=await route.fetch();await delayed;await route.fulfill({response:r});};
  await page.route('**/api/journey?search=Fictional+Bayo**',delayedRoute);
  await page.getByRole('combobox',{name:'Search people or sections'}).fill('Fictional Bayo');
  assert.equal(await page.getByRole('option',{name:/Fictional Ada Sample/}).count(),0,'Previous-query results disappear immediately');
  await page.keyboard.press('Enter');assert(await page.getByRole('dialog',{name:'Find a person or section'}).isVisible(),'Enter cannot choose a stale person');
  releaseSearch();await page.getByRole('option',{name:/Fictional Bayo Example/}).waitFor();
  await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Fictional Bayo Example',exact:true}).waitFor();
  await page.unroute('**/api/journey?search=Fictional+Bayo**',delayedRoute);await todayPage();
  console.log('PASS v4.0.1 metric filters, paused/inactive outreach shortcuts and stale-search Enter regression');
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("link", { name: "Call Fictional Ada Sample", exact: true })
      .getAttribute("href"),
    "tel:+2348015550998",
    "Queue rows offer a direct call when contact is permitted",
  );
  await page
    .locator(".vj-queue-row")
    .filter({ hasText: "Fictional Ada Sample" })
    .getByRole("button", { name: "Log outcome", exact: true })
    .click();
  await page.getByRole("heading", { name: "Fictional Ada Sample" }).waitFor();
  await page.getByLabel("Care note", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Community',exact:true}).click();
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const pinned=await page.locator('.vj-quickbar').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight-70;});
  assert(pinned,'Mobile quick actions remain above bottom navigation after scrolling');
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>window.scrollTo(0,0));
  await page.getByRole('button',{name:'Journey',exact:true}).click();
  console.log('PASS v4.0.1 mobile quick actions stay pinned on long profiles');
  await page
    .getByRole("button", { name: "Log outcome", exact: true })
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
    .getByRole("button", { name: "Log outcome", exact: true })
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
  await page.getByRole("button", { name: "Contact log", exact: true }).click();
  await page.getByText("MAIN CHURCH WEBSITE", { exact: false }).waitFor();
  await page
    .getByRole("button", { name: "Membership & CFC", exact: true })
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
  await page.getByRole("button", { name: "Contact log", exact: true }).click();
  assert(
    await page.getByText("MAIN CHURCH WEBSITE", { exact: false }).isVisible(),
    "Original guest source remains visible after joining",
  );
  await page
    .getByRole("button", { name: "Membership & CFC", exact: true })
    .click();
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
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Visit purpose", exact: true })
    .click();
  await page
    .getByLabel("Visit purpose / interest", { exact: true })
    .selectOption("special_occasion");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Community", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add ministry team", exact: true })
    .click();
  await page
    .getByLabel("Ministry / activity team", { exact: true })
    .fill("Fictional Media Team");
  await page
    .getByLabel("Role / responsibility", { exact: true })
    .fill("Volunteer");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Fictional Media Team", { exact: true }).waitFor();
  await page.getByText("Fictional Central Cell", { exact: true }).waitFor();
  await page
    .locator(".vj-sidebar")
    .getByRole("button", { name: "Reports & Friends analysis", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "People included in this period" })
    .waitFor();
  for (const [width, height] of [
    [1440, 1000],
    [834, 1112],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "Reports must fit mobile/tablet",
    );
    if (process.env.HCO_SCREENSHOT_DIR)
      await page.screenshot({
        path: process.env.HCO_SCREENSHOT_DIR + `/v38-reports-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
  }
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Excel", exact: true })
    .click();
  assert((await download).suggestedFilename().endsWith(".xlsx"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator(".vj-sidebar")
    .getByRole("button", { name: "Visitors", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Register a person", exact: true })
    .click();
  await page.getByLabel("Other names", { exact: true }).fill("Walk-in");
  await page.getByLabel("Surname", { exact: true }).fill("Fictional Member");
  await page.getByLabel("Phone", { exact: true }).fill("+2348015550988");
  await page.getByRole("checkbox", { name: "SMS", exact: true }).uncheck();
  await page
    .getByLabel("Find an existing person", { exact: true })
    .fill("Fictional");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Search", exact: true })
    .click();
  await page
    .getByLabel("Existing person or new registration", { exact: true })
    .selectOption(uid(1));
  await page
    .getByRole("checkbox", { name: "I checked the identity", exact: false })
    .check();
  await page
    .getByLabel("Existing person or new registration", { exact: true })
    .selectOption(uid(2));
  assert(
    !(await page
      .getByRole("checkbox", { name: "I checked the identity", exact: false })
      .isChecked()),
    "Identity confirmation resets when a different person is selected",
  );
  await page
    .getByLabel("Existing person or new registration", { exact: true })
    .selectOption("");
  assert.equal(
    await page.getByLabel("Other names", { exact: true }).inputValue(),
    "Walk-in",
  );
  assert(
    !(await page
      .getByRole("checkbox", { name: "SMS", exact: true })
      .isChecked()),
    "Explicit opt-out survives identity lookup choices",
  );
  await page
    .getByLabel("Registration source / evidence", { exact: true })
    .fill("Direct Membership Sunday fixture, previous visit date not known");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("heading", { name: "Walk-in Fictional Member", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Membership & CFC", exact: true }).click();
  assert(
    await page
      .getByRole("button", { name: "Confirm joined", exact: true })
      .isDisabled(),
    "Direct registration does not invent previous attendance or auto-join",
  );
  console.log(
    "PASS v3.8 single previous visit, classification, ministry history, reused Home Cell details, responsive reports, Excel download and direct registration without invented attendance",
  );
  assert.deepEqual(errors, []);
  page.off("pageerror", listener);
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    "PASS Journey desktop/tablet/mobile in both themes, form retention after error/theme changes, contact save, explicit joining and original guest history retention",
  );
}
