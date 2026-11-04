import assert from "node:assert/strict";
import { setJourneyFriendOnly, journeyFixture } from "./journey-browser.mjs";

export async function runFriendModeBrowser(page, origin) {
  const errors = [];
  const listener = (e) => errors.push(e.message);
  page.on("pageerror", listener);
  setJourneyFriendOnly(true);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + "/followups");
    await page.getByRole("heading", { name: "TODAY", exact: true }).waitFor();
    await page.getByRole("button", { name: "My people", exact: true }).click();
    await page
      .getByRole("heading", { name: "MY PEOPLE", exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Import CSV" }).count(),
      0,
      "Friend mode hides bulk import",
    );

    // Pick someone the Friend may contact.
    const card = page
      .locator(".fm-card")
      .filter({ has: page.getByRole("link", { name: "Call", exact: true }) })
      .first();
    await card.waitFor();
    const name = (await card.locator("strong").first().innerText()).trim();
    const first = name.split(/\s+/)[0];
    assert(
      (
        await card
          .getByRole("link", { name: "Call", exact: true })
          .getAttribute("href")
      ).startsWith("tel:"),
      "Call opens the phone dialler",
    );

    // Conversation in three choices.
    await card.locator(".fm-card-open").click();
    await page.getByRole("heading", { name, exact: true }).waitFor();
    await page.getByRole("button", { name: /We talked in person/ }).click();
    await page
      .getByRole("heading", { name: `How did it go with ${first}?` })
      .waitFor();
    await page.getByRole("button", { name: /Yes, we spoke/ }).click();
    await page
      .getByRole("heading", { name: `Is ${first} coming to church?` })
      .waitFor();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "coming to church" })
      .waitFor();
    await page.getByRole("radio", { name: "Tuesday", exact: true }).click();
    await page.getByRole("radio", { name: "Next week", exact: true }).click();
    await page
      .getByLabel(/Anything to remember/)
      .fill("Friend mode fixture note");
    const before = journeyFixture.contacts.length;
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("heading", { name: /^Saved\. Thank you/ }).waitFor();
    assert.equal(journeyFixture.contacts.length, before + 1);
    const saved = journeyFixture.contacts[0];
    assert.equal(saved.outcome, "promised_return");
    assert.equal(saved.method, "in_person");
    assert(
      saved.note.includes("Plans to come on Tuesday") &&
        saved.note.includes("Friend mode fixture note"),
    );
    console.log(
      "PASS Friend mode conversation: three choices, Tuesday midweek, plain-language save",
    );

    // Offline: the save is kept on the phone, survives a reload, then sends.
    await page.getByRole("button", { name: "Back to my people" }).click();
    await page
      .getByRole("heading", { name: "MY PEOPLE", exact: true })
      .waitFor();
    await page
      .locator(".fm-card-open")
      .filter({ hasText: name })
      .first()
      .click();
    await page
      .getByRole("button", { name: new RegExp(`${first} came to church`) })
      .click();
    await page
      .getByRole("heading", { name: `Which service did ${first} come to?` })
      .waitFor();
    await page.getByRole("radio").first().click();
    const block = (route) =>
      route.request().method() === "POST"
        ? route.abort("internetdisconnected")
        : route.continue();
    await page.route("**/api/journey", block);
    const eventsBefore = journeyFixture.events.length;
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("heading", { name: "Kept safe on this phone." })
      .waitFor();
    const stored = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith("vbc-friend-outbox:"))
        .map((k) => JSON.parse(localStorage.getItem(k)).length),
    );
    assert.deepEqual(stored, [1], "The update is stored on the phone");
    await page.reload();
    await page.getByRole("heading", { name: "TODAY", exact: true }).waitFor();
    await page
      .getByText("1 update is waiting to send.", { exact: false })
      .waitFor();
    assert.equal(
      journeyFixture.events.length,
      eventsBefore,
      "Nothing reached the server while offline",
    );
    await page.unroute("**/api/journey", block);
    // The app may already be retrying on its own; pressing Send now is optional.
    await page
      .getByRole("button", { name: "Send now", exact: true })
      .click({ timeout: 3000 })
      .catch(() => {});
    await page
      .getByText("waiting to send", { exact: false })
      .first()
      .waitFor({ state: "hidden" });
    const sent = journeyFixture.events[0];
    assert.equal(sent.action, "attendance");
    assert.equal(sent.detail.verification, "independently_confirmed");
    assert.equal(sent.detail.source, "church_staff");
    assert.equal(
      await page.evaluate(
        () =>
          Object.keys(localStorage).filter((k) =>
            k.startsWith("vbc-friend-outbox:"),
          ).length,
      ),
      0,
      "Sent updates are removed from the phone",
    );
    console.log(
      "PASS Friend mode offline outbox: kept on phone, survives reload, sends once, then clears",
    );

    // Done today and switching views.
    await page
      .getByRole("button", { name: "Done today", exact: true })
      .click();
    await page.getByText("Came to church", { exact: false }).first().waitFor();
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByRole("button", { name: "Switch to full view" }).click();
    await page
      .getByRole("button", { name: "Friend mode", exact: true })
      .click();
    await page.getByRole("heading", { name: "TODAY", exact: true }).waitFor();
    await page.evaluate(() => localStorage.removeItem("vbc-friend-mode"));
    assert.deepEqual(errors, []);
    console.log(
      "PASS Friend mode for Friend-only accounts, full-view switch and Done today list",
    );
  } finally {
    setJourneyFriendOnly(false);
    page.off("pageerror", listener);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
}
