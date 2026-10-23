import { withRoute } from "@/lib/home-cell/route";
import {NextRequest} from "next/server";
import {authJSON,hasSameOrigin} from "@/lib/auth/http";
import {workspaceScope} from "@/lib/home-cell/workspace";
import {isMemberId} from "@/lib/members/model";
import {onboardingError,validateOnboardRow,type OnboardRow} from "@/lib/home-cell/onboarding";
export const dynamic='force-dynamic';
async function handlePOST(req:NextRequest){
 if(!hasSameOrigin(req))return authJSON({message:'Invalid origin'},403);
 try{
  const a=await workspaceScope(req.nextUrl.searchParams.get('scope'));
  const raw=await req.text();if(Buffer.byteLength(raw)>250000)return authJSON({message:'Upload at most 100 rows and 200 KB of CSV.'},413);
  const b=JSON.parse(raw);
  if(!a.cells.some(c=>c.id===b.cell_id) || (!a.churchAdmin&&!a.assignments.some(x=>x.role==='cell_leader'&&x.cell_id===b.cell_id)))return authJSON({message:'Choose one of your assigned home cells.'},403);
  if(!Array.isArray(b.rows)||b.rows.length<1||b.rows.length>100)return authJSON({message:'Preview 1–100 member rows.'},400);
  const checked=(b.rows as unknown[]).map(validateOnboardRow);
  if(b.action==='save'){
   if(checked.some(x=>!x.row)||!isMemberId(b.request_id)||b.confirm_preview!==true)return authJSON({message:'Preview and confirm valid rows before saving.'},400);
   const payload={cell_id:b.cell_id,request_id:b.request_id,rows:checked.map(x=>x.row),source:b.source==='csv'?'csv':'form',confirm_existing:b.confirm_existing===true,request_transfers:b.request_transfers===true,reason:typeof b.reason==='string'?b.reason.trim():''};
   const r=await a.db.rpc('hco_onboard_members',{p_actor:a.user.id,p_data:payload});
   if(r.error)return authJSON({message:onboardingError(r.error.message),code:r.error.code},r.error.code==='42501'?403:409);
   return authJSON({ok:true,results:r.data});
  }
  if(b.action!=='preview')return authJSON({message:'Choose preview or save.'},400);
  const valid=checked.flatMap(x=>x.row?[x.row]:[]),phones=valid.map(x=>x.phone).filter(Boolean),emails=valid.map(x=>x.email).filter(Boolean),ids=valid.map(x=>x.existing_id).filter(Boolean) as string[];
  const fields='id,other_names,surname,phone,email,status,archived_at';
  const queries=[a.db.from('care_members').select(fields,{count:'exact'}).in('phone',phones).limit(1000),a.db.from('care_members').select(fields,{count:'exact'}).in('email',emails).limit(1000),a.db.from('care_members').select(fields,{count:'exact'}).in('id',ids).limit(1000),a.db.from('care_guest_submissions').select('id,phone,email',{count:'exact'}).in('phone',phones).limit(1000),a.db.from('care_guest_submissions').select('id,phone,email',{count:'exact'}).in('email',emails).limit(1000)];
  const results=await Promise.all(queries);
  if(results.some(r=>r.error||r.count!==null&&r.count>(r.data?.length||0)))throw Error('Contact lookup unavailable or incomplete.');
  type M={id:string;other_names:string;surname:string;phone:string|null;email:string|null;status:string;archived_at:string|null};
  const members=[...new Map(results.slice(0,3).flatMap(r=>r.data||[]).map(m=>[m.id,m as M])).values()];
  const guests=results.slice(3).flatMap(r=>r.data||[]) as {id:string;phone:string|null;email:string|null}[];
  const membership=await a.db.from('hco_member_cells').select('member_id,cell_id',{count:'exact'}).eq('active',true).in('member_id',members.map(m=>m.id)).limit(1000);
  if(membership.error||membership.count!==null&&membership.count>(membership.data?.length||0))throw Error('Assignment lookup unavailable or incomplete.');
  const names=await a.db.from('hco_cells').select('id,name').in('id',[...new Set((membership.data||[]).map(x=>x.cell_id))]);if(names.error)throw Error('Cell lookup unavailable.');
  const seen=new Set<string>();
  const preview=checked.map((entry,index)=>{
   const fail=(message:string)=>({index,status:'invalid',message,row:entry.row});
   if(!entry.row)return fail(entry.error||'Invalid row.');
   const row=entry.row;
   const match=members.filter(m=>m.id===row.existing_id || row.phone&&m.phone===row.phone || row.email&&m.email?.toLowerCase()===row.email);
   if(match.length>1)return fail('Email, phone or member ID match different people. Resolve this with the church office.');
   const person=match[0];
   if(row.existing_id&&person?.id!==row.existing_id)return fail('Selected member was not found.');
   if(person?.archived_at)return fail('This record is archived. Ask the church office to review it.');
   if(!person&&guests.some(g=>row.phone&&g.phone===row.phone||row.email&&g.email?.toLowerCase()===row.email))return fail('Contact already exists in visitor records. Ask the church office; no duplicate will be created.');
   const keys=[person?.id||row.existing_id,row.phone,row.email].filter(Boolean) as string[];
   if(keys.some(k=>seen.has(k)))return fail('Duplicate person or contact within this upload. Keep one row.');keys.forEach(k=>seen.add(k));
   const current=(membership.data||[]).filter(x=>x.member_id===person?.id);
   const other=current.filter(x=>x.cell_id!==b.cell_id);
   const status=other.length?'conflict':current.length?'already_assigned':person?'existing':'new';
   return {index,status,row:{...row,...(person?{existing_id:person.id}:{})},name:person?person.other_names+' '+person.surname:row.first+' '+row.last,current_cells:current.map(x=>names.data?.find(c=>c.id===x.cell_id)?.name||'Home cell'),message:other.length?'Transfer approval required. Current cell stays unchanged.':person?'Existing record reused; profile and preferences stay unchanged.':'Create a new-member record and assign this home cell.'};
  });
  return authJSON({preview});
 }catch(e){return authJSON({message:e instanceof Error?e.message:'Onboarding unavailable. Apply migration 014 and check access.'},503);}
}

export const POST = withRoute("onboarding", "POST", handlePOST);
