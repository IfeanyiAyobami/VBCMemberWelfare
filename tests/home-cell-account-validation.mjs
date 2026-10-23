import assert from "node:assert/strict";
import { findAccountByEmail } from "../src/lib/home-cell/accounts.ts";
import { displayDate, parseDisplayDate } from "../src/lib/home-cell/dates.ts";
let checks = 0;
const test = (value, label) => {
  assert(value, label);
  console.log("PASS", label);
  checks++;
};
const fake = (fn) => ({ auth: { admin: { listUsers: fn } } });
const user = { id: "existing-user-id", email: "Existing@Example.test" };
const db = fake(async () => ({
  data: { users: [user, { id: "different", email: "existing2@example.test" }] },
  error: null,
}));
test(
  (await findAccountByEmail(db, " EXISTING@example.test ")).id === user.id,
  "Exact normalized email resolves the original account",
);
test(
  (await findAccountByEmail(db, "exist@example.test")) === null,
  "Partial email cannot select a different person",
);
let pages = [];
const paged = fake(async ({ page, perPage }) => {
  pages.push(page);
  assert.equal(perPage, 200);
  return {
    data: {
      users:
        page === 1
          ? Array.from({ length: 200 }, (_, i) => ({
              id: String(i),
              email: `person${i}@example.test`,
            }))
          : [user],
    },
    error: null,
  };
});
test(
  (await findAccountByEmail(paged, user.email)).id === user.id &&
    pages.join(",") === "1,2",
  "Existing accounts beyond the first page are found",
);
await assert.rejects(
  findAccountByEmail(
    fake(async () => ({ data: { users: [] }, error: { message: "outage" } })),
    user.email,
  ),
  /ACCOUNT_LOOKUP_UNAVAILABLE/,
);
test(true, "Account lookup outages fail closed");
test(
  displayDate("2026-10-22") === "22/10/2026",
  "Date display explicitly includes day, month and full year",
);
test(
  parseDisplayDate("22/10/2026") === "2026-10-22",
  "Display date converts to database ISO format",
);
test(
  parseDisplayDate("29/02/2024") === "2024-02-29",
  "Leap day accepted in leap year",
);
for (const value of [
  "29/02/2026",
  "31/04/2026",
  "01/01/2",
  "2026-10-22",
  "22/13/2026",
  "00/10/2026",
])
  test(
    parseDisplayDate(value) === null,
    "Invalid/incomplete date rejected: " + value,
  );
console.log(JSON.stringify({ checks, passed: true }));

const {normalizeLoginPhone,loginIdentity}=await import('../src/lib/home-cell/identity.ts');
assert.equal(normalizeLoginPhone('0803 123 4567'),'+2348031234567');
assert.equal(normalizeLoginPhone('+234 803 123 4567'),'+2348031234567');
assert.equal(normalizeLoginPhone('2348031234567'),'+2348031234567');
assert.equal(normalizeLoginPhone('0806398088'),null);
assert.equal(normalizeLoginPhone('080703982630'),null);
assert.deepEqual(loginIdentity(' LEADER@EXAMPLE.COM '),{email:'leader@example.com'});
assert.deepEqual(loginIdentity('08031234567'),{phone:'+2348031234567'});
assert.equal(loginIdentity('not an account'),null);
const {findAccountByIdentity}=await import('../src/lib/home-cell/accounts.ts');
const identityDb={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})}),auth:{admin:{listUsers:async()=>({data:{users:[{id:'a',email:'a@example.com',phone:'2348031234567'},{id:'b',email:'b@example.com'}]},error:null})}}};
assert.equal((await findAccountByIdentity(identityDb,{phone:'+2348031234567'})).id,'a');
await assert.rejects(findAccountByIdentity(identityDb,{email:'b@example.com',phone:'+2348031234567'}),/different accounts/);
assert.equal(await findAccountByIdentity(identityDb,{phone:'+2348099999999'}),null);
console.log('PASS 11 email/phone validation and conflicting-account checks');
