import { withRoute } from "@/lib/home-cell/route";
import {onboardingError} from "@/lib/home-cell/onboarding";
import {NextRequest} from "next/server";
import {actor} from "@/lib/home-cell/admin";
import {authJSON,hasSameOrigin} from "@/lib/auth/http";
import {isMemberId} from "@/lib/members/model";
export const dynamic='force-dynamic';
async function handleGET(req:NextRequest){
 try{const a=await actor();const page=Number(req.nextUrl.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>100000)return authJSON({message:'Invalid page'},400);
 const r=await a.db.rpc('hco_transfer_inbox',{p_actor:a.user.id,p_page:page});if(r.error)return authJSON({message:'Apply migration 014 to enable the transfer inbox.'},503);return authJSON({...r.data,page});
 }catch{return authJSON({message:'Transfer inbox access denied'},403);}
}
async function handlePOST(req:NextRequest){
 if(!hasSameOrigin(req))return authJSON({message:'Invalid origin'},403);
 try{const a=await actor();const raw=await req.text();if(raw.length>4096)return authJSON({message:'Request too large'},413);const b=JSON.parse(raw);
 if(!isMemberId(b.id)||!['moved','kept'].includes(b.decision)||typeof b.reason!=='string'||b.reason.trim().length<5||b.reason.length>2000)return authJSON({message:'Select a decision and enter a reason of at least five characters.'},400);
 const r=await a.db.rpc('hco_transfer_decide',{p_actor:a.user.id,p_id:b.id,p_decision:b.decision,p_reason:b.reason.trim()});if(r.error)return authJSON({message:onboardingError(r.error.message)},r.error.code==='42501'?403:409);return authJSON({ok:true,result:r.data});
 }catch{return authJSON({message:'Transfer decision access denied'},403);}
}

export const GET = withRoute("transfers", "GET", handleGET);
export const POST = withRoute("transfers", "POST", handlePOST);
