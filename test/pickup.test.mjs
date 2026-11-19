import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

test('retirada sem pagamento fica aguardando e conclui quando o pagamento cai',async t=>{
 const data=await mkdtemp(join(tmpdir(),'maker-pickup-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:data,PORT:'3189',HOST:'127.0.0.1',MODEL_LOOKUP:'off'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(data,{recursive:true,force:true});});
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Servidor não iniciou.');})]);
 const base='http://127.0.0.1:3189',pass='Testing123!';
 function client(){let cookie='';return async(path,b,status=200)=>{const r=await fetch(base+'/api'+path,{method:b===undefined?'GET':'POST',headers:{...(b===undefined?{}:{'Content-Type':'application/json'}),Cookie:cookie},body:b===undefined?undefined:JSON.stringify(b)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const value=await r.json();assert.equal(r.status,status,`${path}: ${JSON.stringify(value)}`);return value;};}
 const admin=client(),guardian=client();
 await admin('/setup',{name:'Emerson',email:'admin@pickup.test',password:pass});
 const family=await admin('/families',{name:'Família Retirada',plan:'monthly'});
 const inv=await admin('/invites',{familyId:family.id,role:'guardian'});
 await guardian('/register',{token:inv.token,name:'Marina',email:'marina@pickup.test',password:pass});
 await admin(`/families/${family.id}/edit`,{name:'Família Retirada',plan:'monthly',allowance:0});
 async function readyOrder(name){const p=await guardian('/projects',{name,description:'Peça',participant:'Ana',kind:'idea',size:'Pequeno',color:'Azul',quantity:1});await guardian(`/projects/${p.id}/submit`,{});await admin(`/projects/${p.id}/quote`,{minutes:60,grams:100,material:'PLA',note:'Pronta.'});const view=await guardian(`/projects/${p.id}`);await guardian(`/projects/${p.id}/approve`,{total:view.quote.total,included:view.quote.included});await admin(`/projects/${p.id}/finish`,{minutes:60,grams:100});return p.id;}
 const open=await readyOrder('Aberto');
 const seen=await guardian(`/projects/${open}`);
 assert.equal(seen.status,'ready');assert.ok(seen.charge>0);assert.equal(seen.paid,0);
 await guardian(`/projects/${open}/collect`,{});
 const picked=await guardian(`/projects/${open}`);
 assert.equal(picked.status,'picked');
 assert.ok(picked.picked_up_at);
 assert.match(picked.events.at(-1).text,/Retirada confirmada por Marina; pagamento pendente/);
 const list=await admin('/dashboard');
 assert.ok(list.projects.some(p=>p.id===open&&p.status==='picked'));
 assert.equal(list.projects.filter(p=>p.status==='completed').some(p=>p.id===open),false);
 await admin(`/projects/${open}/paid`,{});
 const done=await guardian(`/projects/${open}`);
 assert.equal(done.status,'completed');assert.equal(done.paid,1);
 assert.match(done.events.map(e=>e.text).join('\n'),/Pagamento resolvido\. Pedido concluído/);
 const gift=await readyOrder('Presente');
 await admin(`/projects/${gift}/exempt`,{});
 await guardian(`/projects/${gift}/collect`,{});
 const gifted=await guardian(`/projects/${gift}`);
 assert.equal(gifted.status,'completed');
 assert.match(gifted.events.at(-1).text,/Retirada confirmada por Marina\. Projeto concluído/);
});
