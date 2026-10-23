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
let rateMode = "allow";
let ratePolicies = [];
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
    app_metadata: { provider: "email", providers: ["email"], ...user.app_metadata },
    phone: user.phone,
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
let directoryContact={cell_id:"00000000-0000-4000-8000-000000000011",leader_details:"Kevin Iwuji Phone number: 07032621020",team_details:"",area_details:"Total Garden/Mokola",version:1};
const phoneUsernames=new Map();
let nativePhoneAttempts=0;
const onboardingRoster=[{id:'00000000-0000-4000-8000-000000000301',other_names:'Existing',surname:'Onboard Member',phone:'+2348090011223',email:'existing.onboard@example.test',status:'member',archived_at:null}];
const onboardingWrites=[],transferDecisions=[],transferInbox=[];
let existingLeaderWrites = [],
  inviteCalls = 0;
const mock = createServer(async (req, res) => {
  const url = new URL(req.url, "http://fixture.invalid");
  if (unavailable)
    return json(res, 503, { message: "Fixture temporarily unavailable" });
  const auth = tokens.get(
    (req.headers.authorization || "").replace(/^Bearer /i, ""),
  );
  if(req.headers.apikey==='sb_secret_hco_fixture_0123456789' && url.pathname==='/rest/v1/care_members'){
    let rows=onboardingRoster.filter(m=>['id','phone','email'].every(k=>{const f=url.searchParams.get(k);return !f||f==='eq.'+m[k]||f.startsWith('in.')&&f.includes(m[k]);}));
    const filter=url.searchParams.get('or');if(filter){const literal=filter.split('.ilike.%')[1]?.split('%')[0]?.toLowerCase()||'';rows=rows.filter(m=>(m.other_names+' '+m.surname+' '+m.phone+' '+m.email).toLowerCase().includes(literal));}
    res.setHeader('Content-Range','0-'+Math.max(rows.length-1,0)+'/'+rows.length);return json(res,200,rows);
  }
  if(req.headers.apikey==='sb_secret_hco_fixture_0123456789' && url.pathname==='/rest/v1/care_guest_submissions'){res.setHeader('Content-Range','0-0/0');return json(res,200,[]);}
  if(url.pathname==='/rest/v1/hco_member_cells'){
    const rows=[{member_id:onboardingRoster[0].id,cell_id:'00000000-0000-4000-8000-000000000099'}];res.setHeader('Content-Range','0-0/1');return json(res,200,rows);
  }
  if(url.pathname==='/rest/v1/rpc/hco_onboard_members'){
    let raw='';for await(const c of req)raw+=c;const b=JSON.parse(raw);onboardingWrites.push(b.p_data);
    const result=b.p_data.rows.map(row=>{
      if(row.existing_id){if(!transferInbox.length)transferInbox.push({id:randomUUID(),member_id:row.existing_id,member_name:'Existing Onboard Member',source_names:'Previous Cell',target_name:'Mokola Central',status:'pending',reason:b.p_data.reason,can_keep:true,can_move:true});return {member_id:row.existing_id,action:'transfer_requested'};}
      const id=randomUUID();onboardingRoster.push({id,other_names:row.first,surname:row.last,phone:row.phone,email:row.email,status:'new_member',archived_at:null});return {member_id:id,action:'created_and_assigned'};
    });return json(res,200,result);
  }
  if(url.pathname==='/rest/v1/rpc/hco_transfer_inbox')return json(res,200,{items:transferInbox,has_more:false});
  if(url.pathname==='/rest/v1/rpc/hco_transfer_decide'){
    let raw='';for await(const c of req)raw+=c;const b=JSON.parse(raw);transferDecisions.push(b);const t=transferInbox.find(t=>t.id===b.p_id);t.status=b.p_decision;t.decision_reason=b.p_reason;return json(res,200,t);
  }
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
    if(data.phone){nativePhoneAttempts++;return json(res,400,{code:"phone_provider_disabled",message:"Phone provider disabled"});}
    const user = users.get(data.email) || [...users.values()].find(u=>u.email===data.email);
    if (!user || data.password !== (user.password || "Fixture-password-123!"))
      return json(res, 400, {
        code: "invalid_credentials",
        message: "Invalid login credentials",
      });
    return json(res, 200, issueSession(data.email || user.phone, user));
  }
  if (url.pathname === "/auth/v1/user" && req.method === "PUT") {
    let raw="";for await(const c of req)raw+=c;const b=JSON.parse(raw);
    if(!auth)return json(res,401,{});auth.user.password=b.password;
    return json(res,200,userData(auth.email,auth.user));
  }
  if (url.pathname.startsWith("/auth/v1/admin/users/") && req.method === "PUT") {
    let raw="";for await(const c of req)raw+=c;const b=JSON.parse(raw);
    const user=[...users.values()].find(u=>u.id===url.pathname.split('/').pop());
    if(!user)return json(res,404,{});Object.assign(user,b);return json(res,200,userData(user.email,user));
  }
  if (url.pathname.startsWith("/auth/v1/admin/users/") && req.method === "GET") {
    const user=[...users.values()].find(u=>u.id===url.pathname.split('/').pop());
    return user?json(res,200,userData(user.email,user)):json(res,404,{message:"User missing"});
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
  if (url.pathname === "/auth/v1/admin/users" && req.method === "POST") {
    let raw="";for await(const c of req)raw+=c;const b=JSON.parse(raw);
    const user={id:randomUUID(),...b};users.set(b.email || b.phone,user);
    return json(res,200,userData(b.email,user));
  }
  if (url.pathname === "/auth/v1/admin/users")
    return json(res, 200, {
      users: [...[...users.values()].filter(u=>u.password).map(u=>userData(u.email,u)),
        {
          id: "00000000-0000-4000-8000-000000000099",
          email: "known.leader@example.test",
        },
      ],
    });
  if (url.pathname === "/auth/v1/invite") {
    inviteCalls++;
    return json(res, 400, {
      message: "Unexpected invitation for existing account",
    });
  }
  if (url.pathname === "/rest/v1/rpc/hco_rate_limit") {
    let raw=""; for await (const chunk of req) raw+=chunk;
    ratePolicies.push(JSON.parse(raw));
    if (rateMode === 'unavailable') return json(res, 503, { message: 'fixture unavailable' });
    return json(res, 200, { allowed: rateMode !== 'deny', retry_after: 300 });
  }
  if (url.pathname === "/rest/v1/rpc/hco_session_allowed")
    return json(res, 200, false);
  if (["/rest/v1/rpc/hco_leadership_write","/rest/v1/rpc/hco_phone_leadership_write"].includes(url.pathname)) {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const b = JSON.parse(raw);
    if(b.p_action==='assign'||b.p_action==='add_role')existingLeaderWrites.push(b);
    if(b.p_data.phone)phoneUsernames.set(b.p_data.phone,b.p_data.user_id);
    return json(res, 200, { user_id: b.p_data.user_id, role: b.p_data.role });
  }
  if (url.pathname === "/rest/v1/hco_areas")
    return json(res, 200, [
      {
        id: "00000000-0000-4000-8000-000000000010",
        name: "Total Garden/Mokola",
      },
    ]);
  if(url.pathname==='/rest/v1/hco_cells' && url.searchParams.get('id')?.startsWith('in.') && url.searchParams.get('id').includes('000000000099'))return json(res,200,[{id:'00000000-0000-4000-8000-000000000099',name:'Previous Cell'}]);
  if (url.pathname === "/rest/v1/hco_cells")
    return json(res, 200, [
      {
        id: "00000000-0000-4000-8000-000000000011",
        area_id: "00000000-0000-4000-8000-000000000010",
        name: "Mokola Central",
        address: "Fixture address",
        meeting_day: 0,
        meeting_start: "18:00",
        meeting_end: "19:00",
      },
    ]);
  if (url.pathname === "/rest/v1/hco_directory_contacts") return json(res,200,[directoryContact]);
  if (url.pathname === "/rest/v1/rpc/hco_directory_write") {
    let raw="";for await(const c of req)raw+=c;const b=JSON.parse(raw);directoryContact={...b.p_data,version:directoryContact.version+1};return json(res,200,directoryContact);
  }
  if(url.pathname==='/rest/v1/hco_phone_usernames') {
    let rows=[...phoneUsernames].map(([phone,user_id])=>({phone,user_id}));
    const phone=url.searchParams.get('phone'),user=url.searchParams.get('user_id');
    if(phone)rows=rows.filter(x=>phone==='eq.'+x.phone);
    if(user?.startsWith('in.'))rows=rows.filter(x=>user.includes(x.user_id));
    return json(res,200,rows);
  }
  if(url.pathname==='/rest/v1/hco_assignments' && url.searchParams.get('id')==='eq.legacy-phone-assignment')return json(res,200,[{user_id:'00000000-0000-4000-8000-000000000077'}]);
  if (url.pathname.startsWith("/rest/v1/hco_")) {
    return json(res, 200, []);
  }
  if (
    url.pathname === "/rest/v1/care_staff" &&
    req.headers.apikey === "sb_secret_hco_fixture_0123456789"
  )
    return json(res, 200, [{ role: "administrator", is_active: true }]);
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
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_hco_fixture_0123456789",
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

const { chromium } = await import("playwright");

const fs = await import("node:fs");
const browser = await chromium.launch({
  ...(process.env.HCO_CHROMIUM_PATH
    ? {
        executablePath: process.env.HCO_CHROMIUM_PATH,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      }
    : {}),
  headless: true,
});
try {
  for (let i = 0; i < 90; i++) {
    try {
      await fetch(origin + "/home-cell/login");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.route("**/api/home-cell/login", async (route) =>
    route.continue({
      headers: {
        ...route.request().headers(),
        origin: "http://localhost:" + appPort,
      },
    }),
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/home-cell/login");
  if (process.env.HCO_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.HCO_SCREENSHOT_DIR, { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({
        path: process.env.HCO_SCREENSHOT_DIR + "/login-" + width + ".png",
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  assert(await page.locator("#hcl-email").isVisible());
  assert(await page.locator("#hcl-password").isVisible());
  const authResponse = await login();
  assert.equal(authResponse.status, 200);
  await context.addCookies(
    [...jar].map(([name, value]) => ({
      name,
      value,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    })),
  );
  await page.goto(origin + "/home-cell");
  const uid = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
  const area = { id: uid(10), name: "Total Garden/Mokola" };
  const cell = {
    id: uid(11),
    area_id: area.id,
    name: "Mokola Central",
    address: "Fixture address",
    meeting_day: 0,
    meeting_start: "18:00",
    meeting_end: "19:00",
  };
  const person = {
    id: uid(12),
    other_names: "Test",
    surname: "Member",
    phone: "+2348012345678",
    email: "fixture@example.test",
    status: "member",
  };
  const fixture = {
    email: "admin@example.test",
    churchAdmin: true,
    manager: true,
    assignments: [],
    scope: "all",
    areas: [area],
    cells: [cell],
    memberships: [
      {
        id: uid(13),
        cell_id: cell.id,
        member_id: person.id,
        care_members: person,
      },
    ],
    meetings: [
      {
        id: uid(14),
        cell_id: cell.id,
        meeting_date: "2026-10-18",
        starts_at: "18:00",
        ends_at: "19:00",
        notes: "Test fellowship notes",
        status: "draft",
        version: 1,
        submitted_at: null,
      },
    ],
    attendance: [
      {
        id: uid(15),
        meeting_id: uid(14),
        member_id: person.id,
        visitor_name: null,
        status: "present",
      },
    ],
    finances: [
      {
        id: uid(16),
        meeting_id: uid(14),
        kind: "offering",
        amount: 1500,
        description: "Test offering",
        created_at: "2026-10-18",
      },
    ],
    visits: [],
    corrections: [],
    announcements: [],
    from: "2026-10-01",
    to: "2026-10-22",
  };
  await page.route("**/api/home-cell/workspace?*", (route) =>
    route.fulfill({ json: fixture }),
  );
  const sections = [
    "overview",
    "areas",
    "cells",
    "members",
    "attendance",
    "finances",
    "visitors",
    "reports",
    "communications",
    "leaders",
    "settings",
  ];
  if (process.env.HCO_SCREENSHOT_DIR)
    fs.mkdirSync(process.env.HCO_SCREENSHOT_DIR, { recursive: true });
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const section of sections) {
      await page.goto(
        origin +
          (section === "overview" ? "/home-cell" : "/home-cell/" + section),
      );
      await page
        .getByRole("status")
        .filter({ hasText: "Loading your workspace" })
        .waitFor({ state: "hidden", timeout: 30000 })
        .catch(() => {});
      await page.waitForTimeout(400);
      const heading = await page.locator(".hc-hero h1").textContent();
      assert(heading, section + " has heading");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      assert(!overflow, section + " overflows at " + width);
      if (width === 390)
        assert(
          await page.locator(".hc-mobile-nav").isVisible(),
          "mobile nav visible",
        );
      if (
        process.env.HCO_SCREENSHOT_DIR &&
        ["overview", "visitors", "leaders"].includes(section)
      )
        await page.screenshot({
          path:
            process.env.HCO_SCREENSHOT_DIR +
            "/" +
            section +
            "-" +
            width +
            ".png",
          fullPage: true,
        });
      if (section === "overview") {
        assert.equal(
          await page
            .locator(".hc-app")
            .evaluate((e) => getComputedStyle(e).backgroundColor),
          "rgb(0, 9, 86)",
          "Reference canvas colour",
        );
        assert.equal(
          await page
            .locator(".hc-panel")
            .first()
            .evaluate((e) => getComputedStyle(e).backgroundColor),
          "rgb(15, 15, 89)",
          "Reference card colour",
        );
        assert.equal(
          await page
            .locator(".hc-sidebar nav a.active")
            .evaluate((e) => getComputedStyle(e).backgroundColor),
          "rgb(229, 27, 37)",
          "Reference active navigation colour",
        );
      }
      console.log("PASS browser", section, width);
    }
  }
  assert.deepEqual(errors, []);
  console.log("PASS no browser runtime exceptions");
  for (const role of ["coordinator", "area_leader", "cell_leader"]) {
    fixture.churchAdmin = false;
    fixture.manager = role !== "cell_leader";
    fixture.assignments = [
      {
        id: uid(88),
        role,
        area_id: role === "cell_leader" ? null : area.id,
        cell_id: role === "cell_leader" ? cell.id : null,
      },
    ];
    await page.goto(origin + "/home-cell");
    await page.waitForTimeout(700);
    assert(
      (await page.locator(".hc-hero h1").textContent()).includes(
        role === "coordinator"
          ? "Coordinator"
          : role === "area_leader"
            ? "Area Leader"
            : "Cell Leader",
      ),
    );
    console.log("PASS role presentation", role);
  }
  fixture.churchAdmin = true;
  fixture.manager = true;
  fixture.assignments = [];

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/home-cell");
  await page.locator(".hc-menu").click();
  assert(await page.locator(".hc-sidebar").isVisible());
  await page
    .getByRole("navigation", { name: "Home Cell Office", exact: true })
    .getByRole("link", { name: "Weekly Reports", exact: true })
    .click();
  await page.waitForURL("**/home-cell/reports*");
  console.log("PASS mobile menu navigation");
  await page.goto(origin + "/home-cell/visitors");
  const first = page.locator('input[name="other_names"]'),
    last = page.locator('input[name="surname"]'),
    notes = page.locator('textarea[name="notes"]').first();
  await first.fill("Unsaved visitor");
  await last.fill("Keep surname");
  await notes.fill("Preserve these notes");
  await page.locator('input[name="email_opt_in"]').uncheck();
  await page
    .getByLabel("From date (DD/MM/YYYY)", { exact: true })
    .fill("01/10/2");
  assert.equal(await first.inputValue(), "Unsaved visitor");
  await page.getByRole("button", { name: "Apply dates", exact: true }).click();
  assert.equal(await first.inputValue(), "Unsaved visitor");
  await page
    .getByLabel("From date (DD/MM/YYYY)", { exact: true })
    .fill("01/10/2025");
  await page.getByRole("button", { name: "Apply dates", exact: true }).click();
  await page.waitForTimeout(500);
  assert.equal(await first.inputValue(), "Unsaved visitor");
  assert.equal(await notes.inputValue(), "Preserve these notes");
  assert(!(await page.locator('input[name="email_opt_in"]').isChecked()));
  await page.locator(".hc-filters select").first().selectOption(area.id);
  await page.waitForTimeout(500);
  assert.equal(await last.inputValue(), "Keep surname");
  console.log(
    "PASS visitor details and opt-outs survive date application and area changes",
  );
  await page.goto(origin + "/home-cell/leaders");
  await page
    .getByLabel("Email", { exact: true })
    .fill("known.leader@example.test");
  await page
    .getByLabel("From date (DD/MM/YYYY)", { exact: true })
    .fill("01/10/2025");
  await page.getByRole("button", { name: "Apply dates", exact: true }).click();
  await page.waitForTimeout(500);
  assert.equal(
    await page.getByLabel("Email", { exact: true }).inputValue(),
    "known.leader@example.test",
  );
  const leaderForm=page.locator('.hc-leadership form');
  await leaderForm.locator('select').nth(0).selectOption('cell_leader');
  await leaderForm.locator('select').nth(1).selectOption(area.id);
  await leaderForm.locator('select').nth(2).selectOption(cell.id);
  page.once("dialog", (d) => d.accept());
  // The bundled browser transport omits Origin; supply the exact local test server origin.
  await page.route("**/api/home-cell/leaders", async (route) =>
    route.continue({
      headers: {
        ...route.request().headers(),
        origin: "http://localhost:" + appPort,
      },
    }),
  );
  await page
    .getByRole("button", { name: "Create / assign leader", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Leadership role added" })
    .waitFor({ state: "visible", timeout: 15000 });
  assert.equal(existingLeaderWrites.length, 1);
  assert.equal(
    existingLeaderWrites[0].p_data.user_id,
    "00000000-0000-4000-8000-000000000099",
  );
  assert.equal(inviteCalls, 0);
  console.log(
    "PASS existing-account leader creation reuses original user ID without sending invitation",
  );
  await page.getByText('Kevin Iwuji Phone number: 07032621020',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Create / assign login',exact:true}).click();
  assert.equal(await page.getByLabel('Phone number',{exact:true}).inputValue(),' +2347032621020'.trim());
  await page.route("**/api/home-cell/contacts**",async route=>route.continue({headers:{...route.request().headers(),origin}}));
  await page.getByRole('button',{name:'Edit details',exact:true}).click();
  await page.locator('form').filter({has:page.getByRole('button',{name:'Save directory details',exact:true})}).locator('textarea').first().fill('Kevin Iwuji updated 07032621020');
  await page.getByRole('button',{name:'Save directory details',exact:true}).click();
  await page.getByText('Directory details saved.',{exact:true}).waitFor();
  assert.equal(directoryContact.leader_details,'Kevin Iwuji updated 07032621020');
  console.log('PASS editable source contacts and create-login prefill');
  await page.goto(origin+'/home-cell/members');
  await page.route('**/api/home-cell/onboarding**',async route=>route.continue({headers:{...route.request().headers(),origin}}));
  await page.route('**/api/home-cell/transfers',async route=>route.continue({headers:{...route.request().headers(),origin}}));
  const onboarding=page.locator('section').filter({has:page.getByRole('heading',{name:'Add / Assign Home Cell Members',exact:true})}).last();
  await page.getByLabel('Find member by name, phone or email',{exact:true}).fill('Existing');
  await page.getByRole('button',{name:'Search members',exact:true}).click();
  await page.getByRole('button',{name:'Select this member',exact:true}).click();
  await page.getByRole('button',{name:'Preview assignment / import',exact:true}).click();
  await onboarding.getByText('Transfer approval required. Current cell stays unchanged.',{exact:true}).waitFor();
  await onboarding.locator('input[type="checkbox"]').nth(1).check();
  await onboarding.locator('input[type="checkbox"]').nth(2).check();
  await onboarding.locator('textarea').fill('Member requests a closer fellowship');
  await page.getByRole('button',{name:'Save included rows',exact:true}).click();
  await onboarding.getByRole('status').waitFor();
  assert.equal(onboardingWrites[0].rows[0].existing_id,onboardingRoster[0].id);
  assert.equal(onboardingWrites[0].request_transfers,true);
  const inbox=page.locator('#member-transfer-inbox');
  await inbox.getByText('Existing Onboard Member',{exact:true}).waitFor();
  await inbox.locator('textarea').fill('Approved nearer fellowship');
  page.once('dialog',d=>d.accept());
  await inbox.getByRole('button',{name:'Approve move',exact:true}).click();
  await inbox.getByText('Move approved',{exact:false}).waitFor();
  assert.equal(transferDecisions[0].p_decision,'moved');
  await page.getByRole('button',{name:'Add new member',exact:true}).click();
  await onboarding.getByLabel('Other names',{exact:true}).fill('Form');
  await onboarding.getByLabel('Surname',{exact:true}).fill('Onboard');
  await onboarding.getByLabel('Phone',{exact:true}).fill('08090011224');
  await page.getByRole('button',{name:'Preview assignment / import',exact:true}).click();
  await onboarding.getByText('Create a new-member record and assign this home cell.',{exact:true}).waitFor();
  await onboarding.locator('input[type="checkbox"]').last().check();
  await page.getByRole('button',{name:'Save included rows',exact:true}).click();
  await onboarding.getByRole('status').waitFor();assert.equal(onboardingWrites[1].rows[0].phone,'+2348090011224');
  await page.getByRole('button',{name:'Import CSV',exact:true}).click();
  await onboarding.locator('input[type="file"]').setInputFiles({name:'members.csv',mimeType:'text/csv',buffer:Buffer.from('first,last,phone,email_opt_in,sms_opt_in\nCSV,Onboard,08090011225,false,false\n')});
  await onboarding.getByText('members.csv: 1 rows loaded.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Preview assignment / import',exact:true}).click();
  await onboarding.getByText('Create a new-member record and assign this home cell.',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:950});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(process.env.HCO_SCREENSHOT_DIR) await page.screenshot({path:path.join(process.env.HCO_SCREENSHOT_DIR,'member-onboarding-mobile.png'),fullPage:true});
  await onboarding.locator('input[type="checkbox"]').last().check();
  await page.getByRole('button',{name:'Save included rows',exact:true}).click();
  await onboarding.getByRole('status').waitFor();assert.equal(onboardingWrites[2].source,'csv');assert.equal(onboardingWrites[2].rows[0].sms_opt_in,false);
  assert.equal(errors.length,0);
  console.log('PASS existing member reuse, conflict submission, dashboard decision, form onboarding, CSV preview/save and mobile layout');
  // Exercise real route handlers with mocked Supabase auth, never a live project.
  const createdResponse=await request('/api/home-cell/leaders',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({phone:'08031234567',full_name:'Phone leader',role:'cell_leader',area_id:area.id,cell_id:cell.id})});
  assert.equal(createdResponse.status,200);
  assert.match(createdResponse.headers.get('cache-control'),/no-store/);
  const created=await createdResponse.json();assert(created.temporary_password.length>=24);assert.equal(created.login,'+2348031234567');assert.equal(inviteCalls,0);
  const post=async(path,body)=>request(path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const createdUser=[...users.values()].find(u=>u.id===created.user_id);
  assert(!createdUser.phone);assert.match(createdUser.email,/@home-cell\.invalid$/);
  assert.equal(phoneUsernames.get('+2348031234567'),created.user_id);
  // Simulate an existing v3.2 native-phone account, with the phone provider disabled.
  const legacy={id:'00000000-0000-4000-8000-000000000077',phone:'2347037619850',password:'Legacy-password-123!',app_metadata:{hco_password_change_required:true}};
  users.set('legacy',legacy);phoneUsernames.set('+2347037619850',legacy.id);
  const repaired=await post('/api/home-cell/leaders/phone',{assignment_id:'legacy-phone-assignment',user_id:created.user_id,reason:'Repair existing phone account'});
  assert.equal(repaired.status,200);assert.equal(legacy.id,'00000000-0000-4000-8000-000000000077');assert.equal(legacy.password,'Legacy-password-123!');assert.match(legacy.email,/@home-cell\.invalid$/);
  const repairedAgain=await post('/api/home-cell/leaders/phone',{assignment_id:'legacy-phone-assignment',reason:'Retry repair safely'});assert.equal(repairedAgain.status,200);
  jar.clear();
  const legacyLogin=await post('/api/home-cell/login',{identifier:'07037619850',password:legacy.password});assert.equal(legacyLogin.status,200);
  assert.equal((await legacyLogin.json()).next,'/home-cell/activate?temporary=1');
  jar.clear();
  const signed=await post('/api/home-cell/login',{identifier:'0803 123 4567',password:created.temporary_password});
  assert.equal(signed.status,200);assert.equal((await signed.json()).next,'/home-cell/activate?temporary=1');
  assert.equal((await request('/api/home-cell/leaders')).status,403);
  const blockedPage=await request('/home-cell');assert.match(blockedPage.headers.get('location'),/activate/);
  const retained=await post('/api/home-cell/activate',{password:created.temporary_password});assert.equal(retained.status,400);
  const changed=await post('/api/home-cell/activate',{password:'My-personal-password-987!'});assert.equal(changed.status,200);
  assert.equal((await request('/api/home-cell/leaders')).status,200);
  const loginAgain=await post('/api/home-cell/login',{identifier:'+2348031234567',password:'My-personal-password-987!'});
  assert.equal(loginAgain.status,200);assert.equal((await loginAgain.json()).next,'/home-cell');
  assert.equal((await post('/api/home-cell/login',{identifier:'08031234567',password:created.temporary_password})).status,401);
  assert.equal(nativePhoneAttempts,0);
  console.log('PASS SMS-free phone usernames, legacy repair preserving ID/password, phone-only creation, no-cache credentials, normalized login, mandatory password change, access gating and old-password rejection');

  rateMode='deny';
  const denied=await post('/api/home-cell/login',{identifier:'08031234567',password:'wrong'});
  assert.equal(denied.status,429); assert.equal(denied.headers.get('retry-after'),'300');
  assert.match(denied.headers.get('x-request-id'),/^[a-f0-9-]{36}$/);
  assert.match(denied.headers.get('cache-control'),/no-store/);
  assert.equal((await post('/api/home-cell/recover',{email:'someone@example.test'})).status,429);
  rateMode='unavailable';
  assert.equal((await post('/api/home-cell/login',{identifier:'08031234567',password:'wrong'})).status,503);
  rateMode='allow';
  const oversized=await post('/api/home-cell/login',{identifier:'x'.repeat(5000),password:'wrong'});
  assert.equal(oversized.status,413);
  assert.equal((await post('/api/home-cell/login',null)).status,400);
  assert(ratePolicies.every(p=>/^[a-f0-9]{64}$/.test(p.p_bucket)));
  const secured=await request('/home-cell/login');
  assert.equal(secured.headers.get('x-content-type-options'),'nosniff');
  assert.match(secured.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  console.log('PASS HTTP throttling, Retry-After, fail-closed protection, bounded authentication payloads, request IDs, private caching and security headers');

} finally {
  await browser.close();
  child.kill();
  mock.close();
}
