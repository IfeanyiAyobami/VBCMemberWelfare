import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/historical-guests'});
global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
const rows=[{row:2,name:'Fictional Historical Guest',phone:null,gender:'Female',source:{joined:'Yes',remarks:'<script>never execute</script>'},memberId:null},{row:3,name:'Fictional Conflict Guest',phone:'+2348015550999',gender:'Male',source:{},memberId:null}];
const writes=[];let fail=false;
global.fetch=async(_url,opts)=>{if(fail)return {ok:false,json:async()=>({message:'Coordinator access required.'})};if(opts?.method==='POST'){const row=JSON.parse(opts.body).row;writes.push(row);return {ok:true,json:async()=>({saved:row===2,memberId:row===2?'fictional-id':null,message:row===2?'Saved':'Possible existing person'})};}return {ok:true,json:async()=>({rows})};};
const temp=new URL('../.historical-ui-check.mjs',import.meta.url);
await writeFile(temp,ts.transpileModule(await readFile('src/components/HistoricalGuests.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const root=createRoot(document.getElementById('root'));
try{
 const {default:Component}=await import(temp.href);
 await act(async()=>{root.render(React.createElement(Component));});
 assert(document.body.textContent.includes('0 of 2 imported'));
 assert.equal(document.querySelectorAll('script').length,0);
 const button=[...document.querySelectorAll('button')].find(x=>x.textContent==='Import remaining guests');
 await act(async()=>{button.click();});
 assert.deepEqual(writes,[2,3]);assert(document.body.textContent.includes('1 of 2 imported'));assert(document.body.textContent.includes('Possible existing person'));
 await act(async()=>{button.click();});assert.deepEqual(writes,[2,3,3]);
 fail=true;await act(async()=>{[...document.querySelectorAll('button')].find(x=>x.textContent==='Refresh saved status').click();});
 assert.equal(document.querySelector('[role="alert"]').textContent,'Coordinator access required.');
 console.log('PASS historical review rendering, escaped original notes, batch import, conflict retention, saved-row exclusion on retry and access error');
}finally{await act(async()=>root.unmount());await unlink(temp);dom.window.close();}
