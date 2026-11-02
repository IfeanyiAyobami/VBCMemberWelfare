import assert from "node:assert/strict";
import { readIntakeCSV, intakeError } from "../src/lib/journey/intake.ts";
const r = readIntakeCSV(
  '\uFEFFfirst,last,phone,email,contact_consent,note\r\n"Ada, Fictional",Example,08015550998,,false,"Church desk, Sunday"\r\nBayo,Example,,bayo@example.invalid,true,"New\nrecord"',
);
assert.equal(r.length, 2);
assert.equal(r[0].data.first, "Ada, Fictional");
assert.equal(r[0].data.contactConsent, false);
assert.equal(r[0].error, "");
assert.equal(r[1].error, "");
assert.equal(
  readIntakeCSV("first,last,phone\nAda,Example,08015550998")[0].data.smsOptIn,
  true,
);
assert.match(
  readIntakeCSV(
    "first,last,phone\nAda,Example,08015550998\nBayo,Example,+2348015550998",
  )[1].error,
  /Duplicate/,
);
assert.match(
  readIntakeCSV("first,last,phone\nAda,Example,Nil")[0].error,
  /mobile/,
);
assert.throws(
  () =>
    readIntakeCSV(
      "first,last,phone,assigned_to\nAda,Example,08015550998,other",
    ),
  /template/,
);
assert.throws(
  () => readIntakeCSV('first,last,phone\n"Ada,Example,08015550998'),
  /closed/,
);
assert.throws(
  () => readIntakeCSV("first,other_names,last\nAda,Ada,Example"),
  /duplicate/,
);
assert.match(
  intakeError({
    first: "Ada",
    last: "Example",
    email: "bad",
    note: "Source desk",
  }),
  /email/,
);
console.log(
  "PASS CSV quoting, BOM, explicit opt-outs, defaults, duplicates, prohibited fields and malformed input",
);
