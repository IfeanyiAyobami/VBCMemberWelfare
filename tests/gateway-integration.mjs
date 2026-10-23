import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
export async function runGatewayIntegration({
  request,
  login,
  check,
  token,
  setFault,
  guests,
  userLookups,
}) {
  const endpoint = "/api/integrations/wordpress/first-timers";
  const p = {
    ...JSON.parse(
      await readFile("tests/fixtures/wordpress-gateway.json", "utf8"),
    ),
    submission_id: randomUUID(),
  };
  const post = (body = p, headers = {}) =>
    request(endpoint, {
      method: "POST",
      headers: {
        Cookie: "",
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        "Idempotency-Key": p.submission_id,
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  let r = await post(p, { Authorization: "" });
  check(
    r.status === 401 && !r.headers.get("location"),
    "Missing token gives JSON 401 without login redirect",
  );
  r = await post(p, { Authorization: "Bearer " + "x".repeat(64) });
  check(r.status === 401, "Wrong integration token is rejected");
  await login();
  r = await post(p, { Authorization: "" });
  check(
    r.status === 401,
    "Staff session cannot substitute for integration token",
  );
  r = await post("not-json");
  check(r.status === 400, "Malformed JSON rejected");
  r = await post(p, { "Content-Type": "text/plain" });
  check(r.status === 415, "JSON media type required");
  r = await post(p, { "Idempotency-Key": randomUUID() });
  check(r.status === 400, "Header must match WordPress submission ID");
  r = await post({ ...p, contact_consent: true });
  check(r.status === 400, "Gateway consent must be the literal Yes string");
  r = await post({ ...p, address: "different" });
  check(r.status === 400, "Conflicting compatibility aliases rejected");
  r = await post({ ...p, email_opt_in: true });
  check(r.status === 400, "Sending consent cannot be injected");
  r = await post(" ".repeat(32769));
  check(r.status === 413, "Body size limit enforced");
  const before = userLookups();
  r = await post();
  let data = await r.json();
  check(
    r.status === 201 &&
      data.success === true &&
      data.id &&
      data.duplicate === false,
    "Exact 24-field payload saves one pending guest",
  );
  check(
    !r.headers.get("set-cookie") &&
      r.headers.get("cache-control").includes("no-store") &&
      r.headers.get("netlify-cdn-cache-control") === "no-store",
    "Machine endpoint is uncached and sets no staff cookies",
  );
  check(
    userLookups() === before,
    "Machine endpoint bypasses staff session proxy",
  );
  const guestId = data.id;
  r = await post(Object.fromEntries(Object.entries(p).reverse()));
  data = await r.json();
  check(
    r.status === 200 && data.success && data.duplicate && data.id === guestId,
    "Identical payload with reordered keys acknowledges original receipt",
  );
  r = await post({ ...p, date_submitted: "2026-10-10 09:05:01" });
  check(
    r.status === 409 && (await r.json()).code === "submission_conflict",
    "Changed timestamp under same UUID is explicit conflict",
  );
  r = await post({
    ...p,
    surname: "Changed",
    full_name: "Changed " + p.other_names,
  });
  check(
    r.status === 409,
    "Changed visitor under same UUID cannot overwrite saved guest",
  );
  const saved = guests.get(guestId);
  check(
    saved.submission_key === p.submission_id &&
      saved.phone === "+2348015550123" &&
      saved.review_status === "pending" &&
      saved.member_id === null,
    "Gateway mapping uses existing guest queue and normalized contact",
  );
  check(
    [
      "email_opt_in",
      "sms_opt_in",
      "celebrations_opt_in",
      "programmes_opt_in",
      "newsletters_opt_in",
    ].every((k) => saved[k] === ["email_opt_in", "sms_opt_in"].includes(k)),
    "Gateway retains existing email/SMS defaults and optional category opt-outs; delivery is separately paused",
  );
  const retry = { ...p, submission_id: randomUUID() };
  setFault("unavailable");
  r = await post(retry, { "Idempotency-Key": retry.submission_id });
  check(
    r.status === 503 &&
      !(await r.json()).success &&
      ![...guests.values()].some(
        (g) => g.submission_key === retry.submission_id,
      ),
    "Supabase failure returns retryable JSON without saving",
  );
  setFault(null);
  r = await post(retry, { "Idempotency-Key": retry.submission_id });
  check(
    r.status === 201 && (await r.json()).success,
    "The same UUID succeeds after storage recovery",
  );
  const lost = { ...p, submission_id: randomUUID() };
  setFault("lost_ack");
  r = await post(lost, { "Idempotency-Key": lost.submission_id });
  check(
    r.status === 503,
    "A lost acknowledgement is not presented as a confirmed save",
  );
  r = await post(lost, { "Idempotency-Key": lost.submission_id });
  check(
    r.status === 200 && (await r.json()).duplicate,
    "Retry after committed save and lost acknowledgement returns duplicate success",
  );
  const concurrent = { ...p, submission_id: randomUUID() };
  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      post(concurrent, { "Idempotency-Key": concurrent.submission_id }),
    ),
  );
  const bodies = await Promise.all(results.map((r) => r.json()));
  check(
    results.filter((r) => r.status === 201).length === 1 &&
      results.filter((r) => r.status === 200).length === 11 &&
      new Set(bodies.map((b) => b.id)).size === 1 &&
      bodies.every((b) => b.success),
    "Twelve concurrent HTTP requests confirm one receipt",
  );
  check(
    [...guests.values()].filter(
      (g) => g.submission_key === concurrent.submission_id,
    ).length === 1,
    "Concurrent fixture requests produce only one guest",
  );
  await login("viewer@example.test");
  r = await request("/api/guests/" + guestId);
  check(
    r.status === 200 && (await r.json()).guest.id === guestId,
    "Existing read-only role can review the incoming guest",
  );
  r = await request("/api/guests/" + guestId + "/review", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: new URL(r.url).origin,
    },
    body: "{}",
  });
  check(r.status === 403, "Existing viewer role cannot make review decisions");
  await request("/api/auth/logout", {
    method: "POST",
    headers: { Origin: new URL(r.url).origin },
  });
  r = await request("/api/guests/" + guestId);
  check(r.status === 401, "Incoming guest details remain private");
}
