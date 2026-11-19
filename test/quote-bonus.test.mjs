import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('a proposta e a bonificação aparecem no pedido e na aprovação',()=>{
 assert.match(app,/Proposta à família/);
 assert.match(app,/Proposta da equipe/);
 assert.match(app,/Bonificar horas/);
 assert.match(app,/Bonificar valor/);
 assert.match(app,/hours-line/);
 assert.match(app,/Sem saldo: \$\{h\(extra\)\} extras/);
 assert.match(app,/Usa \$\{h\(included\)\} do saldo \+ \$\{h\(extra\)\} extras/);
 assert.match(app,/min · \$\{hours\(p\.minutes\)\}/);
});

test('orçamento grava a proposta e a bonificação para a equipe e a família',async t=>{
 const data=await mkdtemp(join(tmpdir(),'maker-quote-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:data,PORT:'3179',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(data,{recursive:true,force:true});});
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Servidor não iniciou.');})]);
 const base='http://127.0.0.1:3179',pass='Testing123!';
 function client(){let cookie='';return async(path,b,status=200)=>{const r=await fetch(base+'/api'+path,{method:b===undefined?'GET':'POST',headers:{...(b===undefined?{}:{'Content-Type':'application/json'}),'Cookie':cookie},body:b===undefined?undefined:JSON.stringify(b)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const value=await r.json();assert.equal(r.status,status,`${path}: ${JSON.stringify(value)}`);return value;};}
 const admin=client(),guardian=client(),learner=client(),other=client();
 await admin('/setup',{name:'Equipe',email:'admin@quote.test',password:pass});
 const family=await admin('/families',{name:'Família Quote',plan:'monthly'});
 async function register(c,role,email,fid=family.id){const inv=await admin('/invites',{familyId:fid,role});await c('/register',{token:inv.token,name:email,email,password:pass});}
 await register(guardian,'guardian','guardiao@quote.test');
 await register(learner,'learner','aprendiz@quote.test');
 const otherFamily=await admin('/families',{name:'Outra',plan:'monthly'});
 await register(other,'guardian','outra@quote.test',otherFamily.id);
 await admin(`/families/${family.id}/edit`,{name:'Família Quote',plan:'monthly',allowance:0});
 const idea={name:'Polvos',description:'Chaveiro',participant:'Ana',kind:'idea',size:'Como no modelo original',color:'Quero ajuda',quantity:5};
 const project=await guardian('/projects',idea);
 await guardian(`/projects/${project.id}/submit`,{});
 const preview=await admin(`/projects/${project.id}/quotepreview`,{minutes:138,grams:68,material:'PLA',bonusMinutes:60,bonusCents:0});
 assert.equal(preview.hoursLine,'Sem saldo: 1,3 h extras · 1 h bonificadas');
 assert.equal(preview.total,preview.extraCost+preview.materialCost);
 assert.ok(preview.total>=0);
 await admin(`/projects/${project.id}/quote`,{minutes:138,grams:68,material:'PLA',note:'',bonusMinutes:60},400);
 await admin(`/projects/${project.id}/quote`,{minutes:138,grams:68,material:'PLA',note:'Foram em duas placas',bonusMinutes:200},400);
 await admin(`/projects/${project.id}/quote`,{minutes:138,grams:68,material:'PLA',note:'Foram em duas placas',bonusMinutes:60,bonusCents:100000});
 const seen=await guardian(`/projects/${project.id}`);
 assert.equal(seen.quote_note,'Foram em duas placas');
 assert.equal(seen.minutes,138);assert.equal(seen.grams,68);assert.equal(seen.material,'PLA');
 assert.equal(seen.bonus_minutes,60);assert.equal(seen.bonus_cents,100000);assert.equal(seen.exempt,0);
 assert.equal(seen.quote.total,0);assert.equal(seen.quote.hoursLine,'Sem saldo: 1,3 h extras · 1 h bonificadas');
 assert.equal(seen.status,'approval');
 const team=await admin(`/projects/${project.id}`);
 assert.equal(team.quote_note,seen.quote_note);assert.equal(team.quote.hoursLine,seen.quote.hoursLine);
 assert.equal((await learner(`/projects/${project.id}`)).quote_note,'Foram em duas placas');
 await other(`/projects/${project.id}`,undefined,404);
 const events=(await guardian(`/projects/${project.id}`)).events.map(e=>e.text).join('\n');
 assert.match(events,/Foram em duas placas/);
 await admin(`/projects/${project.id}/quote`,{minutes:90,grams:20,material:'PLA',note:'Uma placa só, cor azul.'});
 const again=await guardian(`/projects/${project.id}`);
 assert.equal(again.quote_note,'Uma placa só, cor azul.');
 assert.equal(again.bonus_minutes,0);assert.equal(again.bonus_cents,0);
 assert.match(again.quote.hoursLine,/Sem saldo: 1,5 h extras/);
 assert.equal(again.quote.total,again.quote.extraCost+again.quote.materialCost);
 await guardian(`/projects/${project.id}/approve`,{total:again.quote.total,included:again.quote.included});
 const queued=await guardian(`/projects/${project.id}`);
 assert.equal(queued.status,'queued');assert.equal(queued.charge,again.quote.total);assert.equal(queued.exempt,0);
});
