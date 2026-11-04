import assert from "node:assert/strict";
import {
  generatePin,
  validPin,
  hashPin,
  checkPin,
} from "../src/lib/journey/pin.ts";
const secret = "a".repeat(64);
for (let i = 0; i < 100; i++) assert(validPin(generatePin()));
assert(validPin("0004"));
assert(!validPin("123"));
assert(!validPin("12345"));
assert(!validPin(1234));
assert(!validPin("1e03"));
const h = await hashPin("0004", secret);
assert(await checkPin("0004", h, secret));
assert(!(await checkPin("0005", h, secret)));
assert(!(await checkPin("0004", h, "b".repeat(64))));
assert.match(h, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
assert.notEqual(h, await hashPin("0004", secret));
console.log(
  "PASS four-digit generation including leading zeros, salted/peppered hashing and incorrect PIN/secret rejection",
);
