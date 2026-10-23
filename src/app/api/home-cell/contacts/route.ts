import { withRoute } from "@/lib/home-cell/route";
import {NextRequest} from "next/server";
import {authJSON,hasSameOrigin} from "@/lib/auth/http";
import {workspaceScope} from "@/lib/home-cell/workspace";
export const dynamic="force-dynamic";
async function handleGET(req: NextRequest) {
 try {
  const a=await workspaceScope(req.nextUrl.searchParams.get("scope"));
  const ids=a.cells.map(c=>c.id);
  const [contacts, areas]=await Promise.all([
   a.db.from("hco_directory_contacts").select("*").in("cell_id",ids),
   a.db.from("hco_areas").select("id,name").in("id",[...new Set(a.cells.map(c=>c.area_id))])
  ]);
  if(contacts.error || areas.error) return authJSON({message:"Apply migration 012 to load the editable leader directory."},503);
  return authJSON({contacts:a.cells.map(c=>({...c,...contacts.data?.find(d=>d.cell_id===c.id),cell_id:c.id,version:contacts.data?.find(d=>d.cell_id===c.id)?.version||0})),areas:areas.data,manager:a.manager});
 } catch {return authJSON({message:"Directory access denied"},403);}
}
async function handlePOST(req: NextRequest) {
 if(!hasSameOrigin(req))return authJSON({message:"Invalid origin"},403);
 try {
  const a=await workspaceScope(req.nextUrl.searchParams.get("scope"));
  const raw=await req.text(); if(raw.length>12000)return authJSON({message:"Request too large"},413);
  const b=JSON.parse(raw);
  if(!a.manager || !a.cells.some(c=>c.id===b.cell_id))return authJSON({message:"Access denied"},403);
  if(!Number.isInteger(b.version)||b.version<0)return authJSON({message:"Refresh the directory first"},400);
  for(const [key,max] of [["leader_details",2000],["team_details",3000],["area_details",2000]] as const) {
   if(typeof b[key]!=="string"||b[key].length>max)return authJSON({message:"Invalid directory details"},400);
  }
  const {error}=await a.db.rpc("hco_directory_write",{p_actor:a.user.id,p_data:b});
  if(error)return authJSON({message:error.message.includes("STALE")?"This entry changed. Reload before saving.":"Unable to save directory details."},409);
  return authJSON({ok:true});
 }catch{return authJSON({message:"Unable to save directory details"},403);}
}

export const GET = withRoute("contacts", "GET", handleGET);
export const POST = withRoute("contacts", "POST", handlePOST);
