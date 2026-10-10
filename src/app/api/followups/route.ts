import type { NextRequest } from "next/server";
import { getStaffSession } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { authJSON, hasSameOrigin } from "@/lib/auth/http";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function access() {
 const supabase=await createClient(); const session=await getStaffSession(supabase);
 return {supabase,staff:session.status==="ready"?session.staff:null};
}
export async function GET(request:NextRequest){
 try {
  const {supabase,staff}=await access();
  if(!staff || staff.role==="viewer") return authJSON({message:"Not authorized"},403);
  const action=request.nextUrl.searchParams.get("action")||"list";
  const id=request.nextUrl.searchParams.get("id");
  if(action==="staff" && !["administrator","editor"].includes(staff.role)) return authJSON({message:"Not authorized"},403);
  if(action==="history" && (!id || !uuid.test(id))) return authJSON({message:"Invalid assignment"},400);
  const rpc=action==="staff"?"care_followup_staff":action==="history"?"care_followup_history":"care_followup_list";
  if(!["list","staff","history"].includes(action)) return authJSON({message:"Invalid request"},400);
  const {data,error}=await supabase.rpc(rpc,action==="history"?{p_followup_id:id}:{});
  if(error) return authJSON({message:"Unable to load follow-ups. Check migration and permissions."},error.code==="42501"?403:503);
  return authJSON({items:data});
 } catch {return authJSON({message:"Follow-up service unavailable"},503)}
}
export async function POST(request:NextRequest){
 if(!hasSameOrigin(request)) return authJSON({message:"Invalid origin"},403);
 if(!request.headers.get("content-type")?.includes("application/json")) return authJSON({message:"JSON required"},400);
 try {
  const {supabase,staff}=await access();
  if(!staff || staff.role==="viewer") return authJSON({message:"Not authorized"},403);
  const raw=await request.text();if(raw.length>8192)return authJSON({message:"Payload too large"},413);
  const body=JSON.parse(raw);
  if(body.action==="assign") {
   if(!["administrator","editor"].includes(staff.role)) return authJSON({message:"Not authorized"},403);
   if(!uuid.test(body.memberId||"")||!uuid.test(body.workerId||"")||typeof body.dueAt!=="string"||!Number.isFinite(Date.parse(body.dueAt))||typeof body.summary!=="string"||body.summary.length>1000) return authJSON({message:"Invalid assignment"},400);
   const {data,error}=await supabase.rpc("care_followup_assign",{p_member_id:body.memberId,p_worker:body.workerId,p_due_at:body.dueAt,p_summary:body.summary});
   if(error)return authJSON({message:error.code==="22023"?error.message:"Assignment could not be saved"},error.code==="42501"?403:400);
   return authJSON({id:data},201);
  }
  if(body.action==="record") {
   if(!uuid.test(body.id||"")||typeof body.method!=="string"||typeof body.outcome!=="string"||typeof body.note!=="string"||body.note.trim().length<1||body.note.length>2000||typeof body.complete!=="boolean")return authJSON({message:"Invalid activity"},400);
   const {data,error}=await supabase.rpc("care_followup_record",{p_followup_id:body.id,p_method:body.method,p_outcome:body.outcome,p_note:body.note,p_complete:body.complete});
   if(error)return authJSON({message:error.code==="22023"?error.message:"Activity could not be saved"},error.code==="42501"?403:400);
   return authJSON({id:data},201);
  }
  return authJSON({message:"Invalid action"},400);
 } catch {return authJSON({message:"Unable to process request"},400)}
}
