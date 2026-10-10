import nextEnv from "@next/env";
import { readFile, access } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), process.argv.includes("--dev"));

const token = process.env.VBC_MEMBER_CARE_GATEWAY_TOKEN;

let url;
try {
  url = new URL(process.argv[2]);
} catch {
  throw new Error(
    "Supply the Member Care ingestion URL as the first argument."
  );
}

const localHTTP =
  url.protocol === "http:" &&
  ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

if (
  (url.protocol !== "https:" && !localHTTP) ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  url.pathname !== "/api/integrations/wordpress/first-timers"
) {
  throw new Error(
    "Use the exact HTTPS or localhost ingestion URL without a trailing slash."
  );
}

if (!token || !/^[\x21-\x7e]{32,256}$/.test(token)) {
  throw new Error(
    "Set VBC_MEMBER_CARE_GATEWAY_TOKEN in .env.local first."
  );
}

try {
  await access(
    "src/app/api/integrations/wordpress/first-timers/route.ts"
  );
  await access("tests/fixtures/wordpress-gateway.json");
} catch {
  throw new Error(
    "Gateway files are missing. Run from the v0.6.1 project folder containing the integration files."
  );
}

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

const payload = {
  ...JSON.parse(
    await readFile("tests/fixtures/wordpress-gateway.json", "utf8")
  ),
  submission_id: randomUUID(),
  date_submitted: stamp,
  visit_date: stamp.slice(0, 10),
};

async function send(body, auth = token) {
  const response = await fetch(url, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(18000),
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + auth,
      "Idempotency-Key": payload.submission_id,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

function requireResult(ok, label, result) {
  if (!ok) {
    throw new Error(
      `${label} failed (HTTP ${result.status}). Check the receiver configuration and server terminal.`
    );
  }
  console.log("PASS: " + label);
}

console.log(
  "This test creates one fictional pending guest. Reject it after checking."
);
console.log("Submission ID: " + payload.submission_id);

let result = await send(payload, "x".repeat(64));
requireResult(
  result.status === 401,
  "Incorrect bearer denied",
  result
);

result = await send(payload);
requireResult(
  result.status === 201 &&
    result.data?.success === true &&
    result.data?.duplicate === false,
  "New guest acknowledged",
  result
);

const id = result.data.id;
console.log("Guest record ID: " + id);

result = await send(payload);
requireResult(
  result.status === 200 &&
    result.data?.success === true &&
    result.data?.duplicate === true &&
    result.data?.id === id,
  "Identical retry acknowledged",
  result
);

result = await send({
  ...payload,
  occupation: "Changed fictional test",
});
requireResult(
  result.status === 409 && result.data?.success === false,
  "Changed content rejected",
  result
);

const simultaneous = await Promise.all(
  Array.from({ length: 12 }, () => send(payload))
);

for (const result of simultaneous) {
  requireResult(
    result.status === 200 &&
      result.data?.success === true &&
      result.data?.duplicate === true &&
      result.data?.id === id,
    "Concurrent retry returns original ID",
    result
  );
}

console.log(
  "Complete. Confirm one matching guest card, then reject the fictional guest."
);