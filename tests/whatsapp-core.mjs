import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  apiConfig,
  signatureOK,
  templatePayload,
  approvedTemplate,
  webhookEvents,
} from "../src/lib/whatsapp/core.ts";
const cfg = {
  WHATSAPP_API_ENABLED: "true",
  WHATSAPP_GRAPH_VERSION: "v25.0",
  WHATSAPP_PHONE_NUMBER_ID: "111",
  WHATSAPP_BUSINESS_ACCOUNT_ID: "222",
  WHATSAPP_ACCESS_TOKEN: "test",
  WHATSAPP_APP_SECRET: "fixture-secret-long",
  WHATSAPP_VERIFY_TOKEN: "fixture-verify-long",
  APP_ORIGIN: "https://care.example.test",
};
assert(apiConfig(cfg).ready);
assert(!apiConfig({ ...cfg, WHATSAPP_API_ENABLED: "false" }).ready);
assert(!apiConfig({ ...cfg, APP_ORIGIN: "http://localhost" }).ready);
assert(!apiConfig({ ...cfg, WHATSAPP_ACCESS_TOKEN: "" }).ready);
const job = {
  id: "fixture-id",
  recipient: "+2348015550999",
  name: "Fictional Ada",
  body: "Hello Fictional Ada",
  template: "vbc_sunday",
  language: "en",
  templateBody: "Hello {{1}}",
  flyer: "/whatsapp/sunday-invitation.jpg",
};
const payload = templatePayload(job, "https://care.example.test");
assert.equal(payload.template.components[0].type, "header");
assert.equal(
  payload.template.components[0].parameters[0].image.link,
  "https://care.example.test/whatsapp/sunday-invitation.jpg",
);
assert.equal(
  payload.template.components[1].parameters[0].text,
  "Fictional Ada",
);
assert.equal(payload.to, "2348015550999");
assert.equal(payload.biz_opaque_callback_data, "fixture-id");
assert.throws(() => templatePayload({ ...job, flyer: "http://127.0.0.1" }, ""));
const template = {
  name: "vbc_sunday",
  language: "en",
  status: "APPROVED",
  components: [
    { type: "HEADER", format: "IMAGE" },
    { type: "BODY", text: "Hello {{1}}" },
  ],
};
assert(approvedTemplate({ data: [template] }, job));
for (const t of [
  { ...template, status: "REJECTED" },
  { ...template, language: "en_US" },
  { ...template, parameter_format: "NAMED" },
  { ...template, components: [{ type: "BODY", text: "Changed body" }] },
])
  assert(!approvedTemplate({ data: [t] }, job));
const raw = Buffer.from('{"event":"fixture"}'),
  sig = "sha256=" + createHmac("sha256", "secret").update(raw).digest("hex");
assert(signatureOK(raw, sig, "secret"));
assert(!signatureOK(Buffer.from("tampered"), sig, "secret"));
assert(!signatureOK(raw, "sha256=bad", "secret"));
assert(!signatureOK(raw, null, "secret"));
const event = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "222",
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "111" },
            statuses: [
              {
                id: "wamid.test",
                recipient_id: "2348015550999",
                timestamp: "1793448000",
                status: "delivered",
                biz_opaque_callback_data: "fixture-id",
              },
            ],
            messages: [
              {
                id: "reply-1",
                from: "2348015550999",
                timestamp: "1793448000",
                type: "text",
                text: { body: "STOP" },
              },
            ],
          },
        },
      ],
    },
  ],
};
assert.equal(
  webhookEvents(event, "111", "222").statuses[0].callback,
  "fixture-id",
);
assert.equal(webhookEvents(event, "111", "222").replies[0].body, "STOP");
assert.equal(webhookEvents(event, "wrong", "222").statuses.length, 0);
assert.equal(webhookEvents(event, "111", "wrong").replies.length, 0);
console.log(
  "PASS WhatsApp configuration gating, flyer-first payload, template approval/body matching, signatures and webhook account isolation",
);
const { deliverWithMeta } = await import("../src/lib/whatsapp/core.ts");
for (const scenario of [
  "accepted",
  "timeout",
  "provider500",
  "missingId",
  "rejected",
  "unapproved",
  "revoked",
]) {
  let calls = 0,
    posts = 0;
  const transport = async (url, opts) => {
    calls++;
    if (opts?.method === "POST") {
      posts++;
      if (scenario === "timeout") throw Error("Network timeout");
      return Response.json(
        scenario === "missingId"
          ? {}
          : scenario === "accepted"
            ? { messages: [{ id: "wamid.accepted" }] }
            : { error: { code: scenario === "rejected" ? 131047 : 500 } },
        {
          status:
            scenario === "provider500"
              ? 500
              : scenario === "rejected"
                ? 400
                : 200,
        },
      );
    }
    return Response.json({
      data: [
        scenario === "unapproved"
          ? { ...template, status: "PAUSED" }
          : template,
      ],
    });
  };
  const result = await deliverWithMeta(
    job,
    apiConfig(cfg),
    transport,
    async () => scenario !== "revoked",
  );
  assert.equal(posts, ["unapproved", "revoked"].includes(scenario) ? 0 : 1);
  assert.equal(
    result.state,
    scenario === "accepted"
      ? "accepted"
      : ["timeout", "provider500", "missingId"].includes(scenario)
        ? "unknown"
        : "failed",
  );
}
console.log(
  "PASS no provider POST on approval/permission failure; accepted, rejected and uncertain sends classified without retries",
);
