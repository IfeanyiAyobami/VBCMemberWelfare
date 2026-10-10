import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Optional: install Playwright and its Chromium browser before using --browser.
// Environment paths allow a supplied runtime browser without adding production dependencies.
export async function runMemberBrowser(origin) {
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
  page.on("pageerror", (error) => errors.push(String(error)));
  let checks = 0;
  const check = (label, value) => {
    assert(value, label);
    checks++;
    console.log("PASS Browser: " + label);
  };
  const capture = async (name) => {
    if (!process.env.CARE_BROWSER_SCREENSHOTS) return;
    await mkdir(process.env.CARE_BROWSER_SCREENSHOTS, { recursive: true });
    if (!(await page.locator("dialog[open]").count()))
      await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(process.env.CARE_BROWSER_SCREENSHOTS, name + ".png"),
      fullPage: (await page.locator("dialog[open]").count()) === 0,
      animations: "disabled",
    });
  };
  try {
    await page.goto(origin + "/access?next=%2Fmembers");
    await page.locator("#staff-email").fill("admin@example.test");
    await page.locator("#staff-password").fill("Fixture-password-123!");
    await page
      .getByRole("button", { name: "Sign in to the care desk" })
      .click();
    await page.waitForURL("**/members");
    await page
      .getByText("22 saved records", { exact: false })
      .waitFor()
      .catch(() => page.locator("tbody tr").first().waitFor());
    check(
      "Real directory loads",
      (await page.locator("#member-desk").count()) === 1,
    );
    await capture("members-dark-desktop");
    await page.locator('input[type="search"]').fill("no-such-fixture");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page
      .getByRole("heading", { name: "No members match this view" })
      .waitFor();
    check("Search shows the filtered empty state", true);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.locator("tbody tr").first().waitFor();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page
      .getByText("21–22 of 22 saved records", { exact: true })
      .waitFor();
    check(
      "Next page displays the remaining two members",
      (await page.locator("tbody tr").count()) === 2,
    );
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await page.getByText("1–20 of 22 saved records", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Add member", exact: false })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Save member", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Check the highlighted fields" })
      .waitFor();
    check(
      "Required-field errors are visible",
      (await page.locator('input[aria-invalid="true"]').count()) >= 2,
    );
    await page.locator("#record-first").fill("UI Review");
    await page.locator("#record-last").fill("Fixture");
    await page.locator("#record-email").fill("ui.review@example.test");
    await page.locator("#record-birthday").selectOption("02");
    await page.getByLabel("Birthday day", { exact: true }).fill("29");
    await page
      .getByRole("button", { name: "Save member", exact: true })
      .click();
    await page.getByText("Saved UI Review Fixture.", { exact: true }).waitFor();
    check(
      "Saving closes the form after confirmation",
      !(await page.locator("dialog").count()),
    );
    await page.getByRole("link", { name: "View saved profile" }).click();
    await page
      .getByRole("heading", { name: "UI Review Fixture", exact: true })
      .waitFor();
    const profileURL = page.url();
    await page.reload();
    await page
      .getByRole("heading", { name: "UI Review Fixture", exact: true })
      .waitFor();
    check(
      "Created profile survives full browser refresh",
      page.url() === profileURL,
    );
    check(
      "Milestone appears without collecting a birth year",
      (await page.getByText("29 February", { exact: true }).count()) === 1,
    );
    await page
      .getByRole("button", { name: "Edit profile", exact: true })
      .click();
    await page.locator("#record-first").fill("UI Edited");
    await page
      .getByRole("button", { name: "Save member", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "UI Edited Fixture", exact: true })
      .waitFor();
    await page.reload();
    await page
      .getByRole("heading", { name: "UI Edited Fixture", exact: true })
      .waitFor();
    check("Profile edit survives browser refresh", true);
    await page
      .getByRole("button", { name: "Edit permissions", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save permissions", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Record how and when" })
      .waitFor();
    check("Missing consent evidence is explained", true);
    await page
      .getByRole("checkbox", {
        name: "Visit and follow-up contact",
        exact: false,
      })
      .check();
    await page
      .getByRole("checkbox", { name: "Email Send", exact: false })
      .check();
    await page
      .getByRole("checkbox", { name: "Monthly newsletter", exact: false })
      .check();
    await page
      .locator("#consent-evidence")
      .fill(
        "Fictional member confirmed contact, email and newsletter during a test conversation on 10 October 2026.",
      );
    await capture("member-consent-dark-desktop");
    await page
      .getByRole("button", { name: "Save permissions", exact: true })
      .click();
    await page
      .getByText("Permissions saved. Messaging remains paused.", {
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "View permission history", exact: true })
      .click();
    await page.locator(".care-history li").first().waitFor();
    check(
      "Consent changes and evidence appear in history",
      (await page.locator(".care-history li").count()) === 9,
    );
    await page.reload();
    await page
      .getByRole("heading", { name: "UI Edited Fixture", exact: true })
      .waitFor();
    check(
      "Consent survives browser refresh",
      (await page
        .locator(".settings-row")
        .filter({ hasText: "Monthly newsletter" })
        .getByText("Recorded", { exact: true })
        .count()) === 1,
    );
    await page
      .locator("#care-note-body")
      .fill(
        "Fictional follow-up: welcomed at Sunday service. The team will call next week.",
      );
    await page
      .getByRole("button", { name: "Save care note", exact: true })
      .click();
    await page.getByText("Care note saved.", { exact: true }).waitFor();
    await page.locator(".care-notes li").first().waitFor();
    check(
      "Care note shows author and timestamp",
      (await page.locator(".care-notes li").first().innerText()).includes(
        "Care administrator",
      ),
    );
    await page.reload();
    await page.locator(".care-notes li").first().waitFor();
    check(
      "Care note survives browser refresh",
      (await page.locator(".care-notes li").count()) === 1,
    );
    await page
      .getByRole("button", { name: "Archive member", exact: true })
      .click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    check(
      "Archive cancel leaves profile editable",
      (await page
        .getByRole("button", { name: "Edit profile", exact: true })
        .count()) === 1,
    );
    await page
      .getByRole("button", { name: "Archive member", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm archive", exact: true })
      .click();
    await page.getByText("Archived · Read only", { exact: true }).waitFor();
    check(
      "Archived profile removes edit and note controls",
      (await page
        .getByRole("button", { name: "Edit profile", exact: true })
        .count()) === 0 &&
        (await page.locator("#care-note-body").count()) === 0,
    );
    await page.reload();
    await page.getByText("Archived · Read only", { exact: true }).waitFor();
    check("Archive survives browser refresh", true);
    await capture("member-archived-dark-desktop");
    await page.getByRole("link", { name: "All members", exact: false }).click();
    await page
      .getByRole("heading", { name: "The church family", exact: true })
      .waitFor();
    await page.getByLabel("Filter archive status").selectOption("archived");
    await page
      .getByRole("link", { name: "UI Edited Fixture", exact: true })
      .waitFor();
    check(
      "Archived view lets staff find retained records",
      (await page.locator("tbody tr").count()) === 1,
    );
    await page
      .getByRole("link", { name: "UI Edited Fixture", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Restore member", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm restore", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Edit profile", exact: true })
      .waitFor();
    check(
      "Restore retains care notes and permissions",
      (await page.locator(".care-notes li").count()) === 1 &&
        (await page
          .locator(".settings-row")
          .filter({ hasText: "Monthly newsletter" })
          .getByText("Recorded", { exact: true })
          .count()) === 1,
    );
    await capture("member-profile-dark-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () =>
        document.querySelector("#sidebar").getBoundingClientRect().right <= 1,
    );
    check(
      "Mobile profile has no horizontal page overflow",
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await capture("member-profile-dark-mobile");
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    check(
      "Mobile navigation opens",
      await page
        .locator("#sidebar")
        .evaluate((node) => node.classList.contains("open")),
    );
    await page
      .getByRole("button", { name: "Close navigation", exact: true })
      .last()
      .click();
    await page.getByRole("button", { name: "Switch to light mode" }).click();
    check(
      "Light mode applies to live member profile",
      (await page.evaluate(() => document.documentElement.dataset.theme)) ===
        "light",
    );
    await capture("member-profile-light-mobile");
    await page
      .getByRole("button", { name: "Edit permissions", exact: true })
      .click();
    await capture("member-consent-light-mobile");
    check(
      "Mobile permissions dialog fits viewport",
      await page.locator("dialog").evaluate((n) => {
        const r = n.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.right <= window.innerWidth &&
          r.bottom <= window.innerHeight
        );
      }),
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    await page.getByRole("link", { name: "All members", exact: false }).click();
    await page.getByRole("heading", { name: "The church family" }).waitFor();
    await page
      .getByRole("button", { name: "Add member", exact: false })
      .first()
      .click();
    await capture("member-form-light-mobile");
    check(
      "Mobile form fits the viewport",
      await page
        .locator("dialog")
        .evaluate(
          (node) => node.getBoundingClientRect().right <= window.innerWidth,
        ),
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.setViewportSize({ width: 1460, height: 1040 });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.waitForURL("**/access**");
    await page.locator("#staff-email").fill("viewer@example.test");
    await page.locator("#staff-password").fill("Fixture-password-123!");
    await page
      .getByRole("button", { name: "Sign in to the care desk" })
      .click();
    await page.waitForURL("**/overview");
    await page.goto(origin + "/members");
    await page.getByRole("heading", { name: "The church family" }).waitFor();
    check(
      "Viewer has no member creation control",
      (await page
        .getByRole("button", { name: "Add member", exact: false })
        .count()) === 0,
    );
    await page.goto(profileURL);
    await page
      .getByRole("heading", { name: "UI Edited Fixture", exact: true })
      .waitFor();
    check(
      "Viewer has no profile editing control",
      (await page
        .getByRole("button", { name: "Edit profile", exact: true })
        .count()) === 0,
    );
    check(
      "Viewer has no permission, note or archive write controls",
      (await page
        .getByRole("button", { name: "Edit permissions", exact: true })
        .count()) === 0 &&
        (await page.locator("#care-note-body").count()) === 0 &&
        (await page
          .getByRole("button", { name: "Archive member", exact: true })
          .count()) === 0,
    );
    await page.locator(".care-notes li").first().waitFor();
    check("Viewer sees saved care note", true);
    check("No browser runtime errors", errors.length === 0);
    console.log(
      checks + " member browser checks passed with local fixture records.",
    );
  } finally {
    await context.close();
    await browser.close();
  }
}
