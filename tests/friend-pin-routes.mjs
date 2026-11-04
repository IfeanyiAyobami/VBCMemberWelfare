import assert from 'node:assert/strict';import {readFile,writeFile,unlink} from 'node:fs/promises';import ts from 'typescript';
import {hashPin,checkPin,validPin} from '../src/lib/journey/pin.ts';
const secret='fixture-secret-'.repeat(4);process.env.FRIEND_PIN_SECRET=secret;const hash=await hashPin('0004',secret);let mode='ok',sessions=0,links=0;
const db={rpc:async(name)=>({error:null,data:name==='care_friend_pin_attempt'?(mode==='locked'?{}:{user_id:'fixture-user',pin_hash:hash,version:'version'}):mode!=='revoked'}),auth:{admin:{getUserById:async()=>({data:{user:{email:'fixture@example.test'}},error:null}),generateLink:async()=>{links++;return mode==='provider-error'?{error:{message:'provider failed'}}:{data:{properties:{hashed_token:'server-only-token'}},error:null};}}}};
globalThis.__route={authJSON:(b,s=200)=>Response.json(b,{status:s}),hasSameOrigin:r=>r.headers.get('origin')===new URL(r.url).origin,readJson:r=>r.json(),PayloadError:class extends Error{},adminDb:()=>db,authRateLimit:async()=>mode==='ip-limit'?Response.json({message:'limited'},{status:429}):null,loginIdentity:s=>s.includes('@')?{email:s.toLowerCase()}:{phone:s},createClient:async()=>({auth:{verifyOtp:async d=>{assert.equal(d.token_hash,'server-only-token');sessions++;return {data:{user:{id:'fixture-user'}},error:null};},signOut:async()=>({})}}),checkPin,validPin};
let code=ts.transpileModule(await readFile('src/app/api/journey/friend-login/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^import[\s\S]*?;/gm,'');code='const {authJSON,hasSameOrigin,readJson,PayloadError,adminDb,authRateLimit,loginIdentity,createClient,checkPin,validPin}=globalThis.__route;\n'+code;
const temp=new URL('../.pin-route-test.mjs',import.meta.url);await writeFile(temp,code);
try{const {POST}=await import(temp.href);const request=(pin,origin='https://care.test')=>new Request('https://care.test/api/journey/friend-login',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({identifier:'fixture@example.test',pin})});
 assert.equal((await POST(request('0004','https://bad.test'))).status,403);assert.equal((await POST(request('12345'))).status,400);assert.equal((await POST(request('0005'))).status,401);assert.equal(sessions,0);assert.equal(links,0);
 let r=await POST(request('0004'));assert.equal(r.status,200);assert.equal((await r.json()).next,'/followups');assert.equal(sessions,1);
 mode='locked';assert.equal((await POST(request('0004'))).status,401);assert.equal(sessions,1);
 mode='revoked';assert.equal((await POST(request('0004'))).status,401);assert.equal(sessions,1);
 mode='provider-error';assert.equal((await POST(request('0004'))).status,503);assert.equal(sessions,1);
 mode='ip-limit';assert.equal((await POST(request('0004'))).status,429);
 console.log('PASS PIN route origin/input guards, real hash verification, locked/revoked denial, session-token handoff, provider failure and IP throttling');
}finally{await unlink(temp);delete globalThis.__route;}
