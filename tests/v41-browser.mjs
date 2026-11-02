import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const programmes = [],
  requests = new Map();
let failSave = false,
  failRead = false;
export async function programmeMock(req, res, url, auth, json) {
  if (
    !url.pathname.includes("care_programme") &&
    !url.pathname.includes("care-programme-flyers")
  )
    return false;
  if (
    !auth?.user?.active &&
    !url.pathname.startsWith("/storage/v1/object/public/")
  ) {
    json(res, 403, { code: "42501" });
    return true;
  }
  if (url.pathname === "/rest/v1/care_programmes") {
    if (failRead) {
      json(res, 503, { message: "Fictional unavailable" });
      return true;
    }
    json(res, 200, programmes);
    return true;
  }
  if (url.pathname.endsWith("care_programme_can_edit")) {
    json(res, 200, ["administrator", "editor"].includes(auth.user.role));
    return true;
  }
  if (url.pathname.endsWith("care_programme_save")) {
    let raw = "";
    for await (const c of req) raw += c;
    const d = JSON.parse(raw);
    if (!["administrator", "editor"].includes(auth.user.role)) {
      json(res, 403, { code: "42501" });
      return true;
    }
    if (failSave) {
      failSave = false;
      json(res, 503, { code: "XX000" });
      return true;
    }
    if (requests.has(d.p_request)) {
      json(res, 200, requests.get(d.p_request));
      return true;
    }
    const x = d.p_data,
      old = programmes.find((p) => p.id === x.id);
    const item = {
      id: old?.id || crypto.randomUUID(),
      title: x.title,
      description: x.description,
      recurrence: x.recurrence,
      event_date: x.date || null,
      weekday: x.weekday,
      start_time: x.time,
      venue: x.venue,
      information_link: x.link,
      flyer_path: x.flyerPath,
      version: (old?.version || 0) + 1,
      created_at: new Date().toISOString(),
    };
    if (old) Object.assign(old, item);
    else programmes.push(item);
    requests.set(d.p_request, item);
    json(res, 200, item);
    return true;
  }
  if (url.pathname.startsWith("/storage/v1/object/public/")) {
    res.writeHead(200, { "Content-Type": "image/jpeg" });
    res.end(await readFile("public/whatsapp/sunday-invitation.jpg"));
    return true;
  }
  if (url.pathname.startsWith("/storage/v1/object/")) {
    for await (const c of req) {
    }
    json(res, 200, { Key: url.pathname.split("/object/")[1] });
    return true;
  }
  return false;
}
export async function runV41Browser(page, origin) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/programmes");
  await page
    .getByRole("heading", { name: "No programmes yet", exact: true })
    .waitFor();
  const large=await page.request.post(origin+'/api/programmes/flyer',{headers:{Origin:origin},multipart:{file:{name:'too-large.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(4194305)}}});
  assert([400,413].includes(large.status()));
  const svg=await page.request.post(origin+'/api/programmes/flyer',{headers:{Origin:origin},multipart:{file:{name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg></svg>')}}});assert.equal(svg.status(),400);
  const cross=await page.request.post(origin+'/api/programmes',{headers:{Origin:'https://example.invalid'},data:{}});assert.equal(cross.status(),403);
  await page.getByRole("button", { name: "Create programme" }).click();
  await page.locator("#event-title").fill("Fictional weekly service");
  await page.locator("#event-venue").fill("Fictional training auditorium");
  await page
    .locator("#event-description")
    .fill("Weekly schedule and flyer example");
  await page.locator("#event-recurrence").selectOption("weekly");
  assert.equal(await page.locator("#event-date").isVisible(), false);
  assert.equal(
    await page.locator("#event-title").inputValue(),
    "Fictional weekly service",
  );
  await page
    .locator("#event-flyer")
    .setInputFiles("public/whatsapp/sunday-invitation.jpg");
  failSave = true;
  await page
    .getByRole("button", { name: "Save programme", exact: true })
    .click();
  await page.locator("#event-errors").getByRole("alert").waitFor();
  assert.equal(
    await page.locator("#event-title").inputValue(),
    "Fictional weekly service",
  );
  await page
    .getByRole("button", { name: "Save programme", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Fictional weekly service", exact: true })
    .waitFor();
  assert.equal(programmes.length, 1);
  assert(programmes[0].flyer_path);
  await page.reload();
  await page
    .getByRole("heading", { name: "Fictional weekly service", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "View full flyer", exact: true })
    .waitFor();
  const shots = process.env.HCO_SCREENSHOT_DIR;
  if (shots)
    await page.screenshot({
      path: shots + "/v41-programmes-desktop.png",
      fullPage: true,
    });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  assert.equal(await page.locator("#event-recurrence").inputValue(), "weekly");
  await page.locator("#event-recurrence").selectOption("once");
  await page.locator("#event-date").fill("2027-01-01");
  assert.equal(
    await page.locator("#event-venue").inputValue(),
    "Fictional training auditorium",
  );
  await page
    .getByRole("button", { name: "Save programme", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.reload();
  await page
    .getByRole("heading", { name: "Fictional weekly service", exact: true })
    .waitFor();
  assert.equal(programmes[0].event_date, "2027-01-01");
  await page.goto(origin + "/overview");
  await page
    .locator(".vbc-upcoming-card")
    .filter({ hasText: "Fictional weekly service" })
    .waitFor();
  failRead = true;
  await page.goto(origin + "/programmes");
  await page
    .getByText(
      "Saved programmes could not be loaded. Check migration 023 and refresh.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.getByText("Family & Friends Sunday", { exact: true }).count(),
    0,
  );
  failRead = false;
  await page.getByRole("button", { name: "Refresh programmes" }).click();
  await page
    .getByRole("heading", { name: "Fictional weekly service", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  if (shots)
    await page.screenshot({
      path: shots + "/v41-programmes-mobile.png",
      fullPage: true,
    });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.goto(origin + "/followups");
  await page.getByRole("heading", { name: "Today’s care" }).waitFor();
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  const file = {
    name: "fictional.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "first,last,phone,email\nCSV Fictional,Example,08015550996,\nMissing,Contact,,",
    ),
  };
  await page.locator(".vj-import-dialog input[type=file]").setInputFiles(file);
  await page.getByText(/2 rows · 0 saved · 1 need correction/).waitFor();
  await page
    .getByRole("button", { name: "Save / retry 1 rows", exact: true })
    .click();
  await page.getByText(/2 rows · 1 saved · 1 need correction/).waitFor();
  if (shots)
    await page.screenshot({
      path: shots + "/v41-csv-mobile.png",
      fullPage: true,
    });
  await page.getByRole("button", { name: "Close import", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator(".vj-sidebar")
    .getByRole("button", { name: "People register", exact: true })
    .click();
  await page
    .getByRole("columnheader", { name: "Date on board", exact: true })
    .waitFor();
  if (shots)
    await page.screenshot({
      path: shots + "/v41-register-desktop.png",
      fullPage: true,
    });
  await page
    .locator(".vj-sidebar")
    .getByRole("button", { name: "Foundation classes", exact: true })
    .click();
  await page.getByRole("columnheader", { name: "W7", exact: true }).waitFor();
  if (shots)
    await page.screenshot({
      path: shots + "/v41-cfc-desktop.png",
      fullPage: true,
    });
  for (const width of [834, 390]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    if (shots)
      await page.screenshot({
        path: shots + "/v41-cfc-" + width + ".png",
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (shots) {
    await page.goto(
      origin + "/followups?person=80000000-0000-4000-8000-000000000003",
    );
    await page
      .getByRole("heading", { name: "Walk-in Fictional Member", exact: true })
      .waitFor();
    for (const [label, stem] of [
      ["Journey", "profile-journey"],
      ["Membership & CFC", "membership"],
      ["Community", "community"],
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.screenshot({
        path: shots + "/v41-" + stem + ".png",
        fullPage: true,
      });
    }
    await page
      .getByRole("button", { name: "Log outcome", exact: true })
      .click();
    await page.screenshot({
      path: shots + "/v41-contact-form.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.goto(origin + "/followups");
    await page.getByRole("heading", { name: "Today’s care" }).waitFor();
    await page
      .getByRole("button", { name: "Register a person", exact: true })
      .click();
    await page.screenshot({
      path: shots + "/v41-direct-form.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .locator(".vj-sidebar")
      .getByRole("button", { name: "Reports & Friends analysis", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: "Follow Through Friends analysis",
        exact: true,
      })
      .waitFor();
    await page.screenshot({
      path: shots + "/v41-friends-analysis.png",
      fullPage: true,
    });
  }
  await page.goto(origin + "/followups");
  console.log(
    "PASS v4.1 programme failure keeps draft, save/reload, one-off/weekly switching, flyer upload, Overview feed, no demo fallback, CSV partial save, register/CFC and mobile layouts",
  );
}
