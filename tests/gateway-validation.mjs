import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateGateway,
  canonicalGateway,
  GATEWAY_LIMITS,
} from "../src/lib/guests/gateway.ts";
import {
  validGatewayToken,
  gatewayTokenConfigured,
} from "../src/lib/guests/gateway-auth.ts";
const p = JSON.parse(
  await readFile("tests/fixtures/wordpress-gateway.json", "utf8"),
);
let checks = 0;
const check = (ok, label) => {
  assert(ok, label);
  checks++;
};
let v = validateGateway(p, p.submission_id);
check(
  v.ok && Object.keys(GATEWAY_LIMITS).length === 24,
  "Exact Gateway payload accepted",
);
check(
  v.guest.phone === "+2348015550123" && v.guest.contact_consent,
  "Existing contact normalization and consent mapping",
);
check(
  [
    "email_opt_in",
    "sms_opt_in",
    "celebrations_opt_in",
    "programmes_opt_in",
    "newsletters_opt_in",
  ].every((k) => v.guest[k] === ["email_opt_in", "sms_opt_in"].includes(k)),
  "Gateway retains existing email/SMS defaults and optional category opt-outs",
);
check(
  v.guest.birthday_month === null && v.guest.anniversary_day === null,
  "No invented milestones",
);
const empty = {
  ...p,
  email: "",
  gender: "",
  age_range: "",
  marital_status: "",
  address: "",
  residential_address: "",
  salvation_response: "",
  born_again: "",
  home_visitation: "",
  home_visit: "",
  discovery_source: "",
  discovery_details: "",
  heard_about: "",
};
const withoutEmail = validateGateway(empty, p.submission_id);
check(withoutEmail.ok && withoutEmail.guest.email_opt_in === false,
  "Optional email accepted without enabling an absent email channel");
for (const patch of [
  { submission_id: "bad" },
  { contact_consent: true },
  { contact_consent: "No" },
  { email: null },
  { address: "Different" },
  { salvation_response: "No" },
  { home_visitation: "Yes" },
  { full_name: "Different" },
  { heard_about: "Different" },
  { date_submitted: "2026-02-30 12:00:00" },
  { date_submitted: "2026-10-10T09:05:00Z" },
  { date_submitted: "2026-10-10 24:00:00" },
  { visit_date: "2026-02-30" },
  { phone: "abc" },
  { email: "not-email" },
  { surname: "a".repeat(101) },
  { occupation: [] },
  { gender: "Unsupported" },
  { source: "manual" },
  { email_opt_in: true },
  { surname: "Bad\nName" },
])
  check(
    !validateGateway({ ...p, ...patch }, p.submission_id).ok,
    "Reject invalid " + Object.keys(patch)[0],
  );
for (const key of Object.keys(p)) {
  const missing = { ...p };
  delete missing[key];
  check(
    !validateGateway(missing, p.submission_id).ok,
    "Required contract key " + key,
  );
}
check(
  !validateGateway(p, null).ok && !validateGateway(p, "b".repeat(36)).ok,
  "Header is mandatory cross-check",
);
check(
  canonicalGateway(p) ===
    canonicalGateway(Object.fromEntries(Object.entries(p).reverse())),
  "Hash independent of JSON field order",
);
check(
  canonicalGateway(p) !==
    canonicalGateway({ ...p, date_submitted: "2026-10-10 09:05:01" }),
  "Original submission time included in fingerprint",
);
const token = "b".repeat(64);
check(
  gatewayTokenConfigured(token) && validGatewayToken("Bearer " + token, token),
  "Constant-time comparison accepts matching bearer",
);
check(
  !validGatewayToken("Bearer " + "c".repeat(64), token) &&
    !validGatewayToken(null, token) &&
    !validGatewayToken("Basic " + token, token),
  "Wrong/missing auth denied",
);
check(
  !gatewayTokenConfigured("short") && !gatewayTokenConfigured("a b".repeat(40)),
  "Unsafe token configuration rejected",
);
console.log(checks + " Gateway contract validation checks passed.");
