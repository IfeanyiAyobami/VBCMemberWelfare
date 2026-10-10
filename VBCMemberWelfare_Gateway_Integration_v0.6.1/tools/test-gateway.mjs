// Explicit operator test against the supplied HTTPS endpoint. Creates one
// fictional pending guest; never sends email/SMS or prints credentials/answers.
import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
loadEnvConfig(process.cwd());
const token = process.env.VBC_MEMBER_CARE_GATEWAY_TOKEN;
let url;
try {
  url = new URL(process.argv[2]);
} catch {
  throw new Error(
    "Run: node tools/test-gateway.mjs https://YOUR-MEMBER-CARE-HOST/api/integrations/wordpress/first-timers",
  );
}
if (
  url.protocol !== "https:" ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  url.pathname !== "/api/integrations/wordpress/first-timers"
)
  throw new Error(
    "Supply the exact HTTPS Member Care ingestion URL, without credentials, query string or trailing slash.",
  );
if (!token || !/^[\x21-\x7e]{32,256}$/.test(token))
  throw new Error(
    "Set the server-only VBC_MEMBER_CARE_GATEWAY_TOKEN in .env.local first.",
  );
const stamp = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
}).format(new Date());
const p = {
  ...JSON.parse(
    await readFile(
      new URL("../tests/fixtures/wordpress-gateway.json", import.meta.url),
      "utf8",
    ),
  ),
  submission_id: randomUUID(),
  date_submitted: stamp,
  visit_date: stamp.slice(0, 10),
};
async function send(body, auth = token) {
  const r = await fetch(url, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(18000),
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + auth,
      "Idempotency-Key": p.submission_id,
    },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => null);
  return { status: r.status, data: d };
}
function requireResult(ok, label, r) {
  if (!ok)
    throw new Error(
      label +
        " failed (HTTP " +
        r.status +
        "). Check the receiver configuration and hosting logs; no payload or secret was printed.",
    );
  console.log("PASS: " + label);
}
console.log(
  "This test creates one fictional pending guest. Reject it in Guest submissions after checking.",
);
console.log("Submission ID: " + p.submission_id);
let r = await send(p, "x".repeat(64));
requireResult(r.status === 401, "Incorrect bearer denied", r);
r = await send(p);
requireResult(
  r.status === 201 && r.data?.success === true && r.data?.duplicate === false,
  "New guest acknowledged",
  r,
);
const id = r.data.id;
console.log("Guest record ID: " + id);
r = await send(p);
requireResult(
  r.status === 200 &&
    r.data?.success === true &&
    r.data?.duplicate === true &&
    r.data?.id === id,
  "Identical retry acknowledged",
  r,
);
r = await send({ ...p, occupation: "Changed fictional test" });
requireResult(
  r.status === 409 && r.data?.success === false,
  "Changed content rejected",
  r,
);
const simultaneous = await Promise.all(
  Array.from({ length: 12 }, () => send(p)),
);
for (const r of simultaneous)
  requireResult(
    r.status === 200 &&
      r.data?.success === true &&
      r.data?.duplicate === true &&
      r.data?.id === id,
    "Concurrent retry returns original ID",
    r,
  );
console.log(
  "Complete. Confirm exactly one row for this submission ID in Supabase, then reject the fictional guest.",
);
