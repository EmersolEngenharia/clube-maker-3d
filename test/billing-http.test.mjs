import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('webhook usa corpo bruto e token antes de parsear; fluxo manual HTTP e permissões',async t=>{
 const data=await mkdtemp(join(tmpdir(),'maker-billing-http-')),child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:data,PORT:'3173',HOST:'127.0.0.1',ASAAS_API_KEY:'',ASAAS_WEBHOOK_TOKEN:'webhook-test-token'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(data,{recursive:true,force:true});});
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Servidor não iniciou');})]);const base='http://127.0.0.1:3173';
 let cookie='';async function call(path,b,status=200){const r=await fetch(base+'/api'+path,{method:b===undefined?'GET':'POST',headers:{...(b===undefined?{}:{'Content-Type':'application/json'}),Cookie:cookie},body:b===undefined?undefined:JSON.stringify(b)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;}
 await call('/setup',{name:'Admin',email:'admin@test.example',password:'Testing123'});const f=await call('/families',{name:'Família',plan:'monthly'}),c=await call('/billing/charges',{requestKey:'http-test',familyId:f.id,method:'pix_cash',customer:{name:'Responsável',email:'g@test.example'}});
 assert.equal(c.provider,'manual');await call(`/billing/charges/${c.id}/manual`,{});await call(`/billing/charges/${c.id}/manual`,{});assert.equal((await call('/finance?scope=club')).entries.length,1);
 for(const [token,body,status]of[['wrong','{',401],['webhook-test-token','{',400],['webhook-test-token',JSON.stringify({event:'OTHER_EVENT'}),200],['webhook-test-token',JSON.stringify({event:'PAYMENT_RECEIVED',payment:{id:'from-panel',value:1}}),200]]){
  const r=await fetch(base+'/api/webhooks/asaas',{method:'POST',headers:{'Content-Type':'application/json','asaas-access-token':token},body});assert.equal(r.status,status,await r.text());
 }
 const inv=await call('/invites',{familyId:f.id,role:'learner'});cookie='';await call('/register',{token:inv.token,name:'Criança',email:'kid@test.example',password:'Testing123'});await call('/billing',undefined,403);await call('/billing/diagnostic',undefined,403);await call('/billing/charges',{requestKey:'kid',familyId:f.id,method:'pix_cash'},403);
});
