import {isMemberId,todayInLagos,validateMemberDraft} from "../members/model";
export type OnboardRow={existing_id?:string;first:string;last:string;phone:string;email:string;occupation:string;address:string;birthday:string;anniversary:string;joined:string;email_opt_in:boolean;sms_opt_in:boolean};
export const onboardingHeaders=['first','last','phone','email','occupation','address','birthday','anniversary','joined','email_opt_in','sms_opt_in','member_id'];
export function validateOnboardRow(raw:unknown):{row?:OnboardRow;error?:string} {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {error:'Invalid member row.'};
 const b=raw as Record<string,unknown>;
 const id=b.existing_id || b.member_id;
 if(id && !isMemberId(id))return {error:'Member ID must be a valid UUID.'};
 const flag=(key:string)=>b[key]===undefined||b[key]===''?true:typeof b[key]==='boolean'?b[key]:String(b[key]).toLowerCase()==='true'?true:String(b[key]).toLowerCase()==='false'?false:null;
 const email_opt_in=flag('email_opt_in'),sms_opt_in=flag('sms_opt_in');
 if(email_opt_in===null||sms_opt_in===null)return {error:'Use true or false for email_opt_in and sms_opt_in.'};
 const draft={first:'',last:'',email:'',phone:'',occupation:'',address:'',birthday:'',anniversary:'',joined:todayInLagos(),...b,status:'new_member'};
 if(!draft.joined)draft.joined=todayInLagos();
 // An explicitly selected existing ID needs no replacement profile fields.
 if(id){if(!draft.first)draft.first='Existing';if(!draft.last)draft.last='Member';if(!draft.email&&!draft.phone)draft.email='existing@example.invalid';}
 const validation=validateMemberDraft(draft);
 if(!validation.ok)return {error:Object.entries(validation.errors).map(([k,v])=>k+': '+v).join(' ')};
 const v=validation.value;
 return {row:{...(id?{existing_id:String(id)}:{}),...v,email:id&&!b.email?'':v.email,phone:v.phone,email_opt_in,sms_opt_in}};
}
/** RFC-style quoted fields, BOM, CRLF, embedded commas and doubled quotes. */
export function parseOnboardingCSV(text:string):Record<string,string>[] {
 if(text.length>200000)throw Error('CSV must be at most 200 KB.');
 text=text.replace(/^\uFEFF/,'');
 const grid:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
  else if(c==='"'){if(field||closed)throw Error('Invalid CSV quoting.');quoted=true;}
  else if(c===','||c==='\n'||c==='\r'){row.push(field);field='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(x=>x.trim()))grid.push(row);row=[];}}
  else{if(closed)throw Error('Unexpected text after a quoted CSV field.');field+=c;}
  if(field.length>5000||row.length>20||grid.length>101)throw Error('CSV exceeds the 100 member or field limits.');
 }
 if(quoted)throw Error('Unclosed quoted CSV field.');
 row.push(field);if(row.some(x=>x.trim()))grid.push(row);
 const header=grid.shift()?.map(x=>x.trim().toLowerCase())||[];
 if(!header.length||new Set(header).size!==header.length||header.some(x=>!onboardingHeaders.includes(x)))throw Error('Use the supplied template headers without duplicate columns.');
 if(!grid.length||grid.length>100)throw Error('Upload 1–100 member rows.');
 return grid.map((values,i)=>{if(values.length!==header.length)throw Error('CSV row '+(i+2)+' has the wrong number of fields.');return Object.fromEntries(header.map((h,n)=>[h,values[n].trim()]));});
}
export function onboardingError(message:string){
 const messages:Record<string,string>={
  HCO_MEMBER_CELL_CONFLICT_SUBMIT_TRANSFER:'This member already belongs to another home cell. Preview the assignment and submit a transfer request.',
  HCO_TRANSFER_ALREADY_PENDING:'This member already has a transfer request pending for another cell. Ask the coordinator or church administrator to review it first.',
  HCO_EXISTING_MEMBER_CONFIRM_IN_PREVIEW:'A matching member record now exists. Preview again and confirm the existing identity.',
  HCO_CONFIRM_EXISTING_MEMBER:'Confirm the existing member identities before saving.',
  HCO_CONTACT_IDENTITY_CONFLICT:'The supplied contacts match different people. Ask the church office to resolve the records.',
  HCO_MEMBER_NOT_FOUND_OR_ARCHIVED:'The selected member was removed or archived. Refresh and ask the church office to review it.',
  HCO_TRANSFER_STALE_MEMBERSHIP_REVIEW_AGAIN:'The member’s cell changed after this request was submitted. Close this request with Keep current cell, then review a fresh request.',
  HCO_TRANSFER_ALREADY_DECIDED:'This request was already decided. Refresh the inbox.',
  HCO_CROSS_AREA_ADMIN_REVIEW_REQUIRED:'This move crosses areas outside your coordinator assignments. The church administrator must review it.',
  HCO_COORDINATOR_OR_ADMIN_REQUIRED:'Only an assigned coordinator or the church administrator can decide this transfer.',
  HCO_CELL_LEADER_ACCESS_REQUIRED:'You can only onboard members into your assigned home cells.',
  HCO_CONTACT_EXISTS_IN_GUEST_RECORDS_CONTACT_OFFICE:'This contact already exists in visitor records. Ask the church office; no duplicate has been created.',
  HCO_RETRY_PAYLOAD_MISMATCH:'This save ID was already used for different details. Preview again before saving.',
 };
 const key=Object.keys(messages).find(k=>message.includes(k));
 return key?messages[key]:'Nothing was changed. Refresh the preview or inbox and try again.';
}
