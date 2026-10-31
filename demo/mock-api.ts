/* Fictional in-browser API for the VBC Member Care live demo.
 * Mirrors the response shapes of /api/journey, /api/whatsapp and
 * /api/journey/report. Nothing leaves the browser; changes reset on reload. */
import type { JourneyPerson, Entry } from "@/lib/journey/model";


const DAY = 86400000;
const now = Date.now();
const iso = (offsetDays: number, hour = 10) => {
  const d = new Date(now + offsetDays * DAY);
  d.setUTCHours(hour - 1, 0, 0, 0);
  return d.toISOString();
};
const day = (offsetDays: number) => iso(offsetDays).slice(0, 10);
let seq = 1;
const id = () =>
  "80000000-0000-4000-8000-" + String(seq++).padStart(12, "0");

export const ME = "11111111-1111-4111-8111-111111111111";
const TUNDE = "22222222-2222-4222-8222-222222222222";
const team = [
  { id: ME, name: "Grace Adebayo", role: "administrator", capabilities: [] },
  { id: TUNDE, name: "Tunde Bello", role: "followup_worker", capabilities: [] },
];

function person(p: Partial<JourneyPerson> & { name: string }): JourneyPerson {
  return {
    member_id: id(),
    version: 1,
    status: "visitor",
    assigned_to: ME,
    worker_name: "Grace Adebayo",
    intention: "interested",
    official_joined_on: null,
    care_until: null,
    care_status: "ongoing",
    legacy_member: false,
    assignment_conflict: false,
    membership_review: false,
    registration_source: "visitor_form",
    direct_registered_at: null,
    visit_purpose: "exploring",
    followup_state: "active",
    ministry_count: 0,
    home_cell_name: null,
    service_count: 1,
    first_visit_on: day(-14),
    membership_eligible: true,
    previous_visit_confirmed: true,
    contact_count: 1,
    registered_at: iso(-14),
    reported_first_visit: day(-14),
    next_due: iso(1),
    phone: "+2348015550100",
    whatsapp: null,
    email: null,
    contact_consent: true,
    email_opt_in: true,
    sms_opt_in: true,
    ...p,
  };
}

const people: JourneyPerson[] = [
  person({ name: "Adaeze Okafor", next_due: iso(-4), phone: "+2348015550192", first_visit_on: day(-27), reported_first_visit: day(-27), service_count: 2, contact_count: 2, visit_purpose: "membership_interest" }),
  person({ name: "Samuel Bankole", next_due: iso(-2), phone: "+2348035550144", service_count: 0, membership_eligible: false, contact_count: 0, first_visit_on: null, reported_first_visit: day(-20), registered_at: iso(-20) }),
  person({ name: "Folake Adeyemi", status: "member", official_joined_on: day(-34), care_until: day(150), next_due: iso(-1), phone: "+2348065550137", home_cell_name: "Mokola Central", ministry_count: 1, service_count: 4, contact_count: 5 }),
  person({ name: "Chinedu Eze", next_due: iso(0, 16), phone: "+2348095550121", service_count: 0, membership_eligible: false, contact_count: 0, registered_at: iso(-6), reported_first_visit: day(-6), first_visit_on: null, registration_source: "staff_visitor" }),
  person({ name: "Ifeoma Nwosu", next_due: iso(0, 18), phone: "+2348025550110", assigned_to: TUNDE, worker_name: "Tunde Bello", reported_first_visit: day(-13) }),
  person({ name: "Kemi Alade", next_due: iso(3), assigned_to: null, worker_name: null, phone: "+2348055550108", service_count: 0, membership_eligible: false, contact_count: 0, first_visit_on: null }),
  person({ name: "Yusuf Ibrahim", next_due: iso(5), assigned_to: null, worker_name: null, phone: "+2348075550103", visit_purpose: "temporary" }),
  person({ name: "Bisola Ogunleye", next_due: iso(7), status: "member", official_joined_on: day(-90), care_until: day(92), home_cell_name: "Bodija North", phone: "+2348015550175", service_count: 9, contact_count: 7 }),
  person({ name: "Tolu Afolabi", next_due: null, phone: null, contact_consent: false, followup_state: "paused", visit_purpose: "another_church", reported_first_visit: day(-40) }),
];

