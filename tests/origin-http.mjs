import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const origin=`http://127.0.0.1:${port}`, publicURL='https://welfarevbc.netlify.app';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{
 env:{...process.env,APP_ORIGIN:publicURL,SUPABASE_SERVICE_ROLE_KEY:'',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:''},stdio:'ignore'
});
try {
 const deadline=Date.now()+45000;
 while(true) {
  try {await fetch(origin+'/home-cell/login',{signal:AbortSignal.timeout(2000)});break;}
  catch {if(Date.now()>deadline||child.exitCode!==null)throw Error('Origin test server failed to start'); await new Promise(r=>setTimeout(r,150));}
 }
 for(const endpoint of ['/api/home-cell/login','/api/home-cell/recover','/api/auth/login']) {
  const post=header=>fetch(origin+endpoint,{method:'POST',headers:{'content-type':'application/json',...(header?{origin:header}:{})},body:'{}'});
  assert.equal((await post(publicURL)).status,503,endpoint+' accepts configured public origin and reaches missing-server-config guard');
  assert.equal((await post('https://evil.test')).status,403);
  assert.equal((await post(null)).status,403);
 }
 console.log('PASS production HTTP public-origin check behind internal address; foreign and missing origins denied on both login systems and recovery; no external services used');
} finally {child.kill(); await once(child,'exit');}
