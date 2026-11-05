import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import ts from 'typescript';
import {generatePin,hashPin,checkPin} from '../src/lib/home-cell/pin.ts';
import {checkPin as friendCheck} from '../src/lib/journey/pin.ts';
process.env.HOME_CELL_PIN_SECRET='generation-test-only-'.repeat(3);
let allowed=true,saved=null,denied=false;
globalThis.__pinGeneration={
 actor:async()=>({user:{id:'coordinator'},churchAdmin:false,areas:allowed?['area']:[],db:{rpc:async(name,args)=>{assert.equal(name,'hco_leader_pin_save');saved=args;return {data:!denied,error:denied?{}:null};}}}),
 authJSON:(b,s=200)=>Response.json(b,{status:s}),hasSameOrigin:r=>r.headers.get('origin')==='https://fixture.test',
 readJson:r=>r.json(),generatePin,hashPin,authRateLimit:async()=>null,
};
const source=ts.transpileModule(await readFile('src/app/api/home-cell/leaders/pin/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^import[\s\S]*?;/gm,'');
const file=new URL('../.leader-pin-generation.mjs',import.meta.url);
await writeFile(file,'const {actor,authJSON,hasSameOrigin,readJson,generatePin,hashPin,authRateLimit}=globalThis.__pinGeneration;\n'+source);
try{
const {POST}=await import(file.href);
const request=(origin='https://fixture.test')=>new Request('https://fixture.test/api/home-cell/leaders/pin',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({user_id:'00000000-0000-4000-8000-000000000002',pin:'1111'})});
assert.equal((await POST(request('https://other.test'))).status,403);
allowed=false;assert.equal((await POST(request())).status,403);assert.equal(saved,null);allowed=true;
const r=await POST(request());assert.equal(r.status,200);const data=await r.json();assert.match(data.pin,/^\d{4}$/);
assert.equal(saved.p_actor,'coordinator');assert.ok(!Object.values(saved).includes(data.pin));
assert.equal(await checkPin(data.pin,saved.p_hash,process.env.HOME_CELL_PIN_SECRET),true);
assert.equal(await friendCheck(data.pin,saved.p_hash,process.env.HOME_CELL_PIN_SECRET),false);
denied=true;const failure=await POST(request());assert.equal(failure.status,409);assert.equal((await failure.json()).pin,undefined);
console.log('PASS coordinator-only generation, random four-digit PIN, hashed persistence, separate Friend hash domain and no credential returned on save failure');
}finally{await unlink(file);delete globalThis.__pinGeneration;}
