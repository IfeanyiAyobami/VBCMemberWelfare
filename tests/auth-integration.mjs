import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runMemberBrowser } from "./member-browser.mjs";
import { runGuestBrowser } from "./guest-browser.mjs";
import { runGuestIntegration } from "./guest-integration.mjs";
import { runGatewayIntegration } from "./gateway-integration.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const users = new Map([
  [
    "admin@example.test",
    {
      id: "11111111-1111-4111-8111-111111111111",
      role: "administrator",
      active: true,
    },
  ],
  [
    "viewer@example.test",
    {
      id: "22222222-2222-4222-8222-222222222222",
      role: "viewer",
      active: true,
    },
  ],
  [
    "editor@example.test",
    {
      id: "33333333-3333-4333-8333-333333333333",
      role: "editor",
      active: true,
    },
  ],
  [
    "outsider@example.test",
    { id: "44444444-4444-4444-8444-444444444444", role: null, active: true },
  ],
  [
    "inactive@example.test",
    {
      id: "55555555-5555-4555-8555-555555555555",
      role: "administrator",
      active: false,
    },
  ],
]);
const tokens = new Map(),
  refreshTokens = new Map();
const guests = new Map();
const bridgeSecret = "a".repeat(64);
const gatewayToken = "b".repeat(64);
let gatewayFault = null,
  authUserLookups = 0;
const members = new Map(),
  notes = new Map(),
  consentEvents = [];
let careWrites = 0,
  careUnavailable = false;
let memberWrites = 0,
  membersUnavailable = false;
let unavailable = false,
  refreshCount = 0;
