import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const approve=app.slice(app.indexOf("case'approve-dialog'"),app.indexOf("case'quote-dialog'"));

test('só o formulário da equipe edita hora e filamento',()=>{
 assert.match(app,/name="hourPrice"/);
 assert.match(app,/name="filamentPrice"/);
 assert.match(approve,/Valor da hora/);
 assert.doesNotMatch(approve,/hourPrice/);
 assert.match(app,/Valores ajustados pela equipe só neste pedido/);
});

test('o orçamento guarda a hora e o filamento ajustados pela equipe',async t=>{
 const data=await mkdtemp(join(tmpdir(),'maker-rates-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:data,PORT:'3185',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(data,{recursive:true,force:true});});
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Servidor não iniciou.');})]);
 const base='http://127.0.0.1:3185',pass='Testing123!';
 function client(){let cookie='';return async(path,b,status=200)=>{const r=await fetch(base+'/api'+path,{method:b===undefined?'GET':'POST',headers:{...(b===undefined?{}:{'Content-Type':'application/json'}),Cookie:cookie},body:b===undefined?undefined:JSON.stringify(b)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const value=await r.json();assert.equal(r.status,status,`${path}: ${JSON.stringify(value)}`);return value;};}
 const admin=client(),guardian=client(),learner=client(),op=client(),fin=client();
 await admin('/setup',{name:'Emerson',email:'admin@rates.test',password:pass});
 const family=await admin('/families',{name:'Família Preço',plan:'monthly'});
 async function enroll(c,role,email){const inv=await admin('/invites',{familyId:family.id,role});await c('/register',{token:inv.token,name:email.split('@')[0],email,password:pass});}
 await enroll(guardian,'guardian','marina@rates.test');
 await enroll(learner,'learner','ana@rates.test');
 async function staff(c,email,accessRole){const inv=await admin('/staff-invites',{email,accessRole});await c('/staff-register',{token:inv.token,name:email.split('@')[0],email,password:pass});}
 await staff(op,'op@rates.test','operator');
 await staff(fin,'fin@rates.test','finance');
 await admin(`/families/${family.id}/edit`,{name:'Família Preço',plan:'monthly',allowance:0});
 async function order(){const p=await guardian('/projects',{name:'Peça',description:'Uma peça',participant:'Ana',kind:'idea',size:'Pequeno',color:'Azul',quantity:1});await guardian(`/projects/${p.id}/submit`,{});return p;}
 const rates={minutes:60,grams:100,material:'PLA',note:'Preço deste pedido.',extraRate:1000,materialRate:30000,bonusMinutes:30};
 const denied=await order();
 await guardian(`/projects/${denied.id}/quote`,rates,403);
 await learner(`/projects/${denied.id}/quote`,rates,403);
 await fin(`/projects/${denied.id}/quote`,rates,403);
 await fin(`/projects/${denied.id}/quotepreview`,rates,403);
 const plain=await order();
 await op(`/projects/${plain.id}/quote`,{minutes:60,grams:100,material:'PLA',note:'Preço padrão.'});
 const standard=await guardian(`/projects/${plain.id}`);
 assert.equal(standard.extra_rate,600);
 assert.equal(standard.material_rate,12000);
 assert.equal(standard.custom_rates,0);
 assert.equal(standard.quote.extraCost,600);
 assert.equal(standard.quote.materialCost,1200);
 const custom=await order();
 await op(`/projects/${custom.id}/quote`,{...rates,extraRate:-1},400);
 await op(`/projects/${custom.id}/quote`,rates);
 const seen=await guardian(`/projects/${custom.id}`);
 assert.equal(seen.extra_rate,1000);
 assert.equal(seen.material_rate,30000);
 assert.equal(seen.custom_rates,1);
 assert.equal(seen.quote.extra,30);
 assert.equal(seen.quote.extraCost,500);
 assert.equal(seen.quote.materialCost,3000);
 assert.equal(seen.quote.total,3500);
 assert.match(seen.events.map(e=>e.text).join('\n'),/Valores ajustados pela equipe: hora/);
 const cfg=(await admin('/dashboard')).config;
 await admin('/settings',{...cfg,extra:900,materials:cfg.materials.map(m=>m.name==='PLA'?{...m,cost:20000}:m)});
 const kept=await guardian(`/projects/${custom.id}`);
 assert.equal(kept.extra_rate,1000);
 assert.equal(kept.material_rate,30000);
 assert.equal(kept.quote.extraCost,500);
 assert.equal(kept.quote.total,3500);
 assert.equal((await guardian(`/projects/${plain.id}`)).extra_rate,600);
});