type Store = {
  contacts: Map<string, Entry[]>;
  events: Map<string, Entry[]>;
  ministry: Map<string, any[]>;
  welfare: Map<string, any[]>;
  wa: { campaigns: any[]; messages: any[]; permissions: Map<string, any> };
};
const store: Store = {
  contacts: new Map(),
  events: new Map(),
  ministry: new Map(),
  welfare: new Map(),
  wa: {
    campaigns: [
      {
        id: id(),
        title: "This Sunday — Spring Service & Glorious Worship",
        body: "Hi {{1}},\nWe would love to see you this Sunday at Vine Branch Church.\nSpring Service: 8 AM. Glorious Worship: 10 AM.\nNo 1, Olubadan Palace Road, off Queen Elizabeth Road, Mokola, Ibadan.\nWould you like help with directions?",
        template_name: null,
        language: "en",
        flyer: "__FLYER__",
      },
    ],
    messages: [],
    permissions: new Map(),
  },
};
for (const p of people) {
  const c: Entry[] = [];
  for (let i = 0; i < p.contact_count; i++)
    c.push({
      id: id(),
      method: i % 2 ? "whatsapp" : "phone",
      outcome: i === 0 ? "positive" : "promised_return",
      note:
        i === 0
          ? "Welcome call. Grateful for the visit and asked about the next service."
          : "Said she will come back on Sunday with her sister.",
      occurred_at: iso(-10 + i * 3, 17),
      actor_name: p.worker_name || "Grace Adebayo",
    });
  store.contacts.set(p.member_id, c);
  store.events.set(p.member_id, [
    { id: id(), action: "guest_accepted", created_at: iso(-14), actor_name: "Grace Adebayo", detail: {} },
  ]);
  if (p.ministry_count)
    store.ministry.set(p.member_id, [
      { id: id(), team_name: "Media Team", responsibility: "Camera volunteer", joined_on: day(-20), left_on: null, active: true },
    ]);
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function stats() {
  const t = Date.now();
  return {
    overdue: people.filter((p) => p.next_due && Date.parse(p.next_due) < t).length,
    visitors: people.filter((p) => p.status !== "member" && p.followup_state === "active").length,
    unassigned: people.filter((p) => !p.assigned_to).length,
    eligible: people.filter((p) => p.status !== "member" && p.membership_eligible).length,
    members: people.filter((p) => p.status === "member").length,
    care: people.filter((p) => p.status === "member" && p.care_status !== "completed").length,
  };
}

function detail(p: JourneyPerson) {
  return {
    person: p,
    attendance: p.service_count
      ? [
          {
            id: id(),
            service_key: "Sunday service",
            service_date: p.first_visit_on || day(-7),
            service_type: "Sunday service",
            source: "usher",
            evidence: "Recorded by the welcome team",
            verification: "staff",
            qualifies: true,
          },
        ]
      : [],
    contacts: store.contacts.get(p.member_id) || [],
    tasks: p.next_due ? [{ id: id(), kind: "callback", due_at: p.next_due, note: "Follow-up call" }] : [],
    events: store.events.get(p.member_id) || [],
    guests: [{ id: id(), visit_date: p.reported_first_visit || day(-7), source: "wordpress", review_status: "accepted" }],
    legacy_contacts: [],
    cfc: null,
    cfc_attendance: [],
    previous_visits: [],
    ministry: store.ministry.get(p.member_id) || [],
    home_cells: p.home_cell_name
      ? [{ id: id(), cell_id: id(), cell_name: p.home_cell_name, area_name: "Mokola Area", active: true, joined_at: day(-30), left_at: null }]
      : [],
    home_transfers: [],
    welfare: store.welfare.get(p.member_id) || [],
  };
}

function readJourney(q: URLSearchParams) {
  const view = q.get("view") || "all",
    search = (q.get("search") || "").toLowerCase(),
    stage = q.get("stage") || "all",
    page = Number(q.get("page") || 0),
    member = q.get("memberId");
  let items = people.slice();
  if (search) items = items.filter((p) => p.name.toLowerCase().includes(search));
  if (["visitors", "membership", "followups", "attendance"].includes(view))
    items = items.filter((p) => p.status !== "member");
  if (view === "membership") items = items.filter((p) => p.membership_eligible);
  if (["care", "cfc"].includes(view)) items = items.filter((p) => p.status === "member");
  if (view === "visitors") {
    items =
      stage === "all"
        ? items.filter((p) => p.followup_state === "active")
        : items.filter((p) => p.followup_state === stage);
  }
  items.sort(
    (a, b) =>
      (a.next_due ? Date.parse(a.next_due) : Infinity) -
      (b.next_due ? Date.parse(b.next_due) : Infinity),
  );
  const p = member ? people.find((x) => x.member_id === member) : null;
  return {
    items: items.slice(page * 30, page * 30 + 30),
    total: items.length,
    detail: p ? detail(p) : null,
    stats: stats(),
    capabilities: { coordinator: true, foundation: true, administrator: true, friend: true },
    policy: {
      service_types: ["Sunday service", "Midweek service"],
      first_contact_hours: 48,
      cfc_policy: null,
      care_policy: null,
    },
    team,
    cohorts: [{ id: id(), name: "November foundation class", starts_on: day(9) }],
  };
}

function writeJourney(body: any) {
  const { action, data } = body;
  if (action === "direct") {
    const p = person({
      name: `${data.first || "New"} ${data.last || "Person"}`.trim(),
      registration_source: "direct",
      phone: data.phone || null,
      email: data.email || null,
      service_count: data.previousVisitDate ? 1 : 0,
      membership_eligible: !!data.previousVisitDate,
      first_visit_on: data.previousVisitDate || null,
      contact_count: 0,
      next_due: iso(2),
      registered_at: new Date().toISOString(),
      reported_first_visit: day(0),
    });
    people.push(p);
    store.contacts.set(p.member_id, []);
    store.events.set(p.member_id, [{ id: id(), action: "direct", created_at: new Date().toISOString(), actor_name: "Grace Adebayo", detail: {} }]);
    return json(200, { saved: true, memberId: p.member_id });
  }
  const p = people.find((x) => x.member_id === data?.memberId);
  if (!p && !["policy", "role", "cohort"].includes(action))
    return json(400, { message: "Select a person." });
  if (p) {
    if (action === "contact") {
      store.contacts.get(p.member_id)!.unshift({
        id: id(),
        method: data.method,
        outcome: data.outcome,
        note: data.note,
        occurred_at: data.occurredAt || new Date().toISOString(),
        actor_name: "Grace Adebayo",
      });
      p.contact_count++;
      p.next_due = data.nextDue || null;
    }
    if (action === "assign") {
      const w = team.find((t) => t.id === data.worker);
      p.assigned_to = w?.id || ME;
      p.worker_name = w?.name || "Grace Adebayo";
    }
    if (action === "join") {
      p.status = "member";
      p.official_joined_on = data.date || day(0);
      p.care_until = day(182);
    }
    if (action === "purpose") p.visit_purpose = data.purpose;
    if (action === "followup_state") p.followup_state = data.state;
    if (action === "ministry_add") {
      const list = store.ministry.get(p.member_id) || [];
      list.push({ id: id(), team_name: data.team, responsibility: data.responsibility, joined_on: data.date || null, left_on: null, active: true });
      store.ministry.set(p.member_id, list);
      p.ministry_count = list.length;
    }
    if (action === "support") {
      const list = store.welfare.get(p.member_id) || [];
      list.push({ id: id(), note: data.note, actor: ME, created_at: new Date().toISOString() });
      store.welfare.set(p.member_id, list);
    }
    p.version++;
    store.events.get(p.member_id)?.unshift({ id: id(), action, detail: data, created_at: new Date().toISOString(), actor_name: "Grace Adebayo" });
  }
  return json(200, { saved: true });
}

function report(q: URLSearchParams) {
  if (q.get("format") && q.get("format") !== "json")
    return new Response("name,status\n" + people.map((p) => `${p.name},${p.status}`).join("\n"), {
      status: 200,
      headers: { "Content-Type": "text/csv" },
    });
  const rows = people
    .filter((p) => !q.get("worker") || p.assigned_to === q.get("worker"))
    .map((p) => ({
      ...p,
      cohort_date: p.reported_first_visit,
      cohort_date_basis: "First reported visit",
      joined_by_period_end: p.official_joined_on,
      followup_outcomes: [],
      church_attendance: [],
      ministry: [],
      home_cells: p.home_cell_name ? [p.home_cell_name] : [],
    }));
  return json(200, {
    from: q.get("from") || day(-30),
    to: q.get("to") || day(0),
    total: rows.length,
    rows,
    scoreboard: {
      new_visitors: people.filter((p) => p.status !== "member").length,
      direct_joiners: people.filter((p) => p.registration_source === "direct" && p.official_joined_on).length,
      conversion_rate: 22,
    },
    definitions: {
      conversion: "Direct joiners are excluded from visitor conversion.",
      current_metrics: "Current assignment filter.",
    },
    generated_at: new Date().toISOString(),
  });
}

function whatsapp(method: string, q: URLSearchParams, body: any) {
  const wa = store.wa;
  if (method === "GET") {
    const m = q.get("memberId");
    const p = people.find((x) => x.member_id === m);
    return json(200, {
      coordinator: true,
      contact_allowed: !!p?.contact_consent,
      permission: wa.permissions.get(m) || null,
      campaigns: wa.campaigns,
      messages: wa.messages.filter((x) => x.member_id === m),
      replies: [],
      apiReady: false,
    });
  }
  let result: unknown = null;
  if (body.action === "campaign") {
    result = id();
    wa.campaigns.push({ id: result, title: body.title, body: body.body, template_name: body.template || null, language: body.language, flyer: "__FLYER__" });
  } else if (body.action === "permission") {
    wa.permissions.set(body.memberId, { allowed: body.allowed, evidence: body.evidence });
  } else if (body.action === "prepare") {
    if (body.mode === "api")
      return json(400, { message: "WhatsApp API is not configured. Use staff-assisted sending." });
    const p = people.find((x) => x.member_id === body.memberId);
    let m = wa.messages.find((x) => x.id === body.requestId);
    if (!m) {
      m = {
        id: body.requestId,
        member_id: body.memberId,
        campaign_id: body.campaignId,
        mode: body.mode,
        body: body.body,
        recipient: p?.phone || "+2348015550100",
        state: "opened",
        actor: ME,
        error_code: null,
        created_at: new Date().toISOString(),
        recorded_at: null,
        outcome: null,
        provider_id: null,
      };
      wa.messages.unshift(m);
    }
    result = m;
  } else if (body.action === "record") {
    const m = wa.messages.find((x) => x.id === body.messageId);
    if (m) {
      m.state = "staff_" + body.outcome;
      m.outcome = body.outcome;
      m.recorded_at = new Date().toISOString();
    }
  } else return json(400, { message: "Check the invitation details." });
  return json(200, { saved: true, result });
}

export function installMockApi(flyer: string) {
  for (const c of store.wa.campaigns) c.flyer = flyer;
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, location.href);
    if (!url.pathname.startsWith("/api/") && !raw.startsWith("/api/")) return real(input, init);
    const path = raw.startsWith("/api/") ? raw.split("?")[0] : url.pathname;
    const q = new URLSearchParams(raw.includes("?") ? raw.split("?")[1] : "");
    const method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    await new Promise((r) => setTimeout(r, 180 + Math.random() * 220));
    if (path === "/api/journey") return method === "GET" ? json(200, readJourney(q)) : writeJourney(body);
    if (path === "/api/journey/report") return report(q);
    if (path === "/api/whatsapp") {
      const r = whatsapp(method, q, body);
      for (const c of store.wa.campaigns) if (c.flyer === "__FLYER__") c.flyer = flyer;
      return r;
    }
    if (path === "/api/auth/logout") return json(200, { ok: true });
    return json(404, { message: "Not part of this demo." });
  };
}
