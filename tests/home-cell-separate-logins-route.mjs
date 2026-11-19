import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import ts from 'typescript';
import {hashPin,checkPin,generatePin} from '../src/lib/home-cell/pin.ts';
const owner='80000000-0000-4000-8000-000000000002',alias='80000000-0000-4000-8000-000000000003';
process.env.HOME_CELL_PIN_SECRET='test-only-long-pin-secret-'.repeat(3);
let admin=true,roles=['church_admin','cell_leader'],rpcError=false,exists=false,created=0,saved;
const linked={id:alias,app_metadata:{hco_cell_login_for:owner}};
const db={
 from:table=>{ const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:table==='care_staff'?null:{phone:'+2348035550161'},error:null}),then:resolve=>Promise.resolve(resolve({data:roles.map(role=>({role})),error:null}))};return query;},
 rpc:async(name,args)=>{assert.equal(name,'hco_cell_login_save');saved=args;return {data:!rpcError,error:rpcError?{}:null};},
 auth:{admin:{getUserById:async()=>({data:{user:{id:owner,email:'owner@example.test',user_metadata:{full_name:'Fictional leader'}}},error:null}),createUser:async body=>{created++;assert.equal(body.app_metadata.hco_cell_login_for,owner);assert.equal(body.phone,undefined);assert.notEqual(body.password.length,4);exists=true;return {data:{user:linked},error:null};}}},
};
globalThis.__separate={
 randomBytes:(await import('node:crypto')).randomBytes,actor:async()=>({user:{id:'admin'},churchAdmin:admin,db}),
 findAccountByEmail:async()=>exists?linked:null,publicLoginEmail:s=>s,authJSON:(b,s=200)=>Response.json(b,{status:s}),
 hasSameOrigin:r=>r.headers.get('origin')==='https://fixture.test',readJson:r=>r.json(),generatePin,hashPin,authRateLimit:async()=>null,
};
const file=new URL('../.separate-route-test.mjs',import.meta.url);
const src=ts.transpileModule(await readFile('src/app/api/home-cell/leaders/cell-login/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^import[\s\S]*?;/gm,'');
await writeFile(file,'const {randomBytes,actor,findAccountByEmail,publicLoginEmail,authJSON,hasSameOrigin,readJson,generatePin,hashPin,authRateLimit}=globalThis.__separate;\n'+src);
try {
 const {POST}=await import(file.href);
 const req=(origin='https://fixture.test')=>new Request('https://fixture.test/api/home-cell/leaders/cell-login',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({user_id:owner,pin:'1111'})});
 assert.equal((await POST(req('https://evil.test'))).status,403);
 admin=false;assert.equal((await POST(req())).status,403);assert.equal(created,0);admin=true;
 roles=['church_admin'];assert.equal((await POST(req())).status,409);assert.equal(created,0);
 roles=['church_admin','cell_leader'];let response=await POST(req());assert.equal(response.status,200);let body=await response.json();assert.match(body.pin,/^\d{4}$/);assert.equal(saved.p_owner,owner);assert.equal(saved.p_user,alias);assert.equal(await checkPin(body.pin,saved.p_hash,process.env.HOME_CELL_PIN_SECRET),true);assert.equal(body.login,'owner@example.test');
 assert.equal(created,1);await POST(req());assert.equal(created,1);
 roles=['coordinator','cell_leader'];assert.equal((await POST(req())).status,200);
 rpcError=true;response=await POST(req());assert.equal(response.status,409);body=await response.json();assert.equal(body.pin,undefined);
 console.log('PASS separate login route: origin/admin guards, both roles required, server-only random alias password, same public identifier, hash-only PIN save, retry reuse, Coordinator dual-role and no credential on failed persistence');
} finally {await unlink(file);delete globalThis.__separate;}
