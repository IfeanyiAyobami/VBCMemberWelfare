import assert from 'node:assert/strict';
import { acceptsOrigin, publicOrigin } from '../src/lib/auth/origin.ts';
const live='https://welfarevbc.netlify.app', internal='http://localhost:8888';
assert(acceptsOrigin('http://localhost:3000','http://localhost:3000',{}));
assert(acceptsOrigin(live,internal,{APP_ORIGIN:live}));
assert(!acceptsOrigin('https://evil.test',internal,{APP_ORIGIN:live}));
assert(!acceptsOrigin(null,internal,{APP_ORIGIN:live}));
assert(!acceptsOrigin('null',internal,{APP_ORIGIN:live}));
assert(!acceptsOrigin(live+'.evil.test',internal,{APP_ORIGIN:live}));
assert(!acceptsOrigin(live+':444',internal,{APP_ORIGIN:live}));
assert(!acceptsOrigin(internal,internal,{APP_ORIGIN:live}));
assert(acceptsOrigin(live,internal,{NETLIFY:'true',CONTEXT:'production',URL:live}));
const preview='https://deploy-preview-2--welfarevbc.netlify.app';
assert(acceptsOrigin(preview,internal,{NETLIFY:'true',CONTEXT:'deploy-preview',URL:live,DEPLOY_PRIME_URL:preview}));
assert(!acceptsOrigin(live,internal,{NETLIFY:'true',CONTEXT:'deploy-preview',URL:live,DEPLOY_PRIME_URL:preview}));
for(const bad of ['https://user:pass@example.test','https://example.test/path','https://example.test/?q=1','https://example.test/#hash','not a URL','http://example.test']) {
 assert.equal(publicOrigin(internal,{APP_ORIGIN:bad}),null);
 assert(!acceptsOrigin(internal,internal,{APP_ORIGIN:bad}));
}
assert.equal(publicOrigin(internal,{APP_ORIGIN:live+'/'}),live);
console.log('PASS proxy-aware public origin, local development, Netlify production/preview isolation, missing/foreign origins, ports, malformed configuration and fail-closed behavior');
