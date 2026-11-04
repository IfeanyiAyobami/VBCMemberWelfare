import assert from "node:assert/strict";

const lagos = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
const [year, month, day] = lagos().split("-").map(Number);
const celebrant = {
  id: "95000000-0000-4000-8000-000000000001",
  other_names: "Fixture",
  surname: "Celebrant",
  status: "member",
  phone: "08015550177",
  whatsapp: null,
  birthday_month: month,
  birthday_day: day,
  anniversary_month: null,
  anniversary_day: null,
  created_at: new Date().toISOString(),
  care_preferences: {
    contact_consent: true,
    celebrations_opt_in: true,
    email_opt_in: false,
    sms_opt_in: false,
  },
};
const quiet = {
  ...celebrant,
  id: "95000000-0000-4000-8000-000000000002",
  other_names: "Quiet",
  surname: "Optout",
  care_preferences: { ...celebrant.care_preferences, celebrations_opt_in: false },
};
const greetings = [];

/** Fixture for /api/celebrations and /api/celebrations/greet (signed-in staff only). */
export async function greetingsMock(req, res, url, auth, json) {
  const service = req.headers.apikey === "sb_secret_hco_fixture_0123456789";
  if (service) return false;
  if (
    url.pathname === "/rest/v1/care_members" &&
    (url.searchParams.get("select") || "").includes("birthday_month")
  ) {
    if (!auth?.user?.active) return json(res, 403, { code: "42501" }), true;
    res.setHeader("Content-Range", "0-1/2");
    json(res, 200, [celebrant, quiet]);
    return true;
  }
  if (url.pathname !== "/rest/v1/care_celebration_greetings") return false;
  if (!auth?.user?.active) return json(res, 403, { code: "42501" }), true;
  const single = String(req.headers.accept || "").includes("vnd.pgrst.object");
  if (req.method === "GET") {
    let rows = greetings;
    for (const [k, v] of url.searchParams) {
      if (["select", "limit"].includes(k)) continue;
      if (v.startsWith("eq.")) rows = rows.filter((r) => String(r[k]) === v.slice(3));
      if (v.startsWith("in.(")) {
        const list = v.slice(4, -1).split(",");
        rows = rows.filter((r) => list.includes(String(r[k])));
      }
    }
    if (single) {
      if (!rows.length) return json(res, 406, { code: "PGRST116", message: "No rows" }), true;
      return json(res, 200, rows[0]), true;
    }
    return json(res, 200, rows), true;
  }
  if (req.method === "POST") {
    if (!["administrator", "editor"].includes(auth.user.role))
      return json(res, 403, { code: "42501", message: "Not allowed" }), true;
    let raw = "";
    for await (const c of req) raw += c;
    const d = JSON.parse(raw || "{}");
    const row = Array.isArray(d) ? d[0] : d;
    if (
      greetings.some(
        (g) =>
          g.member_id === row.member_id &&
          g.occasion === row.occasion &&
          g.occasion_year === row.occasion_year,
      )
    )
      return json(res, 409, { code: "23505", message: "duplicate key" }), true;
    const saved = {
      member_id: row.member_id,
      occasion: row.occasion,
      occasion_year: row.occasion_year,
      channel: row.channel,
      greeted_by_name: "Care " + auth.user.role,
      greeted_at: new Date().toISOString(),
    };
    greetings.push(saved);
    return json(res, 201, single ? saved : [saved]), true;
  }
  return false;
}

export async function runGreetingsBrowser(page, origin) {
  const errors = [];
  const listener = (e) => errors.push(e.message);
  page.on("pageerror", listener);
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(origin + "/overview");
    await page.getByRole("heading", { name: /EVERY PERSON MATTERS/ }).waitFor();
    assert.equal(await page.locator(".demo-bar").count(), 0, "No permanent preview banner");
    assert(await page.locator(".nav-soon summary").isVisible(), "Previews grouped under Coming soon");
    assert(
      !(await page.locator("#navigation .nav-soon a[href='/campaigns']").isVisible()),
      "Preview screens are folded away",
    );
    const row = page.locator(".vbc-greet-row").filter({ hasText: "Fixture Celebrant" });
    await row.getByRole("button", { name: "Send greeting", exact: true }).waitFor();
    const optout = page.locator(".vbc-greet-row").filter({ hasText: "Quiet Optout" });
    await optout.getByText("No celebration messages").waitFor();
    assert.equal(
      await optout.getByRole("button", { name: "Send greeting" }).count(),
      0,
      "No greeting button for people who opted out",
    );
    console.log("PASS Overview celebrations: Send greeting offered, opt-outs respected, previews folded away");

    await page.evaluate(() => {
      window.__opened = [];
      window.open = (u) => {
        window.__opened.push(u);
        return null;
      };
    });
    await row.getByRole("button", { name: "Send greeting", exact: true }).click();
    const opened = await page.evaluate(() => window.__opened);
    assert.equal(opened.length, 1);
    assert(
      opened[0].startsWith("https://wa.me/2348015550177?text=Happy%20birthday%2C%20Fixture!"),
      "WhatsApp opens with the greeting ready: " + opened[0],
    );
    await page.getByRole("heading", { name: "Did you send the greeting?" }).waitFor();
    await page.getByRole("button", { name: "Yes, record it", exact: true }).click();
    await row.getByText(/Greeted by Care administrator/).waitFor();
    assert.equal(greetings.length, 1);
    assert.equal(greetings[0].occasion_year, year);
    assert.equal(greetings[0].channel, "whatsapp");
    await page.reload();
    await page
      .locator(".vbc-greet-row")
      .filter({ hasText: "Fixture Celebrant" })
      .getByText(/Greeted by Care administrator/)
      .waitFor();
    assert.equal(
      await page
        .locator(".vbc-greet-row")
        .filter({ hasText: "Fixture Celebrant" })
        .getByRole("button", { name: "Send greeting" })
        .count(),
      0,
      "Greeted people cannot be greeted twice by mistake",
    );
    console.log("PASS Send greeting: WhatsApp opens with message, one-tap record under staff name, persists after reload");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole("heading", { name: /EVERY PERSON MATTERS/ }).waitFor();
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      "Overview fits a phone without sideways scrolling",
    );
    await page.goto(origin + "/guests");
    await page.getByRole("heading", { name: "Guest cards", exact: true }).waitFor();
    await page.getByText("Step 1 · You are here").waitFor();
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      "Guest cards fit a phone",
    );
    assert.deepEqual(errors, []);
    console.log("PASS Guest cards: renamed, guest journey shown, phone layout fits");
  } finally {
    page.off("pageerror", listener);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
}
