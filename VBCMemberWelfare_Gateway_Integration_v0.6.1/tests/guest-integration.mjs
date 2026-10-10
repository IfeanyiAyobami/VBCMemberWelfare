import { createHmac, randomUUID } from "node:crypto";
export async function runGuestIntegration({
  request,
  write,
  login,
  check,
  origin,
  bridgeSecret,
}) {
  const card = {
    surname: "Integration",
    other_names: "Guest Review",
    visit_date: "2026-10-01",
    occupation: "",
    gender: "",
    age_range: "",
    marital_status: "",
    phone: "08015550011",
    whatsapp: "",
    email: "guest.integration@example.test",
    residential_address: "",
    born_again: "",
    home_visit: "",
    discovery_source: "",
    discovery_details: "",
    invited_by: "",
    birthday: "02-29",
    anniversary: "",
    contact_consent: true,
    email_opt_in: true,
    sms_opt_in: false,
    celebrations_opt_in: false,
    programmes_opt_in: false,
    newsletters_opt_in: true,
  };
  const logout = () =>
    request("/api/auth/logout", {
      method: "POST",
      headers: { Origin: origin },
    });
  let r = await request("/api/guests");
  check(r.status === 401, "Anonymous users cannot read guest cards");
  const intake = "/api/intake/wordpress",
    timestamp = String(Math.floor(Date.now() / 1000));
  const signed = async (body, { time = timestamp, signature = null } = {}) => {
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    return request(intake, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VBC-Timestamp": time,
        "X-VBC-Signature":
          signature ||
          "sha256=" +
            createHmac("sha256", bridgeSecret)
              .update(time + "." + raw)
              .digest("hex"),
      },
      body: raw,
    });
  };
  const web = {
    ...card,
    email: "web.integration@example.test",
    phone: "08015550012",
    requestId: randomUUID(),
  };
  r = await request(intake, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(web),
  });
  check(r.status === 401, "Unsigned public receiver requests are denied");
  r = await signed(web, { time: String(Number(timestamp) - 301) });
  check(r.status === 401, "Expired server signatures are denied");
  r = await signed(web, { signature: "sha256=" + "0".repeat(64) });
  check(r.status === 401, "A tampered signature is denied");
  r = await signed({ ...web, source: "manual" });
  check(r.status === 400, "Receiver rejects caller-controlled source metadata");
  r = await signed({ ...web, email_opt_in: "Yes" });
  check(r.status === 400, "Receiver rejects string permission values");
  r = await signed(web);
  check(
    r.status === 200 && (await r.json()).success === true,
    "Signed receiver acknowledges the durable guest save",
  );
  r = await signed(web);
  check(r.status === 200, "Signed retry confirms the same saved card");
  r = await signed({ ...web, other_names: "Changed reference" });
  check(
    r.status === 409,
    "Changed details cannot reuse a submission reference",
  );
  check(
    r.headers.get("cache-control").includes("no-store") &&
      !r.headers.get("set-cookie"),
    "Receiver returns no-store responses without staff cookies",
  );
  await login();
  r = await request("/api/guests?q=web.integration&status=all");
  let webPage = await r.json();
  check(
    webPage.items.length === 1 &&
      webPage.items[0].source === "wordpress" &&
      webPage.items[0].status === "pending",
    "Website record appears once in the pending staff queue",
  );
  const body = {
    ...card,
    requestId: randomUUID(),
    evidence: "Fictional permission recorded in the test guest card.",
  };
  r = await write("POST", "/api/guests", { ...body, entered_by: randomUUID() });
  check(r.status === 400, "Staff intake rejects spoofed identity metadata");
  r = await write("POST", "/api/guests", { ...body, contact_consent: false });
  check(r.status === 400, "Follow-up permission is required");
  r = await write("POST", "/api/guests", body);
  let g = (await r.json()).guest;
  check(
    r.status === 201 && g.status === "pending" && g.phone === "+2348015550011",
    "Staff card is normalized and saved for review",
  );
  r = await write("POST", "/api/guests", body);
  check(
    r.status === 201 && (await r.json()).guest.id === g.id,
    "Staff save retries return the same guest card",
  );
  const decision = {
    action: "create",
    memberId: randomUUID(),
    targetVersion: null,
    expectedVersion: g.version,
    notes: "Reviewed integration fixture.",
    identityConfirmed: false,
  };
  r = await write("POST", "/api/guests/" + g.id + "/review", decision);
  check(
    r.status === 200 && (await r.json()).guest.memberId === decision.memberId,
    "Review creates a saved visitor record",
  );
  r = await request("/api/members/" + decision.memberId);
  const member = (await r.json()).member;
  check(
    member.preferences.newsletters_opt_in &&
      member.preferences.email_opt_in &&
      !member.preferences.sms_opt_in,
    "Created visitor retains independent guest choices",
  );
  r = await write("POST", "/api/guests", {
    ...body,
    requestId: randomUUID(),
    other_names: "Second visit",
    email_opt_in: false,
    newsletters_opt_in: false,
  });
  g = (await r.json()).guest;
  r = await request("/api/guests/" + g.id);
  const detail = await r.json();
  check(
    detail.matches.length === 1 && detail.matches[0].id === member.id,
    "Duplicate review includes the existing contact match",
  );
  r = await write("POST", "/api/guests/" + g.id + "/review", {
    ...decision,
    expectedVersion: g.version,
    memberId: randomUUID(),
  });
  check(r.status === 409, "Duplicate contact cannot create another member");
  const link = {
    ...decision,
    action: "link",
    memberId: member.id,
    targetVersion: member.version,
    expectedVersion: g.version,
    identityConfirmed: false,
  };
  r = await write("POST", "/api/guests/" + g.id + "/review", link);
  check(r.status === 400, "Link needs explicit identity confirmation");
  r = await write("POST", "/api/guests/" + g.id + "/review", {
    ...link,
    identityConfirmed: true,
  });
  check(
    r.status === 200,
    "An explicitly confirmed matching visit can be linked",
  );
  r = await request("/api/members/" + member.id);
  const linked = (await r.json()).member;
  check(
    JSON.stringify(linked) === JSON.stringify(member),
    "Link leaves the existing profile and permission choices unchanged",
  );
  await logout();
  await login("viewer@example.test");
  r = await request("/api/guests");
  check(r.status === 200, "Viewer can read saved guest submissions");
  r = await write("POST", "/api/guests", body);
  check(r.status === 403, "Viewer cannot record a guest card");
  r = await write("POST", "/api/guests/" + g.id + "/review", link);
  check(r.status === 403, "Viewer cannot make review decisions");
  await logout();
}
