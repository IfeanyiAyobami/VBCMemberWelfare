import assert from 'node:assert/strict';
import {emptyGuest,validateGuest} from '../src/lib/guests/model.ts';
const blank=emptyGuest();assert.equal(blank.email_opt_in,false);
for(const key of ['contact_consent','sms_opt_in','celebrations_opt_in','programmes_opt_in','newsletters_opt_in'])assert.equal(blank[key],true);
const phoneOnly={...blank,surname:'Fictional',other_names:'Phone-only guest',phone:'08015550999'};
assert(validateGuest(phoneOnly).ok,'Optional email does not prevent a phone-only guest card');
const explicit={...phoneOnly,sms_opt_in:false,newsletters_opt_in:false};const result=validateGuest(explicit);assert(result.ok);assert.equal(result.value.sms_opt_in,false);assert.equal(result.value.newsletters_opt_in,false);
console.log('PASS new staff-card defaults, optional email and explicit opt-out preservation');
