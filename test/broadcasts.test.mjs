import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDatabase} from '../db.mjs';
import {createBroadcasts} from '../messaging/broadcasts.mjs';
import {EvolutionClient,EvolutionError} from '../messaging/evolution.mjs';
async function fixture(t,{uncertain=false,enabled=true}={}){
 const data=await mkdtemp(join(tmpdir(),'maker-broadcast-')),db=await createDatabase({data});t.after(async()=>{await db.close();await rm(data,{recursive:true,force:true});});
 await db.transaction(async()=>{
  await db.run("INSERT INTO families(id,name,created) VALUES(1,'Família Um','2026-10-01T12:00:00Z')");await db.run("INSERT INTO families(id,name,created) VALUES(2,'Família Dois','2026-10-01T12:00:00Z')");
  await db.run("INSERT INTO users(id,email,name,password,role,family_id) VALUES(1,'dono@test.example','Dono Clube','h','admin',NULL)");
  await db.run("INSERT INTO users(id,email,name,password,role,family_id) VALUES(2,'g1@test.example','Ana Lima','h','guardian',1)");
  await db.run("INSERT INTO users(id,email,name,password,role,family_id) VALUES(3,'g2@test.example','Bruno Reis','h','guardian',2)");
  await db.run("INSERT INTO users(id,email,name,password,role,family_id) VALUES(4,'g3@test.example','Sem Zap','h','guardian',2)");
  await db.run("INSERT INTO users(id,email,name,password,role,family_id) VALUES(5,'adm2@test.example','Outro Admin','h','admin',NULL)");
  await db.run("INSERT INTO users(id,email,name,password,role,family_id) VALUES(6,'kid@test.example','Aprendiz','h','learner',1)");
  for(const [u,w] of [[2,'5564999990002'],[3,'5564999990003']])await db.run('INSERT INTO guardian_contacts VALUES(?,?)',u,w);
  await db.run("INSERT INTO family_automation(family_id,primary_guardian_id,created,updated) VALUES(1,2,'x','x'),(2,3,'x','x')");
 });
 const files=new Map(),sent=[];let fail=uncertain;
 const storage={put:async(k,b)=>{files.set(k,b);},get:async k=>files.get(k),remove:async k=>{files.delete(k);}};
 const evo={configured:true,diagnostic:async()=>({connected:true}),
  sendText:async(number,text)=>{if(fail)throw new EvolutionError('lost',{uncertain:true});sent.push({number,text});return {messageId:'m'+sent.length};},
  sendMedia:async(number,m)=>{sent.push({number,...m});return {messageId:'m'+sent.length};}};
 const b=createBroadcasts({db,storage,evolution:evo,env:{WHATSAPP_AUTOMATION_ENABLED:enabled?'true':'false'},pause:async()=>{}});
 return {db,b,sent,files,owner:{id:1,role:'admin'},unfail:()=>fail=false};
}
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(20)]).toString('base64');
test('Evolution envia mídia em base64 pela instância',async()=>{
 const calls=[],c=new EvolutionClient({url:'https://evo.test',key:'k',instance:'Emerson',fetchImpl:async(url,o)=>{calls.push({url,body:JSON.parse(o.body)});return {ok:true,json:async()=>({key:{id:'x'}})};}});
 await c.sendMedia('64999991234',{kind:'image',mime:'image/png',name:'a.png',data:'AAA',caption:'Oi'});
 assert.equal(calls[0].url,'https://evo.test/message/sendMedia/Emerson');assert.deepEqual(calls[0].body,{number:'5564999991234',mediatype:'image',mimetype:'image/png',caption:'Oi',media:'AAA',fileName:'a.png'});
});
test('somente o primeiro administrador usa comunicados',async t=>{
 const {b}=await fixture(t);
 assert.equal(await b.owner({id:1,role:'admin'}),true);assert.equal(await b.owner({id:5,role:'admin'}),false);assert.equal(await b.owner({id:2,role:'guardian'}),false);
 await assert.rejects(b.overview({id:5,role:'admin',team_role:'admin'}),/exclusivos/);await assert.rejects(b.create({id:2,role:'guardian'},{text:'x',audience:'guardians'}),/exclusivos/);
});
test('destinatários: principais, todos e escolhidos; ignora quem não tem WhatsApp; personaliza o nome',async t=>{
 const {b,sent,owner,db}=await fixture(t);
 assert.equal((await b.create(owner,{text:'Olá, {nome}!',audience:'primary'})).queued,2);
 assert.equal((await b.create(owner,{text:'Todos',audience:'guardians'})).queued,2);
 assert.deepEqual(await b.create(owner,{text:'Só',audience:'selected',userIds:[2,4]}),{id:(await db.one("SELECT id FROM broadcasts WHERE body='Só'")).id,queued:1,skipped:1});
 await assert.rejects(b.create(owner,{text:'x',audience:'selected',userIds:[6]}),/não encontrado/);
 await b.tick();
 assert.equal(sent.length,5);assert.deepEqual(sent.filter(s=>s.text.startsWith('Olá')).map(s=>s.text).sort(),['Olá, Ana!','Olá, Bruno!']);
 const o=await b.overview(owner);assert.equal(o.history.length,3);assert.ok(o.history.every(h=>h.counts.sent===h.deliveries.length));assert.equal(o.recipients.find(r=>r.id===4).whatsappEnding,null);
 await b.tick();assert.equal(sent.length,5);
});
test('anexo validado pelo conteúdo, guardado e enviado como legenda',async t=>{
 const {b,sent,files,owner}=await fixture(t);
 await assert.rejects(b.create(owner,{text:'',audience:'guardians',media:{name:'x.exe',data:Buffer.from('MZ....').toString('base64')}}),/foto|vídeo|PDF/);
 await assert.rejects(b.create(owner,{text:'',audience:'guardians'}),/Escreva/);
 await assert.rejects(b.create(owner,{text:'a'.repeat(1001),audience:'guardians',media:{name:'f.png',data:png}}),/1.000/);
 await b.create(owner,{text:'Foto de {nome}',audience:'selected',userIds:[2],media:{name:'../f.png',data:png}});
 assert.equal(files.size,1);await b.tick();
 assert.equal(sent[0].kind,'image');assert.equal(sent[0].mime,'image/png');assert.equal(sent[0].caption,'Foto de Ana');assert.equal(sent[0].name,'..f.png');assert.equal(sent[0].data,png);
});
test('envio incerto exige conferência; nova tentativa e cancelamento',async t=>{
 const {b,sent,owner,unfail,db}=await fixture(t,{uncertain:true});
 const {id}=await b.create(owner,{text:'Oi',audience:'primary'});await b.tick();
 const rows=await db.all('SELECT id,status FROM broadcast_deliveries');assert.ok(rows.every(r=>r.status==='needs_review'));
 unfail();await b.tick();assert.equal(sent.length,0);
 await assert.rejects(b.retry(owner,rows[0].id,false),/Confirme/);await b.retry(owner,rows[0].id,true);await b.tick();assert.equal(sent.length,1);
 const second=await b.create(owner,{text:'Depois',audience:'guardians'});assert.equal((await b.cancel(owner,second.id)).cancelled,2);await b.tick();assert.equal(sent.length,1);
 assert.ok(id);
});
test('automação desativada mantém a fila sem enviar',async t=>{
 const {b,sent,owner,db}=await fixture(t,{enabled:false});
 await b.create(owner,{text:'Oi',audience:'primary'});await b.tick();assert.equal(sent.length,0);
 assert.equal((await db.all("SELECT id FROM broadcast_deliveries WHERE status='pending'")).length,2);
});
