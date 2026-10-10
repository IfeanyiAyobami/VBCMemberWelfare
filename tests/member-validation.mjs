import assert from "node:assert/strict";
import {
  validateMemberDraft,
  normalizeMemberPhone,
  validMilestone,
  memberColumns,
  isMemberId,
} from "../src/lib/members/model.ts";
let count = 0;
function check(label, run) {
  run();
  count++;
  console.log("PASS " + label);
}
const input = {
  first: "  Test Person  ",
  last: "  Directory  ",
  email: "  PERSON@EXAMPLE.TEST  ",
  phone: "0803 123 4567",
  status: "visitor",
  occupation: "",
  address: "",
  birthday: "02-29",
  anniversary: "10-09",
  joined: "2026-10-09",
};
const validation = (value) => validateMemberDraft(value, "2026-10-09");
check("Names, email case and Nigerian contact normalize", () => {
  const result = validation(input);
  assert(result.ok);
  assert.equal(result.value.first, "Test Person");
  assert.equal(result.value.email, "person@example.test");
  assert.equal(result.value.phone, "+2348031234567");
});
for (const [phone, expected] of [
  ["+44 7700 900123", "+447700900123"],
  ["00234 803 123 4567", "+2348031234567"],
  ["2348031234567", "+2348031234567"],
  ["8031234567", "+2348031234567"],
  ["", ""],
  ["call 08031234567", null],
  ["++2348031234567", null],
  ["+0123456789", null],
  ["12345", null],
])
  check("Phone format: " + phone, () =>
    assert.equal(normalizeMemberPhone(phone), expected),
  );
for (const [date, expected] of [
  ["02-29", true],
  ["04-30", true],
  ["04-31", false],
  ["02-30", false],
  ["13-01", false],
  ["00-01", false],
  ["10-00", false],
  ["", true],
  ["2026-10-09", false],
])
  check("Milestone: " + (date || "optional"), () =>
    assert.equal(validMilestone(date), expected),
  );
for (const [label, patch, field] of [
  ["Missing given names", { first: "" }, "first"],
  ["Missing surname", { last: "" }, "last"],
  ["Missing contacts", { email: "", phone: "" }, "email"],
  ["Invalid email", { email: "not-email" }, "email"],
  ["Unknown status", { status: "administrator" }, "status"],
  ["Impossible visit date", { joined: "2026-02-30" }, "joined"],
  ["Future visit date", { joined: "2026-10-10" }, "joined"],
  ["Oversized surname", { last: "x".repeat(101) }, "last"],
  ["Oversized address", { address: "x".repeat(601) }, "address"],
  ["Control character in name", { first: "Person\u0000" }, "first"],
])
  check(label, () => {
    const result = validation({ ...input, ...patch });
    assert(!result.ok);
    assert(result.errors[field]);
  });
check("Optional data writes as null and milestones have no year", () => {
  const result = validation({ ...input, birthday: "", phone: "" });
  assert(result.ok);
  const db = memberColumns(result.value);
  assert.equal(db.phone, null);
  assert.equal(db.birthday_month, null);
  assert.equal(db.birthday_day, null);
  assert.equal(db.anniversary_month, 10);
  assert.equal(db.anniversary_day, 9);
  assert(!Object.hasOwn(db, "email_opt_in"));
  assert(!Object.hasOwn(db, "archived_at"));
});
check("Invalid payload types fail validation", () => {
  for (const value of [null, [], "text", {}]) assert(!validation(value).ok);
});
check("Malformed status types return field errors without throwing", () => {
  for (const status of [null, [], { toString: 1 }, true]) {
    const result = validation({ ...input, status });
    assert(!result.ok);
    assert(result.errors.status);
  }
});
check(
  "Database UUID routes exclude prototype and malformed identifiers",
  () => {
    assert(isMemberId("77777777-7777-4777-8777-777777777777"));
    assert(!isMemberId("m1"));
    assert(!isMemberId("77777777-7777-4777-8777-777777777777,role.eq.admin"));
  },
);
console.log(count + " member validation checks passed.");
