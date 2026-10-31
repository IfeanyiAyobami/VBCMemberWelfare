import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
const campaigns = [],
  messages = [],
  permissions = new Map(),
  replies = [];
export async function whatsappMock(req, res, url, auth, json) {
  if (!url.pathname.startsWith("/rest/v1/rpc/care_wa_")) return false;
  const service = req.headers.apikey === "sb_secret_hco_fixture_0123456789";
  if (!service && !auth?.user?.active) {
    json(res, 403, { code: "42501", message: "Not allowed" });
    return true;
  }
  let raw = "";
  for await (const c of req) raw += c;
  const d = JSON.parse(raw || "{}"),
    op = url.pathname.split("/").pop();
  let result;
  if (op === "care_wa_read")
    result = {
      coordinator: auth?.user.role === "administrator",
      contact_allowed: true,
      permission: permissions.get(d.p_member) || null,
      campaigns,
      messages: messages.filter((m) => m.member_id === d.p_member),
      replies,
    };
  else if (op === "care_wa_campaign") {
    result = randomUUID();
    campaigns.push({
      id: result,
      title: d.p_title,
      body: d.p_body,
      template_name: d.p_template,
      language: d.p_language,
      flyer: "/whatsapp/sunday-invitation.jpg",
    });
  } else if (op === "care_wa_permission") {
    permissions.set(d.p_member, {
      allowed: d.p_allowed,
      evidence: d.p_evidence,
    });
    result = null;
  } else if (op === "care_wa_prepare") {
    let m = messages.find((x) => x.id === d.p_request);
    if (!m) {
      m = {
        id: d.p_request,
        member_id: d.p_member,
        campaign_id: d.p_campaign,
        mode: d.p_mode,
        body: d.p_body,
        recipient: "+2348015550999",
        state: "opened",
        actor: auth.user.id,
        created_at: new Date().toISOString(),
        recorded_at: null,
      };
      messages.unshift(m);
    }
    result = m;
  } else if (op === "care_wa_record") {
    const m = messages.find((x) => x.id === d.p_message);
    m.state = "staff_" + d.p_outcome;
    m.recorded_at = new Date().toISOString();
    m.outcome = d.p_outcome;
    result = null;
  } else if (op === "care_wa_webhook") {
    replies.push(...d.p_replies);
    result = null;
  } else {
    json(res, 400, { message: "Unknown WhatsApp fixture RPC" });
    return true;
  }
  json(res, 200, result);
  return true;
}
export async function runWhatsAppBrowser(page, origin) {
  await page
    .getByRole("button", { name: "WhatsApp", exact: true })
    .click();
  await page.getByRole("heading", { name: "WhatsApp, your way" }).waitFor();
  await page
    .getByLabel("Invitation title", { exact: true })
    .fill("Fictional Sunday invitation");
  await page
    .getByLabel("Approved Meta template name · optional", { exact: true })
    .fill("vbc_sunday_invitation");
  await page
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await page
    .getByText(
      "Invitation created. API mode checks the exact approved image template before dispatch.",
    )
    .waitFor();
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    for (const width of [1440, 834, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "WhatsApp layout fits " + width,
      );
      const input = page.getByLabel("WhatsApp invitation text", {
        exact: true,
      });
      const colors = await input.evaluate((el) => ({
        fg: getComputedStyle(el).color,
        bg: getComputedStyle(el).backgroundColor,
      }));
      assert.notEqual(colors.fg, colors.bg);
      if (theme === "dark") assert.equal(colors.bg, "rgb(0, 9, 86)");
      if (process.env.HCO_SCREENSHOT_DIR)
        await page.screenshot({
          path:
            process.env.HCO_SCREENSHOT_DIR + `/whatsapp-${theme}-${width}.png`,
          fullPage: true,
        });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const flyer = page.locator(".wa-flyer img");
  assert(await flyer.evaluate((el) => el.complete && el.naturalWidth === 1080));
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download flyer", exact: true }).click();
  assert((await download).suggestedFilename().endsWith(".jpg"));
  await page
    .getByRole("button", { name: "Prepare WhatsApp handoff", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Open WhatsApp ↗", exact: true })
    .waitFor();
  const href = await page
    .getByRole("link", { name: "Open WhatsApp ↗", exact: true })
    .getAttribute("href");
  assert(href.startsWith("https://wa.me/2348015550999?text="));
  await page
    .getByText("WhatsApp handoff prepared · sending not confirmed", {
      exact: true,
    })
    .waitFor({ timeout: 10000 });
  await page
    .getByLabel("WhatsApp activity outcome", { exact: true })
    .selectOption("sent");
  await page
    .locator(".wa-record textarea")
    .fill("Fixture staff sent the invitation and flyer.");
  await page
    .getByRole("button", { name: "Save WhatsApp activity", exact: true })
    .click();
  await page.getByText("Staff reported sent", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Official API", exact: false })
    .click();
  await page
    .getByText("API not configured. Staff-assisted sending is available.")
    .waitFor();
  assert(
    await page
      .getByRole("button", { name: "Send paid API invitation", exact: true })
      .isDisabled(),
  );
  const person = new URL(page.url()).searchParams.get("person");
  const disabled = await page.request.post(origin + "/api/whatsapp", {
    headers: { Origin: origin },
    data: {
      action: "prepare",
      memberId: person,
      campaignId: campaigns[0].id,
      mode: "api",
      body: "test invitation",
      confirmPaid: true,
      requestId: randomUUID(),
    },
  });
  assert.equal(disabled.status(), 400);
  const csrf = await page.request.post(origin + "/api/whatsapp", {
    headers: { Origin: "https://evil.invalid" },
    data: {
      action: "permission",
      memberId: person,
      allowed: true,
      evidence: "invalid request",
    },
  });
  assert.equal(csrf.status(), 403);
  const check = await page.request.get(
    origin +
      "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=fixture-verify-token-long&hub.challenge=12345",
  );
  assert.equal(check.status(), 200);
  assert.equal(await check.text(), "12345");
  const bad = await page.request.post(origin + "/api/whatsapp/webhook", {
    data: { object: "whatsapp_business_account" },
  });
  assert.equal(bad.status(), 401);
  const raw = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "222",
        changes: [
          {
            field: "messages",
            value: { metadata: { phone_number_id: "111" }, statuses: [] },
          },
        ],
      },
    ],
  });
  const signed = await page.request.post(origin + "/api/whatsapp/webhook", {
    headers: {
      "x-hub-signature-256":
        "sha256=" +
        createHmac("sha256", "fixture-app-secret-long")
          .update(raw)
          .digest("hex"),
      "Content-Type": "application/json",
    },
    data: raw,
  });
  assert.equal(signed.status(), 200);
  console.log(
    "PASS WhatsApp real HTTP routes, campaign creation, staff handoff, real flyer download, staff outcomes, API-disabled guard, CSRF, signed webhook verification and responsive contrast in both themes",
  );
}
