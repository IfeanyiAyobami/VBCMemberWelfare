const fs = require("fs"),
  assert = require("assert");
const { JSDOM, VirtualConsole } = require("jsdom");
const root = require("path").resolve(__dirname, ".."),
  errors = [];
const source = fs.readFileSync(root + "/preview.html", "utf8");
const scriptAt = source.lastIndexOf("<script>");
const html = source.slice(0, scriptAt) + "</body></html>";
const js = source.slice(scriptAt + 8, source.lastIndexOf("</script>"));
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => {
  if (!/navigation.*not implemented/i.test(e.message)) errors.push(e.message);
});
const dom = new JSDOM(html, {
  url: "https://review.example/#templates",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const w = dom.window,
  d = w.document;
w.scrollTo = () => {};
w.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
w.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
w.eval(js);
let count = 0;
const ok = (v, m) => {
    assert(v, m);
    count++;
  },
  q = (s) => {
    const e = d.querySelector(s);
    assert(e, "Missing " + s);
    return e;
  },
  click = (s) => q(s).click(),
  tick = () => new Promise((r) => setTimeout(r, 15)),
  route = async (s) => {
    w.history.pushState(null, "", "/" + s);
    w.dispatchEvent(new w.PopStateEvent("popstate"));
    await tick();
  },
  val = (s, v, event = "input") => {
    q(s).value = v;
    q(s).dispatchEvent(new w.Event(event, { bubbles: true }));
  },
  submit = (s) =>
    q(s).dispatchEvent(
      new w.Event("submit", { bubbles: true, cancelable: true }),
    ),
  preview = () => q(".rich-email").textContent;
(async () => {
  ok(q('.rich-email img[alt^="A white birthday cake"]'), "Birthday artwork");
  const birthdayImage = q(
    '.rich-email img[alt^="A white birthday cake"]',
  ).getAttribute("src");
  ok(
    preview().includes("Happy birthday,") && preview().includes("Tomi."),
    "Birthday personalisation",
  );
  const upload = q("#template-image-upload");
  Object.defineProperty(upload, "files", {
    configurable: true,
    value: [new w.File(["<svg/>"], "bad.svg", { type: "image/svg+xml" })],
  });
  upload.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok(
    q("#template-image-error").textContent.includes("JPEG, PNG or GIF"),
    "Unsafe upload type rejected",
  );
  Object.defineProperty(upload, "files", {
    configurable: true,
    value: [
      new w.File([new Uint8Array(1000001)], "large.png", { type: "image/png" }),
    ],
  });
  upload.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok(
    q("#template-image-error").textContent.includes("smaller than 1 MB"),
    "Large image rejected",
  );
  val("#template-headline", "Celebrating you, {{first_name}}.");
  val("#template-message", "Dear {{first_name}}, you are loved.");
  click('[data-action="email-device"][data-value="mobile"]');
  ok(q(".mail-viewport").classList.contains("is-mobile"), "Mobile preview");
  ok(preview().includes("Celebrating you, Tomi."), "Unsaved headline retained");
  ok(
    q("#template-message").value.includes("you are loved"),
    "Message retained across device change",
  );
  click('[data-action="email-images"]');
  ok(!d.querySelector(".rich-email img"), "Images blocked");
  ok(preview().includes("Image: A white birthday cake"), "Alt text visible");
  ok(
    preview().includes("Dear Tomi, you are loved"),
    "Message readable without graphics",
  );
  val("#template-image-url", "javascript:alert(1)");
  submit("#template-form");
  ok(
    q("#template-errors").textContent.includes("HTTPS image"),
    "Unsafe URL rejected",
  );
  ok(
    !d.querySelector('.rich-email img[src^="javascript"]'),
    "Unsafe URL not rendered",
  );
  val("#template-image-url", "https://images.example.org/birthday.jpg");
  ok(
    q(".rich-email .image-fallback").textContent.includes("birthday cake"),
    "Image URL does not hide alt text",
  );
  val("#template-alt", "");
  submit("#template-form");
  ok(
    q("#template-errors").textContent.includes("image description"),
    "Alt text required",
  );
  val("#template-alt", "A joyful birthday banner");
  val("#template-ctaUrl", "http://example.org");
  submit("#template-form");
  ok(
    q("#template-errors").textContent.includes("HTTPS link"),
    "Button validation",
  );
  val("#template-ctaUrl", "https://vinebranchchurch.org/");
  val("#template-headline", "Hello {{unknown}}");
  submit("#template-form");
  ok(
    q("#template-errors").textContent.includes("supported"),
    "Headline tokens validated",
  );
  val("#template-headline", "Hello {{first_name}}");
  submit("#template-form");
  click('[data-action="email-images"]');
  ok(
    q('.rich-email img[src="https://images.example.org/birthday.jpg"]'),
    "Custom URL preview",
  );
  click('[data-action="email-image-remove"][data-prefix="template"]');
  ok(!d.querySelector('.rich-email img[src*="birthday"]'), "Remove artwork");
  click('[data-action="email-image-reset"][data-prefix="template"]');
  ok(
    [...d.querySelectorAll(".rich-email img")].some(
      (img) => img.getAttribute("src") === birthdayImage,
    ),
    "Restore artwork",
  );
  click('[data-action="email-full"]');
  ok(q("#modal").open && q(".full-email-preview"), "Full preview");
  ok(
    q("#modal").textContent.includes("Hello Tomi"),
    "Full preview uses current content",
  );
  click('[data-action="close"]');
  val("#template-message", "<img src=x onerror=alert(1)> {{first_name}}");
  ok(!d.querySelector("#template-preview-body img"), "User markup escaped");
  ok(
    q("#template-preview-body").textContent.includes("<img src=x"),
    "Markup remains plain text",
  );
  click('[data-action="choose-email-template"][data-id="t2"]');
  ok(q('.rich-email img[alt^="Ivory roses"]'), "Anniversary artwork");
  ok(preview().includes("A beautiful love."), "Anniversary headline");
  click('[data-action="template-channel"][data-value="sms"]');
  ok(!d.querySelector("[data-email-upload]"), "SMS has no image upload");
  ok(!d.querySelector(".rich-email"), "SMS stays text-only");
  click('[data-action="template-channel"][data-value="email"]');
  click('[data-action="choose-email-template"][data-id="t3"]');
  ok(q('.rich-email img[alt^="Concept artwork"]'), "Programme artwork");
  ok(
    preview().includes("18 Oct 2026") &&
      preview().includes("09:00 WAT") &&
      preview().includes("Vine Branch Church, Ibadan"),
    "Programme details live text",
  );
  await route("newsletters");
  ok(
    d.querySelectorAll(".rich-email .mail-story-image").length === 2,
    "Illustrated newsletter sections",
  );
  ok(
    preview().includes("An Evening of Worship") &&
      preview().includes("New Members Welcome"),
    "Newsletter schedule",
  );
  val("#newsletter-story-0-title", "Walk in hope.");
  val(
    "#newsletter-story-0-body",
    "A word of encouragement for {{first_name}}.",
  );
  ok(
    preview().includes("Walk in hope.") &&
      preview().includes("encouragement for Tomi"),
    "Live section editor",
  );
  click('input[data-newsletter-event][value="e2"]');
  ok(
    !preview().includes("An Evening of Worship"),
    "Remove programme from newsletter",
  );
  const oldId = q("#newsletter-form").dataset.id;
  click('[data-action="new-newsletter"]');
  val("#newsletter-story-0-title", "A fresh edition.");
  click('[data-action="open-newsletter"][data-id="' + oldId + '"]');
  ok(
    q("#newsletter-story-0-title").value === "Walk in hope.",
    "Independent issue sections",
  );
  val("#newsletter-preheader", "Hi {{unsupported}}");
  submit("#newsletter-form");
  ok(
    q("#newsletter-errors").textContent.includes("personalisation"),
    "Newsletter design tokens validated",
  );
  val("#newsletter-preheader", "Your church family update.");
  val("#newsletter-story-0-url", "javascript:alert(1)");
  submit("#newsletter-form");
  ok(
    q("#newsletter-errors").textContent.includes("HTTPS link"),
    "Section link rejected",
  );
  val("#newsletter-story-0-url", "https://vinebranchchurch.org/");
  click('[data-action="email-images"]');
  ok(!d.querySelector(".rich-email img"), "All newsletter images blocked");
  ok(
    preview().includes("Family & Friends Sunday") &&
      preview().includes("Walk in hope."),
    "Schedule and story survive image blocking",
  );
  click('[data-action="email-images"]');
  await route("compose");
  val("#campaign-name", "Graphic invitation");
  submit("#campaign-form");
  submit("#campaign-form");
  val("#campaign-headline", "Gather with us, {{first_name}}.");
  ok(
    preview().includes("Gather with us, Tomi."),
    "Campaign live graphic preview",
  );
  submit("#campaign-form");
  ok(
    preview().includes("Gather with us, Tomi."),
    "Artwork retained into schedule review",
  );
  for (const name of fs
    .readdirSync(root + "/public/assets")
    .filter((name) => name.endsWith(".jpg")))
    ok(
      fs.statSync(root + "/public/assets/" + name).size < 1000000,
      "Web-sized " + name,
    );
  ok(errors.length === 0, "No runtime errors: " + errors.join("\n"));
  console.log(
    JSON.stringify({
      assertions: count,
      runtimeErrors: errors,
      imageValidation: true,
      emailOnlyGraphics: true,
      newsletterSections: true,
      imagesOff: true,
      providerCalls: 0,
    }),
  );
  w.close();
})().catch((e) => {
  console.error(e.stack);
  w.close();
  process.exit(1);
});
