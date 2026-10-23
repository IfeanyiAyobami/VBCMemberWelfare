import { withRoute } from "@/lib/home-cell/route";
import {NextRequest} from "next/server";
import {actor} from "@/lib/home-cell/admin";
import {authJSON,hasSameOrigin} from "@/lib/auth/http";
import {normalizeLoginPhone} from "@/lib/home-cell/identity";
import {internalLoginEmail} from "@/lib/home-cell/phone-usernames";
async function handlePOST(req:NextRequest) {
 if(!hasSameOrigin(req))return authJSON({message:"Invalid origin"},403);
 try {
  const a=await actor();
  if(!a.churchAdmin)return authJSON({message:"Only the church administrator can repair phone logins."},403);
  const raw=await req.text();if(raw.length>4096)return authJSON({message:"Request too large"},413);
  const b=JSON.parse(raw);
  if(typeof b.reason!=="string" || b.reason.trim().length<5 || b.reason.length>2000)return authJSON({message:"Enter a reason of at least five characters."},400);
  const assignment=await a.db.from("hco_assignments").select("user_id").eq("id",b.assignment_id).eq("active",true).maybeSingle();
  if(assignment.error || !assignment.data || assignment.data.user_id===a.user.id)return authJSON({message:"Select another active leader."},403);
  const target=assignment.data.user_id;
  const result=await a.db.auth.admin.getUserById(target);
  if(result.error || !result.data.user)return authJSON({message:"Unable to read this account."},503);
  const user=result.data.user;
  const phone=normalizeLoginPhone(user.phone || "");
  if(!phone)return authJSON({message:"This account has no valid legacy phone number to repair."},400);
  const claim=await a.db.rpc("hco_phone_leadership_write",{p_actor:a.user.id,p_action:"repair",p_data:{user_id:target,phone,reason:b.reason.trim()}});
  if(claim.error)return authJSON({message:"Unable to register this phone username. Apply migration 013 and check for a conflicting account."},409);
  // Preserve the auth user ID, password, current metadata and all assignments.
  const updated=await a.db.auth.admin.updateUserById(target,{
   ...(!user.email ? {email:internalLoginEmail(),email_confirm:true} : {}),
   app_metadata:{...user.app_metadata,hco_phone_username:phone},
  });
  if(updated.error)return authJSON({message:"The username is reserved, but login repair could not finish. Retry this repair; no password or leadership role was changed."},503);
  const audit=await a.db.from("hco_audit").insert({actor_id:a.user.id,target_user_id:target,action:"phone_login_repaired",details:{phone,reason:b.reason.trim()}});
  if(audit.error)return authJSON({message:"Phone login was repaired, but the completion audit could not be saved. Retry to finish recording it."},503);
  return authJSON({ok:true,message:"Phone login repaired. Use the same phone number and existing password; leadership assignments are unchanged."});
 }catch{return authJSON({message:"Unable to repair phone login."},403);}
}

export const POST = withRoute("leaders/phone", "POST", handlePOST);