function userData(email, user) {
  return {
    id: user.id,
    email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { role: "administrator" },
    created_at: "2026-10-01T00:00:00Z",
  };
}
function issueSession(email, user) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      exp: expires,
      aud: "authenticated",
      role: "authenticated",
      email,
    }),
  ).toString("base64url");
  const token =
    header +
    "." +
    payload +
    "." +
    createHmac("sha256", "test-only-secret")
      .update(header + "." + payload)
      .digest("base64url");
  const refresh = "fixture-refresh-" + user.id;
  tokens.set(token, { email, user });
  refreshTokens.set(refresh, { email, user });
  return {
    access_token: token,
    refresh_token: refresh,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expires,
    user: userData(email, user),
  };
}
function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
const mock = createServer(async (req, res) => {
  const url = new URL(req.url, "http://fixture.invalid");
  if (unavailable)
    return json(res, 503, { message: "Fixture temporarily unavailable" });
  const auth = tokens.get(
    (req.headers.authorization || "").replace(/^Bearer /i, ""),
  );
  if (url.pathname === "/auth/v1/token") {
    let text = "";
    for await (const chunk of req) text += chunk;
    const data = JSON.parse(text || "{}");
    if (url.searchParams.get("grant_type") === "refresh_token") {
      const existing = refreshTokens.get(data.refresh_token);
      if (!existing)
        return json(res, 400, {
          code: "refresh_token_not_found",
          message: "Invalid refresh token",
        });
      refreshCount++;
      return json(res, 200, issueSession(existing.email, existing.user));
    }
    const user = users.get(data.email);
    if (!user || data.password !== "Fixture-password-123!")
      return json(res, 400, {
        code: "invalid_credentials",
        message: "Invalid login credentials",
      });
    return json(res, 200, issueSession(data.email, user));
  }
  if (url.pathname === "/auth/v1/user") authUserLookups++;
  if (url.pathname === "/auth/v1/user")
    return auth
      ? json(res, 200, userData(auth.email, auth.user))
      : json(res, 401, { code: "bad_jwt", message: "Invalid token" });
  if (url.pathname === "/auth/v1/logout") {
    if (auth) {
      tokens.delete((req.headers.authorization || "").replace(/^Bearer /i, ""));
      refreshTokens.delete("fixture-refresh-" + auth.user.id);
    }
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === "/rest/v1/care_staff") {
    if (!auth) return json(res, 401, { message: "No access" });
    const user = auth.user;
    if (
      url.searchParams.has("user_id") &&
      url.searchParams.get("user_id").startsWith("in.")
    ) {
      if (!user.active || !user.role) return json(res, 403, { code: "42501" });
      const data = [...users.values()]
        .filter((u) => url.searchParams.get("user_id").includes(u.id))
        .map((u) => ({ user_id: u.id, display_name: "Care " + u.role }));
      return json(res, 200, data);
    }
    const data =
      user.active &&
      user.role &&
      url.searchParams.get("user_id") === "eq." + user.id
        ? [
            {
              user_id: user.id,
              display_name: "Care " + user.role,
              role: user.role,
              is_active: true,
            },
          ]
        : [];
    return json(res, 200, data);
  }
  if (
    ["/rest/v1/care_notes", "/rest/v1/care_consent_events"].includes(
      url.pathname,
    )
  ) {
    if (!auth?.user.active || !auth.user.role)
      return json(res, 403, { code: "42501" });
    if (careUnavailable) return json(res, 503, { code: "fixture_unavailable" });
    let rows = (
      url.pathname.endsWith("care_notes") ? [...notes.values()] : consentEvents
    ).filter(
      (row) => url.searchParams.get("member_id") === "eq." + row.member_id,
    );
    const date = url.pathname.endsWith("care_notes")
      ? "created_at"
      : "recorded_at";
    rows.sort(
      (a, b) => b[date].localeCompare(a[date]) || b.id.localeCompare(a.id),
    );
    const count = rows.length,
      offset = Number(url.searchParams.get("offset") || 0),
      limit = Number(url.searchParams.get("limit") || count);
    rows = rows.slice(offset, offset + limit);
    res.setHeader(
      "Content-Range",
      `${offset}-${offset + rows.length - 1}/${count}`,
    );
    return json(res, 200, rows);
  }
  if (url.pathname === "/rest/v1/care_guest_submissions") {
    if (!auth?.user.active || !auth.user.role)
      return json(res, 403, { code: "42501" });
    let rows = [...guests.values()].filter(
      (row) =>
        (!url.searchParams.has("id") ||
          url.searchParams.get("id") === "eq." + row.id) &&
        (!url.searchParams.has("review_status") ||
          url.searchParams.get("review_status") === "eq." + row.review_status),
    );
    const filter = url.searchParams.get("or");
    if (filter) {
      const literal =
        filter.split(".ilike.%")[1]?.split("%")[0]?.toLowerCase() || "";
      rows = rows.filter((row) =>
        [row.surname, row.other_names, row.email, row.phone].some((value) =>
          value?.toLowerCase().includes(literal),
        ),
      );
    }
    rows.sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
    );
    if ((req.headers.accept || "").includes("vnd.pgrst.object"))
      return rows.length === 1
        ? json(res, 200, rows[0])
        : json(res, 406, {
            code: "PGRST116",
            details: "The result contains 0 rows",
          });
    const total = rows.length,
      offset = Number(url.searchParams.get("offset") || 0),
      limit = Number(url.searchParams.get("limit") || total);
    rows = rows.slice(offset, offset + limit);
    res.setHeader(
      "Content-Range",
      `${offset}-${offset + rows.length - 1}/${total}`,
    );
    return json(res, 200, rows);
  }
  if (url.pathname === "/rest/v1/rpc/care_ingest_wordpress_gateway") {
    if (req.headers.apikey !== "sb_secret_fixture_0123456789")
      return json(res, 403, { code: "42501" });
    if (gatewayFault === "unavailable")
      return json(res, 503, { code: "fixture_unavailable" });
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const d = JSON.parse(raw);
    const old = [...guests.values()].find(
      (g) => g.submission_key === d.p_submission_key,
    );
    if (old)
      return old.gateway_payload_hash === d.p_payload_hash &&
        old.gateway_submitted_at === d.p_submitted_at
        ? json(res, 200, { id: old.id, duplicate: true })
        : json(res, 409, { code: "23505" });
    const stamp = new Date().toISOString(),
      id = randomUUID();
    guests.set(id, {
      ...d.p_guest,
      id,
      submission_key: d.p_submission_key,
      source: "wordpress",
      entered_by: null,
      consent_evidence: d.p_evidence,
      gateway_payload_hash: d.p_payload_hash,
      gateway_submitted_at: d.p_submitted_at,
      policy_version: "v1",
      created_at: stamp,
      updated_at: stamp,
      review_status: "pending",
      member_id: null,
      review_notes: null,
      reviewed_at: null,
      reviewed_by: null,
      _payload: JSON.stringify(d.p_guest),
    });
    if (gatewayFault === "lost_ack") {
      gatewayFault = null;
      return json(res, 503, { code: "fixture_lost_ack" });
    }
    return json(res, 200, { id, duplicate: false });
  }
  if (
    [
      "/rest/v1/rpc/care_record_guest",
      "/rest/v1/rpc/care_review_guest",
    ].includes(url.pathname)
  ) {
    const service = req.headers.apikey === "sb_secret_fixture_0123456789";
    if (
      (!service && !auth?.user.active) ||
      (!service && !["administrator", "editor"].includes(auth.user.role))
    )
      return json(res, 403, { code: "42501" });
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const d = JSON.parse(raw),
      timestamp = new Date(Date.now() + careWrites++).toISOString();
    if (url.pathname.endsWith("care_record_guest")) {
      const source = service ? "wordpress" : "manual",
        actor = service ? null : auth.user.id,
        serialized = JSON.stringify(d.p_guest);
      const old = [...guests.values()].find(
        (g) => g.submission_key === d.p_submission_key,
      );
      if (old)
        return old._payload === serialized &&
          old.consent_evidence === d.p_evidence &&
          old.entered_by === actor &&
          old.source === source
          ? json(res, 200, old)
          : json(res, 409, { code: "23505" });
      const g = {
        ...d.p_guest,
        id: randomUUID(),
        submission_key: d.p_submission_key,
        source,
        entered_by: actor,
        consent_evidence: d.p_evidence,
        policy_version: "v1",
        created_at: timestamp,
        updated_at: timestamp,
        review_status: "pending",
        member_id: null,
        review_notes: null,
        reviewed_at: null,
        reviewed_by: null,
        _payload: serialized,
      };
      guests.set(g.id, g);
      return json(res, 200, g);
    }
    if (service) return json(res, 403, { code: "42501" });
    const g = guests.get(d.p_guest_id);
    if (!g) return json(res, 404, { code: "P0002" });
    const desired = {
      create: "accepted",
      link: "duplicate",
      reject: "rejected",
    }[d.p_action];
    if (
      g.review_status === desired &&
      g.member_id === d.p_member_id &&
      g.reviewed_by === auth.user.id &&
      (g.review_notes || "") === d.p_review_notes
    )
      return json(res, 200, g);
    if (g.review_status !== "pending" || g.updated_at !== d.p_expected_version)
      return json(res, 409, { code: "40001" });
    if (d.p_action === "create") {
      if (
        members.has(d.p_member_id) ||
        [...members.values()].some(
          (m) => m.phone === g.phone || (g.email && m.email === g.email),
        )
      )
        return json(res, 409, { code: "23505" });
      const p = {
        updated_at: timestamp,
        evidence_note: g.consent_evidence,
        policy_version: g.policy_version,
      };
      for (const key of [
        "contact_consent",
        "email_opt_in",
        "sms_opt_in",
        "celebrations_opt_in",
        "programmes_opt_in",
        "newsletters_opt_in",
      ]) {
        p[key] = g[key];
        if (g[key])
          consentEvents.push({
            id: randomUUID(),
            member_id: d.p_member_id,
            preference: key,
            previous_value: false,
            new_value: true,
            source: g.source === "wordpress" ? "website" : "admin",
            policy_version: g.policy_version,
            evidence_note: g.consent_evidence,
            recorded_by: auth.user.id,
            recorded_at: timestamp,
          });
      }
      members.set(d.p_member_id, {
        ...g,
        id: d.p_member_id,
        other_names: g.other_names,
        surname: g.surname,
        status: "visitor",
        joined_on: g.visit_date,
        archived_at: null,
        created_by: auth.user.id,
        created_at: timestamp,
        updated_at: timestamp,
        care_preferences: p,
      });
    } else if (d.p_action === "link") {
      const m = members.get(d.p_member_id);
      if (!m || m.archived_at) return json(res, 404, { code: "P0002" });
      if (
        m.updated_at !== d.p_target_version ||
        (m.phone !== g.phone && (!g.email || m.email !== g.email))
      )
        return json(res, 409, { code: "40001" });
    }
    Object.assign(g, {
      review_status: desired,
      member_id: d.p_member_id,
      review_notes: d.p_review_notes,
      reviewed_by: auth.user.id,
      reviewed_at: timestamp,
      updated_at: timestamp,
    });
    return json(res, 200, g);
  }
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    if (
      !auth?.user.active ||
      !["administrator", "editor"].includes(auth.user.role)
    )
      return json(res, 403, { code: "42501" });
    if (careUnavailable) return json(res, 503, { code: "fixture_unavailable" });
    let body = "";
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    const member = members.get(data.p_member_id);
    if (!member || member.archived_at) return json(res, 404, { code: "P0002" });
    const timestamp = new Date(Date.now() + careWrites++).toISOString();
    if (url.pathname.endsWith("care_update_preferences_guarded")) {
      const p = member.care_preferences;
      if (p.updated_at !== data.p_expected_version)
        return json(res, 409, { code: "40001" });
      for (const [key, value] of Object.entries(data.p_preferences))
        if (p[key] !== value)
          consentEvents.push({
            id: randomUUID(),
            member_id: member.id,
            preference: key,
            previous_value: p[key],
            new_value: value,
            source: "admin",
            policy_version: "v1",
            evidence_note: data.p_evidence_note,
            recorded_by: auth.user.id,
            recorded_at: timestamp,
          });
      member.care_preferences = {
        ...p,
        ...data.p_preferences,
        updated_at: timestamp,
        evidence_note: data.p_evidence_note,
        policy_version: "v1",
      };
      return json(res, 200, member.care_preferences);
    }
    if (url.pathname.endsWith("care_add_note_guarded")) {
      const existing = notes.get(data.p_request_id);
      if (existing) {
        if (
          existing.member_id === member.id &&
          existing.created_by === auth.user.id &&
          existing.body === data.p_body
        )
          return json(res, 200, existing);
        return json(res, 409, { code: "23505" });
      }
      const note = {
        id: data.p_request_id,
        member_id: member.id,
        body: data.p_body,
        created_by: auth.user.id,
        created_at: timestamp,
        updated_at: timestamp,
      };
      notes.set(note.id, note);
      return json(res, 200, note);
    }
    return json(res, 404, { code: "PGRST202" });
  }
  if (url.pathname === "/rest/v1/care_members") {
    if (!auth || !auth.user.active || !auth.user.role)
      return json(res, 403, { code: "42501", message: "No staff access" });
    if (membersUnavailable)
      return json(res, 503, {
        code: "fixture_unavailable",
        message: "Fixture unavailable",
      });
    const selected = () =>
      [...members.values()].filter(
        (row) =>
          (!url.searchParams.has("id") ||
            url.searchParams.get("id") === "eq." + row.id) &&
          (!url.searchParams.has("archived_at") ||
            (url.searchParams.get("archived_at") === "not.is.null"
              ? row.archived_at !== null
              : row.archived_at === null)) &&
          (!url.searchParams.has("updated_at") ||
            url.searchParams.get("updated_at") === "eq." + row.updated_at) &&
          (!url.searchParams.has("phone") ||
            url.searchParams.get("phone") === "eq." + row.phone) &&
          (!url.searchParams.has("email") ||
            url.searchParams.get("email") === "eq." + row.email) &&
          (!url.searchParams.has("status") ||
            url.searchParams.get("status") === "eq." + row.status),
      );
    const represent = (rows) => {
      if ((req.headers.accept || "").includes("vnd.pgrst.object")) {
        if (rows.length !== 1)
          return json(res, 406, {
            code: "PGRST116",
            details: "The result contains " + rows.length + " rows",
            message: "Cannot coerce result to a single JSON object",
          });
        return json(res, 200, rows[0]);
      }
      return json(res, 200, rows);
    };
    if (req.method === "GET") {
      let rows = selected().sort(
        (a, b) =>
          b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
      );
      const filter = url.searchParams.get("or");
      if (filter) {
        const literal =
          filter.split(".ilike.%")[1]?.split("%")[0]?.toLowerCase() || "";
        rows = rows.filter((row) =>
          [row.surname, row.other_names, row.email, row.phone].some((value) =>
            value?.toLowerCase().includes(literal),
          ),
        );
      }
      const total = rows.length,
        offset = Number(url.searchParams.get("offset") || 0),
        limit = Number(url.searchParams.get("limit") || total);
      rows = rows.slice(offset, offset + limit);
      res.setHeader(
        "Content-Range",
        `${offset}-${Math.max(offset, offset + rows.length - 1)}/${total}`,
      );
      return represent(rows);
    }
    if (auth.user.role === "viewer")
      return json(res, 403, { code: "42501", message: "Viewer cannot write" });
    let body = "";
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body || "{}");
    const id = req.method === "POST" ? data.id : selected()[0]?.id;
    if (req.method === "POST" && members.has(id))
      return json(res, 409, { code: "23505", message: "Duplicate ID" });
    if (!id) return represent([]);
    if (
      [...members.values()].some(
        (row) =>
          row.id !== id &&
          ((data.email && row.email === data.email) ||
            (data.phone && row.phone === data.phone)),
      )
    )
      return json(res, 409, { code: "23505", message: "Duplicate contact" });
    const timestamp = new Date(Date.now() + memberWrites++).toISOString();
    const current = members.get(id) || {
      id,
      created_by: auth.user.id,
      created_at: timestamp,
      archived_at: null,
      care_preferences: {
        updated_at: timestamp,
        evidence_note: null,
        policy_version: "v1",
        contact_consent: false,
        email_opt_in: false,
        sms_opt_in: false,
        celebrations_opt_in: false,
        programmes_opt_in: false,
        newsletters_opt_in: false,
      },
    };
    if (req.method === "POST")
      for (const key of [
        "contact_consent",
        "email_opt_in",
        "sms_opt_in",
        "celebrations_opt_in",
        "programmes_opt_in",
        "newsletters_opt_in",
      ])
        consentEvents.push({
          id: randomUUID(),
          member_id: id,
          preference: key,
          previous_value: null,
          new_value: false,
          source: "system",
          policy_version: "v1",
          evidence_note: null,
          recorded_by: auth.user.id,
          recorded_at: timestamp,
        });
    const row = { ...current, ...data, updated_at: timestamp };
    members.set(id, row);
    return represent([row]);
  }
  return json(res, 404, { message: "Fixture route missing" });
});
mock.listen(Number(process.env.CARE_AUTH_MOCK_PORT) || 0, "127.0.0.1");
await once(mock, "listening");
const mockOrigin = "http://127.0.0.1:" + mock.address().port;
let appPort = Number(process.env.CARE_AUTH_APP_PORT);
if (!appPort) {
  const portProbe = createServer();
  portProbe.listen(0, "127.0.0.1");
  await once(portProbe, "listening");
  appPort = portProbe.address().port;
  await new Promise((r) => portProbe.close(r));
}
const origin = "http://localhost:" + appPort;
const development = process.argv.includes("--dev");
let output = "",
  checks = 0;
