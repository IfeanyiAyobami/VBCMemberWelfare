import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHmac } from "node:crypto";
export async function runGuestBrowser(origin) {
  const { chromium } = await import(
    process.env.CARE_PLAYWRIGHT_MODULE || "playwright"
  );
  const browser = await chromium.launch({
    executablePath: process.env.CARE_CHROMIUM_EXECUTABLE || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const context = await browser.newContext({
      viewport: { width: 1460, height: 1040 },
    }),
    page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  let checks = 0;
  const check = (label, value = true) => {
    assert(value, label);
    checks++;
    console.log("PASS Guest Browser: " + label);
  };
  const capture = async (name) => {
    if (!process.env.CARE_BROWSER_SCREENSHOTS) return;
    await mkdir(process.env.CARE_BROWSER_SCREENSHOTS, { recursive: true });
    if (!(await page.locator("dialog[open]").count()))
      await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(process.env.CARE_BROWSER_SCREENSHOTS, name + ".png"),
      fullPage: !(await page.locator("dialog[open]").count()),
      animations: "disabled",
    });
  };
  async function signIn(email = "admin@example.test") {
    await page.goto(origin + "/access?next=%2Fguests");
    await page.locator("#staff-email").fill(email);
    await page.locator("#staff-password").fill("Fixture-password-123!");
    await page
      .getByRole("button", { name: "Sign in to the care desk" })
      .click();
    await page.waitForURL("**/guests");
    await page
      .getByRole("heading", { name: "Guest submissions", exact: true })
      .waitFor();
    await page
      .getByRole("status")
      .filter({ hasText: "Loading saved guest" })
      .waitFor({ state: "hidden" });
  }
  async function card(first = "UI Guest", email = "ui.guest@example.test") {
    await page
      .getByRole("button", { name: "Record a guest card", exact: false })
      .click();
    const d = page.locator("dialog[open]");
    await d.getByRole("button", { name: "Continue", exact: true }).click();
    await page.locator("#guest-surname[aria-invalid=true]").waitFor();
    check("Guest intake shows required-field validation");
    await page.locator("#guest-surname").fill("Fixture");
    await page.locator("#guest-other_names").fill(first);
    await d.getByRole("button", { name: "Continue", exact: true }).click();
    await page.locator("#guest-phone").fill("08015550021");
    await page.locator("#guest-email").fill(email);
    await page.locator("#guest-birthday").fill("02-29");
    await d.getByRole("button", { name: "Continue", exact: true }).click();
    await page.locator("#guest-home_visit").selectOption("Yes");
    await d.getByRole("button", { name: "Continue", exact: true }).click();
    check(
      "Guest choices begin off",
      !(await d.locator("input[type=checkbox]:checked").count()),
    );
    await d
      .getByRole("checkbox", {
        name: "Visit and follow-up contact",
        exact: false,
      })
      .check();
    await d.getByRole("checkbox", { name: "Email", exact: true }).check();
    await d
      .getByRole("checkbox", { name: "Monthly newsletter", exact: true })
      .check();
    await page
      .locator("#guest-evidence")
      .fill(
        "Fictional signed guest card, independently selected email and newsletter.",
      );
    await d.getByRole("button", { name: "Save for review" }).click();
    await page.getByText("Guest card saved.", { exact: true }).waitFor();
    await page
      .getByRole("link", { name: new RegExp("Review " + first) })
      .click();
    await page
      .getByRole("heading", { name: first + " Fixture", exact: true })
      .waitFor();
  }
  try {
    await signIn();
    await capture("guests-dark-desktop");
    await card();
    check(
      "Saved card opens as pending",
      (await page.getByText("Pending review", { exact: true }).count()) === 1,
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Create visitor record", exact: true })
      .waitFor();
    check("Guest details survive refresh");
    await capture("guest-review-dark-desktop");
    await page
      .getByRole("button", { name: "Create visitor record", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm creation" }).click();
    await page
      .getByRole("link", { name: "Open member profile", exact: false })
      .waitFor();
    check("Review confirms creation only after acknowledgement");
    await page
      .getByRole("link", { name: "Open member profile", exact: false })
      .click();
    await page
      .getByRole("heading", { name: "UI Guest Fixture", exact: true })
      .waitFor();
    const profile = page.url();
    check(
      "New member has the birthday without a birth year",
      (await page.getByText("29 February", { exact: true }).count()) === 1,
    );
    check(
      "New member has newsletter consent",
      (
        await page
          .locator(".settings-row")
          .filter({ hasText: "Monthly newsletter" })
          .innerText()
      ).includes("Recorded"),
    );
    await page.goto(origin + "/guests");
    await card("Second Guest Visit");
    check(
      "Duplicate creation is disabled",
      await page
        .getByRole("button", { name: "Create visitor record", exact: true })
        .isDisabled(),
    );
    await page.getByRole("radio").check();
    await page.getByRole("button", { name: "Link selected member" }).click();
    await page.getByRole("button", { name: "Confirm link" }).click();
    await page.getByRole("alert").filter({ hasText: "confirm" }).waitFor();
    check("Link confirmation explains identity check");
    await page
      .getByRole("checkbox", { name: "I checked the identity", exact: false })
      .check();
    await page.getByRole("button", { name: "Confirm link" }).click();
    await page
      .getByText("The existing profile and its permissions were retained.", {
        exact: true,
      })
      .waitFor();
    check(
      "Second visit links the same profile",
      (await page
        .getByRole("link", { name: "Open member profile", exact: false })
        .getAttribute("href")) === new URL(profile).pathname,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await capture("guest-linked-dark-mobile");
    check(
      "Guest review fits the mobile viewport",
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page.getByRole("button", { name: "Switch to light mode" }).click();
    await capture("guest-linked-light-mobile");
    check(
      "Guest review supports light mode",
      (await page.locator("html").getAttribute("data-theme")) === "light",
    );
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.waitForURL("**/access");
    await signIn("viewer@example.test");
    check(
      "Viewer has no intake button",
      !(await page
        .getByRole("button", { name: "Record a guest card", exact: false })
        .count()),
    );
    const widget = await readFile(
      "wordpress/vbc-care-bridge/elementor-guest-form.html",
      "utf8",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    let receipts = 0,
      firstRaw = null;
    await page.route("**/wp-json/vbc-care/v1/config", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          enabled: true,
          endpoint: origin + "/wp-json/vbc-care/v1/guests",
          siteKey: "fixture-public-site",
        }),
      }),
    );
    await page.route(
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
      (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body: "window.turnstile={render:()=> 'fixture-widget',getResponse:()=> 'fixture-verified-token',reset:()=>{}};",
        }),
    );
    await page.route("**/wp-json/vbc-care/v1/guests", async (route) => {
      const data = JSON.parse(route.request().postData());
      assert.equal(data.turnstile_token, "fixture-verified-token");
      assert.equal(data.website, "");
      delete data.website;
      delete data.turnstile_token;
      const raw = JSON.stringify(data);
      if (firstRaw) assert.equal(raw, firstRaw);
      else firstRaw = raw;
      const timestamp = String(Math.floor(Date.now() / 1000)),
        signature =
          "sha256=" +
          createHmac("sha256", "a".repeat(64))
            .update(timestamp + "." + raw)
            .digest("hex");
      const r = await fetch(origin + "/api/intake/wordpress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VBC-Timestamp": timestamp,
          "X-VBC-Signature": signature,
        },
        body: raw,
      });
      assert.equal(r.status, 200);
      receipts++;
      // Simulated lost acknowledgement after an actual signed save; exact retry should recover it.
      await route.fulfill({
        status: receipts === 1 ? 503 : 200,
        contentType: "application/json",
        body: JSON.stringify({ success: receipts !== 1 }),
      });
    });
    await page.setContent(widget, { waitUntil: "domcontentloaded" });
    await page.locator("#vbcft-surname").fill("Widget");
    await page.locator("#vbcft-other_names").fill("Ada");
    await page.locator("#vbcft-continue-button").click();
    await page.locator("#vbcft-phone").fill("08015550031");
    await page.locator("#vbcft-email").fill("widget@example.test");
    await page.locator("#vbcft-birthday").fill("02-29");
    await page.locator("#vbcft-continue-button").click();
    await page.locator("#vbcft-continue-button").click();
    check(
      "Elementor optional choices begin off",
      !(await page
        .locator("#vbc-first-timers input[type=checkbox]:checked")
        .count()),
    );
    await page.locator("#vbcft-contact_consent").check();
    await page.locator("#vbcft-newsletters_opt_in").check();
    await page.locator("#vbcft-email_opt_in").check();
    await page.waitForFunction(() => !!window.turnstile);
    await capture("elementor-connected-review-mobile");
    await page.locator("#vbcft-continue-button").click();
    await page.locator("#vbcft-form-alert").waitFor({ state: "visible" });
    check(
      "Lost save acknowledgement does not show a false welcome",
      await page.locator("#vbcft-welcome-screen").isHidden(),
    );
    check(
      "Uncertain result retains exact guest answers",
      await page.locator("#vbcft-other_names").isDisabled(),
    );
    await page.locator("#vbcft-continue-button").click();
    await page.locator("#vbcft-welcome-screen").waitFor({ state: "visible" });
    check(
      "Exact retry shows personalized welcome only after confirmed save",
      (await page.locator("#vbcft-success-greeting").innerText()) ===
        "Thank you for connecting with us, Ada!",
    );
    check("Retry uses one immutable submission reference", receipts === 2);
    await capture("elementor-welcome-mobile");
    check(
      "Elementor form fits the mobile viewport",
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    check("No browser runtime errors", errors.length === 0);
    console.log(
      checks +
        " guest browser checks passed. Turnstile and WordPress transport are local fixtures.",
    );
  } finally {
    await browser.close();
  }
}
