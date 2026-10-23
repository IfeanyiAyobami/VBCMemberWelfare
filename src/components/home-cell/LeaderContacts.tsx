"use client";
import {useEffect,useState} from "react";
import {normalizeLoginPhone} from "@/lib/home-cell/identity";
type Contact={cell_id:string;area_id:string;name:string;leader_details?:string;team_details?:string;area_details?:string;version:number};
export default function LeaderContacts({scope="",onCreate}:{scope?:string;onCreate?:(entry:{cell_id:string;area_id:string;phone:string;full_name:string})=>void}) {
 const [items,setItems]=useState<Contact[]>([]),[areas,setAreas]=useState<{id:string;name:string}[]>([]),[manager,setManager]=useState(false),[search,setSearch]=useState(""),[edit,setEdit]=useState<Contact|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const url="/api/home-cell/contacts?scope="+encodeURIComponent(scope);
 async function load(){const r=await fetch(url,{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.message);setItems(j.contacts);setAreas(j.areas);setManager(j.manager);}
 useEffect(()=>{let live=true;void fetch(url,{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.message);if(live){setItems(j.contacts);setAreas(j.areas);setManager(j.manager);setError("");}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[url]);
 return <section className="hc-panel"><header><h2>Cell Leaders & Contact Details</h2></header>
 <p className="hc-muted">Names and contact details from the church directory. Login accounts are created separately. Check phone numbers before creating access.</p>
 {error&&<p className="hc-alert" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 <label>Search directory<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, home cell, area or phone"/></label>
 {edit&&<form className="hc-form-grid" onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...edit,leader_details:edit.leader_details||"",team_details:edit.team_details||"",area_details:edit.area_details||""})});const j=await r.json();if(!r.ok)throw Error(j.message);await load();setEdit(null);setMessage("Directory details saved.");}catch(e){setError(e instanceof Error?e.message:"Save failed");}finally{setBusy(false);}}}>
 <h3 className="hc-full">Edit {edit.name}</h3>
 {([ ["leader_details","Cell leader",2000],["team_details","Assistants & treasurer",3000],["area_details","Area leadership",2000] ] as const).map(([key,label,max])=><label className="hc-full" key={key}>{label}<textarea maxLength={max} value={edit[key]||""} onChange={e=>setEdit({...edit,[key]:e.target.value})}/></label>)}
 <button className="hc-primary" disabled={busy}>Save directory details</button><button type="button" className="hc-secondary" disabled={busy} onClick={()=>setEdit(null)}>Cancel</button>
 </form>}
 <div className="hc-leader-list">{items.filter(x=>(x.name+" "+(areas.find(a=>a.id===x.area_id)?.name||"")+" "+x.leader_details+" "+x.team_details+" "+x.area_details).toLowerCase().includes(search.toLowerCase())).map(x=><article className="hc-leader-card" key={x.cell_id}>
 <h3>{x.name}</h3><small>{areas.find(a=>a.id===x.area_id)?.name}</small>
 <p><b>Cell leader:</b> {x.leader_details||"Not provided"}</p><p><b>Assistants & treasurer:</b> {x.team_details||"Not provided"}</p><p><b>Area leadership:</b> {x.area_details||"Not provided"}</p>
 <div className="hc-leader-actions">{manager&&<button className="hc-secondary" onClick={()=>{setEdit(x);setError("");setMessage("");}}>Edit details</button>}
 {onCreate&&manager&&x.leader_details&&<button className="hc-secondary" onClick={()=>{
 const raw=x.leader_details!.match(/(?:\+234|0)\d[\d\s()-]{7,}/)?.[0]||"";
 const phone=normalizeLoginPhone(raw)||"";
 const full_name=x.leader_details!.replace(/(?:\+234|0)\d[\d\s()/()-]{7,}/g,"").replace(/Phone\s*(?:number|no)?\s*:?|Homecell Leader:/gi,"").replace(/[–—-]+\s*$/g,"").trim();
 onCreate({cell_id:x.cell_id,area_id:x.area_id,phone,full_name});
 }}>Create / assign login</button>}</div></article>)}</div>
 </section>;
}