const command = development ? ["dev", "--webpack"] : ["start"];
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    ...command,
    "-p",
    String(appPort),
    "-H",
    "127.0.0.1",
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: mockOrigin,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_0123456789",
      NEXT_TELEMETRY_DISABLED: "1",
      VBC_GUEST_BRIDGE_ENABLED: process.argv.includes("--bridge-disabled")
        ? "false"
        : "true",
      VBC_WORDPRESS_BRIDGE_SECRET: bridgeSecret,
      VBC_MEMBER_CARE_GATEWAY_ENABLED: process.argv.includes(
        "--gateway-disabled",
      )
        ? "false"
        : "true",
      VBC_MEMBER_CARE_GATEWAY_TOKEN: gatewayToken,
      SUPABASE_SECRET_KEY: "sb_secret_fixture_0123456789",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
child.stdout.on("data", (x) => {
  output = (output + x).slice(-12000);
});
child.stderr.on("data", (x) => {
  output = (output + x).slice(-12000);
});
const jar = new Map();
function cookiesFrom(response) {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0],
      at = pair.indexOf("=");
    const name = pair.slice(0, at),
      value = pair.slice(at + 1);
    if (!value || /max-age=0/i.test(cookie)) jar.delete(name);
    else jar.set(name, value);
  }
}
async function request(route, options = {}) {
  const response = await fetch(origin + route, {
    redirect: "manual",
    signal: AbortSignal.timeout(45000),
    ...options,
    headers: {
      Cookie: [...jar].map(([k, v]) => k + "=" + v).join("; "),
      ...options.headers,
    },
  });
  cookiesFrom(response);
  return response;
}
async function login(
  email = "admin@example.test",
  password = "Fixture-password-123!",
  next = "/members",
) {
  return request("/api/auth/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, next }),
  });
}
function check(value, label) {
  assert(value, label);
  checks++;
  console.log("PASS " + label);
}
try {
  const deadline = Date.now() + 45000;
  while (true) {
    try {
      await fetch(origin + "/access", { signal: AbortSignal.timeout(5000) });
      break;
    } catch {
      if (Date.now() > deadline || child.exitCode !== null)
        throw new Error("Next server failed to start");
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  if (process.argv.includes("--gateway-disabled")) {
    const r = await request("/api/integrations/wordpress/first-timers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    check(
      r.status === 503 && !(await r.json()).success && guests.size === 0,
      "Disabled Gateway receiver cannot write guest records",
    );
  } else if (process.argv.includes("--gateway-only")) {
    await runGatewayIntegration({
      request,
      login,
      check,
      token: gatewayToken,
      setFault: (v) => (gatewayFault = v),
      guests,
      userLookups: () => authUserLookups,
    });
    console.log(checks + " Gateway HTTP checks passed. Local fixtures only.");
  } else if (process.argv.includes("--bridge-disabled")) {
    const response = await request("/api/intake/wordpress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    check(
      response.status === 503 &&
        !(await response.json()).success &&
        guests.size === 0,
      "Disabled receiver cannot write any guest records",
    );
  } else if (process.argv.includes("--guest-only")) {
    const write = (method, path, data, requestOrigin = origin) =>
      request(path, {
        method,
        headers: { Origin: requestOrigin, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    await runGuestIntegration({
      request,
      write,
      login,
      check,
      origin,
      bridgeSecret,
    });
    if (process.argv.includes("--browser")) await runGuestBrowser(origin);
    console.log(checks + " guest HTTP checks passed. Local fixtures only.");
  } else {
    let response = await request("/members");
    check(
      response.status === 307 &&
        response.headers.get("location")?.startsWith("/access?next="),
      "Anonymous direct dashboard access redirects",
    );
    response = await request("/api/auth/session");
    check(response.status === 401, "Anonymous session API denies access");
    response = await request("/access");
    const html = await response.text();
    check(
      html.includes("Sign in to the care desk") &&
        !html.includes("demo-password"),
      "Real sign-in screen has no demo credentials",
    );
    check(
      response.headers.get("cache-control")?.includes("no-store"),
      "Auth pages are not cached",
    );
    response = await request("/assets/image-7d4e31b34082.png");
    check(response.status === 200, "Brand assets remain available on sign-in");
    response = await request("/api/auth/login", {
      method: "POST",
      headers: {
        Origin: "https://other.invalid",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    check(response.status === 403, "Cross-origin login rejected");
    response = await login("admin@example.test", "wrong-password");
    check(response.status === 401, "Incorrect password denied");
    response = await login("bad-email");
    check(response.status === 400, "Malformed email rejected");
    response = await login("outsider@example.test");
    check(
      response.status === 403 && jar.size === 0,
      "Auth user and forged metadata without care_staff cannot enter",
    );
    response = await login("inactive@example.test");
    check(
      response.status === 403 && jar.size === 0,
      "Inactive staff denied and login cookie cleared",
    );
    response = await login("  ADMIN@example.test  ");
    check(
      response.status === 200 && (await response.json()).next === "/members",
      "Approved administrator login and email normalization",
    );
    check(
      response.headers
        .getSetCookie()
        .some((c) => /httponly/i.test(c) && /samesite=lax/i.test(c)),
      "Session cookies are HttpOnly and SameSite=Lax",
    );
    check(
      response.headers.get("netlify-cdn-cache-control") === "no-store",
      "Netlify auth responses cannot enter CDN cache",
    );
    response = await request("/api/auth/session");
    const identity = await response.json();
    check(
      response.status === 200 && identity.staff.role === "administrator",
      "Session API returns current database staff role",
    );
    response = await request("/members");
    const membersHTML = await response.text();
    check(
      response.status === 200 && membersHTML.includes('id="member-desk"'),
      "Authenticated direct route loads the saved member directory",
    );
    response = await request("/access?next=%2Fnewsletters");
    check(
      response.status === 307 &&
        response.headers.get("location") === "/newsletters",
      "Already signed-in staff use safe destination",
    );
    for (const destination of [
      "https://other.invalid",
      "//other.invalid",
      "/access",
      "/api/auth/logout",
      "/%2f%2fother.invalid",
    ]) {
      response = await login(
        "admin@example.test",
        "Fixture-password-123!",
        destination,
      );
      check(
        (await response.json()).next === "/overview",
        "Unsafe redirect rejected: " + destination,
      );
    }
    // Expire the stored session timestamp to exercise the SSR refresh-cookie path.
    const cookieName = [...jar.keys()].find((k) => k.includes("auth-token"));
    const stored = jar.get(cookieName);
    check(!!stored?.startsWith("base64-"), "SSR session cookie format");
    const session = JSON.parse(
      Buffer.from(stored.slice(7), "base64url").toString("utf8"),
    );
    session.expires_at = Math.floor(Date.now() / 1000) - 10;
    jar.set(
      cookieName,
      "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
    );
    response = await request("/members");
    check(
      response.status === 200 &&
        refreshCount > 0 &&
        response.headers.getSetCookie().length > 0,
      "Expired session refreshes and carries new cookies to browser",
    );
    response = await request("/api/auth/session");
    check(response.status === 200, "Refreshed cookie works on next request");
    users.get("admin@example.test").active = false;
    response = await request("/api/auth/session");
    check(
      response.status === 403,
      "Staff revocation takes effect without waiting for JWT expiry",
    );
    response = await request("/members");
    check(
      response.status === 307 &&
        response.headers.get("location") === "/access?reason=staff",
      "Revoked staff cannot load a bookmarked dashboard route",
    );
    users.get("admin@example.test").active = true;
    unavailable = true;
    response = await request("/api/auth/session");
    check(response.status === 503, "Auth provider failure fails closed");
    unavailable = false;
    response = await request("/api/auth/logout", {
      method: "POST",
      headers: { Origin: "https://other.invalid" },
    });
    check(response.status === 403, "Cross-origin logout rejected");
    response = await request("/api/auth/logout", {
      method: "POST",
      headers: { Origin: origin },
    });
    check(
      response.status === 200 && jar.size === 0,
      "Logout clears session cookies",
    );
    response = await request("/members");
    check(response.status === 307, "Dashboard denied after logout");
    for (const role of ["viewer", "editor"]) {
      response = await login(role + "@example.test");
      check(response.status === 200, "Approved " + role + " can sign in");
      response = await request("/api/auth/session");
      check(
        (await response.json()).staff.role === role,
        "Actual " + role + " role retained",
      );
      await request("/api/auth/logout", {
        method: "POST",
        headers: { Origin: origin },
      });
    }
    // Tampered auth cookies cannot replace remote token validation.
    const forged = {
      ...session,
      access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.invalid",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    jar.set(
      cookieName,
      "base64-" + Buffer.from(JSON.stringify(forged)).toString("base64url"),
    );
    response = await request("/api/auth/session");
    check(
      response.status === 401,
      "Tampered token denied by remote Auth verification",
    );
    jar.clear();
    response = await request("/access/recover");
    check(
      (await response.text()).includes("Self-service recovery email"),
      "Recovery help clearly explains current scope",
    );
    response = await request("/api/members");
    check(response.status === 401, "Anonymous member API denies access");
    await login();
    const memberId = "77777777-7777-4777-8777-777777777777";
    const draft = {
      first: " Test Member ",
      last: " Directory ",
      email: " TEST.MEMBER@EXAMPLE.TEST ",
      phone: "08031234567",
      status: "visitor",
      occupation: "Engineer",
      address: "Fictional address",
      birthday: "02-29",
      anniversary: "10-09",
      joined: "2026-10-09",
    };
    const write = (method, path, data, requestOrigin = origin) =>
      request(path, {
        method,
        headers: { Origin: requestOrigin, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    response = await request("/api/members");
    check(
      response.status === 200 && (await response.json()).total === 0,
      "Empty directory comes from storage, never sample records",
    );
    response = await write(
      "POST",
      "/api/members",
      { ...draft, requestId: memberId },
      "https://other.invalid",
    );
    check(
      response.status === 403 && memberWrites === 0,
      "Cross-origin member creation cannot write",
    );
    response = await write("POST", "/api/members", {
      ...draft,
      first: "",
      requestId: memberId,
    });
    check(
      response.status === 400 &&
        (await response.json()).errors.first &&
        memberWrites === 0,
      "Invalid member fields rejected before storage",
    );
    response = await write("POST", "/api/members", {
      ...draft,
      requestId: memberId,
      email_opt_in: true,
    });
    check(
      response.status === 400 && memberWrites === 0,
      "Create rejects injected consent fields",
    );
    response = await write("POST", "/api/members", {
      ...draft,
      requestId: memberId,
      created_by: users.get("viewer@example.test").id,
    });
    check(
      response.status === 400 && memberWrites === 0,
      "Create rejects caller-controlled creator",
    );
    response = await write("POST", "/api/members", {
      ...draft,
      requestId: memberId,
    });
    const created = (await response.json()).member;
    check(
      response.status === 201 &&
        created.id === memberId &&
        created.first === "Test Member",
      "Administrator can create a normalized member",
    );
    check(
      created.email === "test.member@example.test" &&
        created.phone === "+2348031234567",
      "Stored email and phone normalized",
    );
    check(
      created.birthday === "02-29" &&
        members.get(memberId).birthday_month === 2 &&
        members.get(memberId).birthday_day === 29,
      "Month/day milestones keep February 29 without a year",
    );
    check(
      Object.values(created.preferences).every((value) => value === false),
      "New member preferences all start off",
    );
    check(
      response.headers.get("cache-control").includes("no-store") &&
        response.headers.get("netlify-cdn-cache-control") === "no-store",
      "Member writes disable browser and CDN caching",
    );
    const writesBeforeRetry = memberWrites;
    response = await write("POST", "/api/members", {
      ...draft,
      requestId: memberId,
    });
    check(
      response.status === 200 &&
        (await response.json()).replayed &&
        memberWrites === writesBeforeRetry,
      "Same form retry returns its existing record without another insert",
    );
    response = await write("POST", "/api/members", {
      ...draft,
      requestId: "88888888-8888-4888-8888-888888888888",
    });
    check(
      response.status === 409 && members.size === 1,
      "Duplicate contact never creates or merges another member",
    );
    response = await request("/api/members/" + memberId);
    check(
      response.status === 200 &&
        (await response.json()).member.email === created.email,
      "Saved profile loads from storage on another request",
    );
    response = await request("/profile/" + memberId);
    check(
      response.status === 200 &&
        (await response.text()).includes('id="member-desk"'),
      "UUID profile deep links load the real member screen",
    );
    response = await request("/api/members?q=Directory&status=visitor");
    check(
      (await response.json()).total === 1,
      "Member search and status filtering use storage query",
    );
    response = await request("/api/members?status=member");
    check(
      (await response.json()).total === 0,
      "Status filter excludes other memberships",
    );
    response = await request("/api/members?page=-1");
    check(response.status === 400, "Invalid pagination rejected");
    response = await request("/api/members?status=administrator");
    check(response.status === 400, "Unknown membership filter rejected");
    const beforeMalformed = memberWrites;
    response = await write("POST", "/api/members", {
      ...draft,
      requestId: memberId,
      status: { toString: 1 },
    });
    check(
      response.status === 400 && memberWrites === beforeMalformed,
      "Malformed field types fail without a server crash",
    );
    response = await write("POST", "/api/members", {
      ...draft,
      requestId: memberId,
      address: "x".repeat(9000),
    });
    check(
      response.status === 413 && memberWrites === beforeMalformed,
      "Oversized request rejected before storage",
    );
    response = await request("/api/members", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "text/plain" },
      body: "{}",
    });
    check(
      response.status === 400 && memberWrites === beforeMalformed,
      "Non-JSON request rejected",
    );
    response = await request("/api/members/m1");
    check(
      response.status === 404,
      "Prototype IDs cannot access real member API",
    );
    response = await request(
      "/api/members/99999999-9999-4999-8999-999999999999",
    );
    check(
      response.status === 404,
      "Unknown UUID does not substitute another person's profile",
    );
    const update = {
      ...draft,
      first: "Updated Member",
      birthday: "",
      phone: "",
      expectedVersion: created.version,
    };
    response = await write("PATCH", "/api/members/" + memberId, update);
    const updated = (await response.json()).member;
    check(
      response.status === 200 && updated.first === "Updated Member",
      "Member edit is saved",
    );
    check(
      updated.birthday === "" &&
        members.get(memberId).birthday_month === null &&
        members.get(memberId).phone === null,
      "Clearing optional values stores null",
    );
    response = await write("PATCH", "/api/members/" + memberId, {
      ...update,
      first: "Stale overwrite",
    });
    check(
      response.status === 409 &&
        members.get(memberId).other_names === "Updated Member",
      "Stale version cannot overwrite a newer edit",
    );
    response = await write("PATCH", "/api/members/" + memberId, {
      ...update,
      expectedVersion: updated.version,
      archived_at: "2026-10-09",
    });
    check(
      response.status === 400,
      "Profile update cannot inject archive metadata",
    );
    response = await write("PATCH", "/api/members/" + memberId, {
      ...update,
      expectedVersion: updated.version,
      contact_consent: true,
    });
    check(
      response.status === 400 &&
        Object.entries(members.get(memberId).care_preferences)
          .filter(([k]) => k === "contact_consent" || k.endsWith("_opt_in"))
          .every(([, v]) => v === false),
      "Profile save cannot modify consent",
    );
    await request("/api/auth/logout", {
      method: "POST",
      headers: { Origin: origin },
    });
    await login("viewer@example.test");
    response = await request("/api/members/" + memberId);
    check(response.status === 200, "Viewer can read saved profiles");
    const beforeViewer = memberWrites;
    response = await write("POST", "/api/members", {
      ...draft,
      requestId: "88888888-8888-4888-8888-888888888888",
    });
    check(
      response.status === 403 && memberWrites === beforeViewer,
      "Viewer cannot create members",
    );
    response = await write("PATCH", "/api/members/" + memberId, {
      ...update,
      expectedVersion: updated.version,
    });
    check(
      response.status === 403 && memberWrites === beforeViewer,
      "Viewer cannot update members",
    );
    await request("/api/auth/logout", {
      method: "POST",
      headers: { Origin: origin },
    });
    await login("editor@example.test");
    response = await write("PATCH", "/api/members/" + memberId, {
      ...update,
      first: "Editor update",
      expectedVersion: updated.version,
    });
    check(response.status === 200, "Approved editor can update members");
    const prefsPath = "/api/members/" + memberId + "/preferences",
      notesPath = "/api/members/" + memberId + "/notes",
      archivePath = "/api/members/" + memberId + "/archive";
    response = await request("/api/members/" + memberId);
    let careMember = (await response.json()).member;
    const preferenceDraft = {
      preferences: {
        ...careMember.preferences,
        contact_consent: true,
        email_opt_in: true,
        newsletters_opt_in: true,
      },
      expectedVersion: careMember.preferenceVersion,
      evidence:
        "Fictional permission recorded in a test conversation on 10 October 2026.",
    };
    response = await write(
      "PATCH",
      prefsPath,
      preferenceDraft,
      "https://other.invalid",
    );
    check(response.status === 403, "Cross-origin consent update rejected");
    response = await write("PATCH", prefsPath, {
      ...preferenceDraft,
      evidence: "",
    });
    check(response.status === 400, "Consent requires evidence");
    response = await write("PATCH", prefsPath, {
      ...preferenceDraft,
      preferences: { ...preferenceDraft.preferences, email_opt_in: "yes" },
    });
    check(response.status === 400, "Consent refuses non-booleans");
    response = await write("PATCH", prefsPath, {
      ...preferenceDraft,
      source: "website",
    });
    check(response.status === 400, "Consent refuses caller-controlled source");
    response = await write("PATCH", prefsPath, preferenceDraft);
    check(response.status === 200, "Editor can save explicit consent");
    response = await request("/api/members/" + memberId);
    careMember = (await response.json()).member;
    check(
      careMember.preferences.newsletters_opt_in &&
        !careMember.preferences.sms_opt_in,
      "Consent reload preserves independent choices",
    );
    response = await write("PATCH", prefsPath, {
      ...preferenceDraft,
      preferences: { ...preferenceDraft.preferences, email_opt_in: false },
    });
    check(
      response.status === 409 &&
        members.get(memberId).care_preferences.email_opt_in,
      "Stale consent update rejected",
    );
    response = await request(prefsPath);
    const history = await response.json();
    check(
      history.items.length === 9 &&
        history.items
          .filter((e) => e.previous_value !== null)
          .every(
            (e) =>
              e.author === "Care editor" &&
              e.evidence_note === preferenceDraft.evidence,
          ),
      "History exposes evidence and resolved staff name",
    );
    response = await request(prefsPath + "?page=0");
    check(response.status === 400, "Invalid history page rejected");
    const noteDraft = {
      body: "Fictional follow-up: called and agreed to a Sunday visit.",
      requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    };
    response = await write(
      "POST",
      notesPath,
      noteDraft,
      "https://other.invalid",
    );
    check(response.status === 403, "Cross-origin care note rejected");
    response = await write("POST", notesPath, { ...noteDraft, body: "   " });
    check(response.status === 400, "Empty care note rejected");
    response = await write("POST", notesPath, {
      ...noteDraft,
      created_by: users.get("admin@example.test").id,
    });
    check(response.status === 400, "Note cannot forge its author");
    response = await write("POST", notesPath, noteDraft);
    check(response.status === 201, "Editor can save a care note");
    response = await write("POST", notesPath, noteDraft);
    check(
      response.status === 201 && notes.size === 1,
      "Note retry does not duplicate",
    );
    response = await write("POST", notesPath, {
      ...noteDraft,
      body: "Changed note.",
    });
    check(
      response.status === 409 && notes.size === 1,
      "Note retry cannot overwrite text",
    );
    response = await request(notesPath);
    const readNotes = await response.json();
    check(
      readNotes.items[0].body === noteDraft.body &&
        readNotes.items[0].author === "Care editor" &&
        !readNotes.items[0].created_by,
      "Note reads show resolved author without author ID",
    );
    response = await request(notesPath + "?page=oops");
    check(response.status === 400, "Invalid notes page rejected");
    response = await write(
      "PATCH",
      archivePath,
      { archived: true, expectedVersion: careMember.version },
      "https://other.invalid",
    );
    check(response.status === 403, "Cross-origin archive rejected");
    response = await write("PATCH", archivePath, {
      archived: true,
      expectedVersion: careMember.version,
    });
    const archivedMember = (await response.json()).member;
    check(
      response.status === 200 && archivedMember.archivedAt,
      "Editor can archive member",
    );
    response = await request("/api/members?scope=archived");
    check(
      (await response.json()).total === 1,
      "Archived directory lists retained record",
    );
    response = await request("/api/members?scope=all");
    check(response.status === 400, "Invalid archive scope rejected");
    response = await request("/api/members/" + memberId + "?includeArchived=1");
    check(
      response.status === 200 && (await response.json()).member.archivedAt,
      "Archived profile is available for staff review and restore",
    );
    response = await write("POST", notesPath, {
      ...noteDraft,
      requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc",
    });
    check(response.status === 404, "Archived member cannot receive a note");
    response = await write("PATCH", prefsPath, {
      ...preferenceDraft,
      expectedVersion: careMember.preferenceVersion,
    });
    check(response.status === 404, "Archived member cannot change preferences");
    response = await write("PATCH", archivePath, {
      archived: false,
      expectedVersion: careMember.version,
    });
    check(
      response.status === 409,
      "Stale archive version cannot restore record",
    );
    response = await write("PATCH", archivePath, {
      archived: false,
      expectedVersion: archivedMember.version,
    });
    check(
      response.status === 200 &&
        !(await response.json()).member.archivedAt &&
        notes.size === 1,
      "Restore retains care notes",
    );
    await request("/api/auth/logout", {
      method: "POST",
      headers: { Origin: origin },
    });
    await login("viewer@example.test");
    response = await request(notesPath);
    check(response.status === 200, "Viewer can read care notes");
    for (const [method, path, data] of [
      ["POST", notesPath, noteDraft],
      ["PATCH", prefsPath, preferenceDraft],
      [
        "PATCH",
        archivePath,
        { archived: true, expectedVersion: careMember.version },
      ],
    ]) {
      response = await write(method, path, data);
      check(
        response.status === 403,
        "Viewer cannot write " + path.split("/").pop(),
      );
    }
    careUnavailable = true;
    response = await request(notesPath);
    careUnavailable = false;
    check(
      response.status === 503,
      "Care storage errors have no sample fallback",
    );
    await request("/api/auth/logout", {
      method: "POST",
      headers: { Origin: origin },
    });
    await login("editor@example.test");
    membersUnavailable = true;
    response = await request("/api/members");
    membersUnavailable = false;
    check(
      response.status === 503,
      "Member storage failure returns an error without demo fallback",
    );
    members.get(memberId).archived_at = "2026-10-09T00:00:00Z";
    response = await request("/api/members/" + memberId);
    check(
      response.status === 404,
      "Archived profile is excluded from saved directory",
    );
    response = await write("POST", "/api/members", {
      ...draft,
      requestId: "88888888-8888-4888-8888-888888888888",
    });
    check(
      response.status === 409,
      "Archived contacts still participate in duplicate protection",
    );
    members.get(memberId).archived_at = null;
    for (let i = 0; i < 21; i++) {
      const id = "aaaaaaaa-aaaa-4aaa-8aaa-" + String(i).padStart(12, "0");
      members.set(id, {
        ...members.get(memberId),
        id,
        email: `page${i}@example.test`,
        phone: null,
      });
    }
    response = await request("/api/members?page=1");
    const firstPage = await response.json();
    response = await request("/api/members?page=2");
    const secondPage = await response.json();
    check(
      firstPage.total === 22 &&
        firstPage.members.length === 20 &&
        secondPage.members.length === 2 &&
        !secondPage.members.some((row) =>
          firstPage.members.some((first) => first.id === row.id),
        ),
      "Pagination counts all members without duplicate page entries",
    );
    users.get("editor@example.test").active = false;
    response = await request("/api/members");
    users.get("editor@example.test").active = true;
    check(
      response.status === 403,
      "Staff deactivation immediately denies member data",
    );
    await request("/api/auth/logout", {
      method: "POST",
      headers: { Origin: origin },
    });
    response = await request("/api/members/" + memberId);
    check(
      response.status === 401,
      "Signed-out member profile API denies access",
    );
    if (process.argv.includes("--browser")) await runMemberBrowser(origin);
    await runGuestIntegration({
      request,
      write,
      login,
      check,
      origin,
      bridgeSecret,
    });
    if (process.argv.includes("--browser")) await runGuestBrowser(origin);
    await runGatewayIntegration({
      request,
      login,
      check,
      token: gatewayToken,
      setFault: (v) => (gatewayFault = v),
      guests,
      userLookups: () => authUserLookups,
    });
    console.log(
      checks +
        " authentication and member integration checks passed (" +
        (development ? "Webpack development" : "production") +
        "). Local fixture only; no live Supabase or outbound messages.",
    );
  }
} catch (error) {
  console.error(error);
  console.error(output);
  process.exitCode = 1;
} finally {
  child.kill("SIGTERM");
  mock.closeAllConnections();
  mock.close();
}
