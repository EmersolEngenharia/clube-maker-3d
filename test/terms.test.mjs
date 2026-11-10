import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDatabase} from '../db.mjs';
import {createTerms,draftText} from '../terms.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});},str=(v,label,max=500)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail(label);return v.trim();};
const cfg={monthly:15000,annual:150000,hours:12,extra:600,markup:20,materials:[]};
test('rascunho inicial usa os valores do clube e não é publicado sozinho',()=>{
 const text=draftText(cfg);assert.match(text,/R\$\s150,00/);assert.match(text,/R\$\s1\.500,00/);assert.match(text,/12 horas de impressão/);assert.match(text,/R\$\s6,00 por hora/);assert.match(text,/acrescido de 20%/);assert.doesNotMatch(text,/\{[a-z_]+\}/);
});
test('regulamento: publicação, aceite do responsável, bloqueio e nova versão',async t=>{
 const data=await mkdtemp(join(tmpdir(),'maker-terms-')),db=await createDatabase({data});t.after(async()=>{await db.close();await rm(data,{recursive:true,force:true});});
 await db.transaction(async()=>{await db.run("INSERT INTO users(id,email,name,password,role) VALUES(1,'a@x.test','Equipe','h','admin')");for(const id of [1,2])await db.run('INSERT INTO families(id,name,created) VALUES(?,?,?)',id,'Família '+id,'2026-01-01');await db.run("INSERT INTO users(id,email,name,password,role,family_id) VALUES(2,'g@x.test','Ana','h','guardian',1),(3,'l@x.test','Caio','h','learner',1),(4,'b@x.test','Bia','h','guardian',2)");});
 const sent=[];let now=Date.parse('2026-11-10T12:00:00Z');
 const terms=createTerms({db,fail,str,body:async r=>r.b,json:(res,o)=>{res.out=o;},config:async()=>cfg,broadcasts:{notifyFamily:async m=>{sent.push(m);return {queued:1};}},clock:()=>new Date(now),env:{}});
 const call=(u,path,b)=>db.transaction(async()=>{const res={};if(!await terms.route({b},res,path,b===undefined?'GET':'POST',u))fail('rota',404);return res.out;});
 const admin={id:1,role:'admin',name:'Equipe'},ana={id:2,role:'guardian',family_id:1,name:'Ana'},caio={id:3,role:'learner',family_id:1,name:'Caio'},bia={id:4,role:'guardian',family_id:2,name:'Bia'};
 await db.transaction(()=>terms.seed());await db.transaction(()=>terms.seed());
 // Nothing published yet: nothing is blocked and nobody is asked to accept.
 assert.equal((await call(ana,'/api/terms')).current,null);await db.transaction(()=>terms.require(1));assert.equal(await db.transaction(()=>terms.flag(ana)),null);
 let a=await call(admin,'/api/terms/admin');assert.equal(a.draft.version,1);assert.match(a.draft.body,/## 6\. Segurança e supervisão/);
 await assert.rejects(call(ana,'/api/terms/draft',{title:'X',body:'y'.repeat(60)}),e=>e.status===403);
 await assert.rejects(call(admin,'/api/terms/publish',{}),/Confirme/);
 await call(admin,'/api/terms/draft',{title:'Regulamento',body:a.draft.body+'\n\n## 11. Contato\n\nFale com a equipe pelo WhatsApp.'});
 const p=await call(admin,'/api/terms/publish',{confirmed:true});assert.deepEqual([p.version,p.notified],[1,2]);assert.match(sent[0].text,/foi publicado \(versão 1\)/);assert.match(sent[0].text,/\?regulamento=1/);
 // Published: families without acceptance are blocked; the guardian is asked, the learner only waits.
 await assert.rejects(db.transaction(()=>terms.require(1)),e=>e.status===403);
 assert.deepEqual(await db.transaction(()=>terms.flag(ana)),{version:1,mustAccept:true,familyAccepted:false});
 assert.deepEqual(await db.transaction(()=>terms.flag(caio)),{version:1,mustAccept:false,familyAccepted:false});
 assert.equal(await db.transaction(()=>terms.flag(admin)),null);
 await assert.rejects(call(caio,'/api/terms/accept',{version:1,confirmed:true}),e=>e.status===403);
 await assert.rejects(call(ana,'/api/terms/accept',{version:1,confirmed:false}),/Marque/);
 await assert.rejects(call(ana,'/api/terms/accept',{version:2,confirmed:true}),e=>e.status===409);
 await call(ana,'/api/terms/accept',{version:1,confirmed:true});await call(ana,'/api/terms/accept',{version:1,confirmed:true});
 await db.transaction(()=>terms.require(1));await assert.rejects(db.transaction(()=>terms.require(2)),e=>e.status===403);
 assert.deepEqual(await db.transaction(()=>terms.flag(caio)),{version:1,mustAccept:false,familyAccepted:true});
 a=await call(admin,'/api/terms/admin');assert.deepEqual(a.families.map(f=>[f.name,f.acceptedBy]),[['Família 1','Ana'],['Família 2',null]]);assert.equal(a.versions[0].accepted,1);assert.equal(a.draft,null);
 assert.ok(await db.one("SELECT id FROM audit_log WHERE action='terms.accept' AND target='v1' AND user_id=2"));
 // A new version asks everyone again; the old acceptance stays on record.
 now+=86400000;await call(admin,'/api/terms/draft',{title:'Regulamento',body:'## Novo\n\n'+'Regras atualizadas do clube. '.repeat(3)});await call(admin,'/api/terms/publish',{confirmed:true});
 await assert.rejects(db.transaction(()=>terms.require(1)),e=>e.status===403);assert.equal((await db.transaction(()=>terms.flag(ana))).version,2);
 assert.match(sent.at(-1).text,/foi atualizado \(versão 2\)/);assert.equal(Number((await db.one('SELECT COUNT(*) n FROM terms_acceptances')).n),1);
 assert.equal((await call(bia,'/api/terms')).current.version,2);
});
