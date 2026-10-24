import assert from "node:assert/strict";
import { nextMembershipSunday } from "../src/lib/journey/model.ts";
for (const [input, expected] of [
  ["2026-10-24T12:00:00Z", "2026-10-25"],
  ["2026-10-25T12:00:00Z", "2026-10-25"],
  ["2026-10-26T12:00:00Z", "2026-11-29"],
  ["2026-12-31T12:00:00Z", "2027-01-31"],
  ["2026-10-25T23:30:00Z", "2026-11-29"],
])
  assert.equal(nextMembershipSunday(new Date(input)), expected);
console.log(
  "PASS Lagos Membership Sunday boundaries, same-day inclusion and year rollover",
);
