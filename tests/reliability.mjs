import assert from 'node:assert/strict';
import { createBoundedFetch } from '../src/lib/reliability/fetch.ts';
import { readJson, PayloadError } from '../src/lib/reliability/json.ts';
let calls = 0;
let transport = createBoundedFetch(async () => new Response('', {status: ++calls === 1 ? 503 : 200}));
assert.equal((await transport('https://example.test')).status, 200); assert.equal(calls, 2);
calls = 0;
assert.equal((await transport('https://example.test', {method:'POST', body:'write'})).status, 503); assert.equal(calls, 1);
calls = 0;
transport = createBoundedFetch(async () => { calls++; throw new Error('network'); });
await assert.rejects(transport('https://example.test', {method:'POST'}), /network/); assert.equal(calls, 1);
await assert.rejects(transport('https://example.test'), /network/); assert.equal(calls, 3);
calls = 0;
transport = createBoundedFetch(async () => { calls++; return new Response('',{status:429}); });
assert.equal((await transport('https://example.test')).status,429); assert.equal(calls,1);
const abort = new AbortController(); abort.abort(new Error('caller cancelled'));
transport = createBoundedFetch(async (_input, init) => { calls++; init.signal.throwIfAborted(); return new Response(''); });
await assert.rejects(transport('https://example.test', {signal:abort.signal}),/caller cancelled/);
const keepAlive = setInterval(()=>{},1000);
try {
 transport = createBoundedFetch(async (_input, init) => new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true})), 5);
 await assert.rejects(transport('https://example.test', {method:'POST'}), {name:'TimeoutError'});
} finally {clearInterval(keepAlive);}
const req = (body, headers={}) => new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json',...headers},body});
assert.deepEqual(await readJson(req('{"name":"Iffy"}')), {name:'Iffy'});
for (const value of ['null','[]','bad']) await assert.rejects(readJson(req(value)),e=>e instanceof PayloadError && e.status===400);
await assert.rejects(readJson(req('{"value":"ééé"}',{'content-length':'1'}),10),e=>e.status===413);
await assert.rejects(readJson(req('{}',{'content-type':'text/plain'})),e=>e.status===415);
console.log('PASS bounded read retries, no write replay, rate response passthrough, cancellation, timeout, streaming byte limit, JSON validation');
