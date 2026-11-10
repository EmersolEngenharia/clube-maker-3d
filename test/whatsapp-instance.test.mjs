import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDatabase} from '../db.mjs';
import {createAutomation} from '../messaging/automation.mjs';
import {createBroadcasts} from '../messaging/broadcasts.mjs';
import {EvolutionClient} from '../messaging/evolution.mjs';
test('a instância que envia o WhatsApp pode ser trocada pela administração, depois de conferida',async t=>{
 const data=await mkdtemp(join(tmpdir(),'maker-wa-')),db=await createDatabase({data});t.after(async()=>{await db.close();await rm(data,{recursive:true,force:true});});
 await db.transaction(async()=>{await db.run("INSERT INTO users(id,email,name,password,role) VALUES(1,'a@x.test','Equipe','h','admin')");await db.run("INSERT INTO families(id,name,created) VALUES(1,'F','2026-01-01')");await db.run("INSERT INTO users(id,email,name,password,role,family_id) VALUES(2,'g@x.test','Ana','h','guardian',1)");await db.run("INSERT INTO guardian_contacts(user_id,whatsapp) VALUES(2,'64999990000')");});
 const states={Emerson:'open',Atendimento:'open',Desligada:'close'},sent=[];
 const fetchImpl=async(url,init)=>{const path=new URL(url).pathname,name=decodeURIComponent(path.split('/').pop());if(!(name in states))return new Response('{}',{status:404});
  if(path.startsWith('/instance/connectionState/'))return Response.json({instance:{state:states[name]}});
  if(path.startsWith('/message/sendText/')){sent.push({instance:name,...JSON.parse(init.body)});return Response.json({key:{id:'m'+sent.length}});}
  return new Response('{}',{status:404});};
 const env={EVOLUTION_URL:'https://evo.test',EVOLUTION_API_KEY:'k',EVOLUTION_INSTANCE:'Emerson',WHATSAPP_AUTOMATION_ENABLED:'true'};
 const evolution=new EvolutionClient({url:env.EVOLUTION_URL,key:env.EVOLUTION_API_KEY,instance:env.EVOLUTION_INSTANCE,fetchImpl});
 const automation=createAutomation({db,billing:{},asaas:{},env,evolution}),broadcasts=createBroadcasts({db,storage:{},env,evolution,pause:async()=>{}});
 const admin={id:1,role:'admin'},guardian={id:2,role:'guardian',family_id:1};
 assert.equal(await automation.loadInstance(),'Emerson');
 await assert.rejects(automation.setInstance(guardian,'Atendimento'),e=>e.status===403);
 await assert.rejects(automation.setInstance(admin,'Desligada'),/não está conectada/);
 await assert.rejects(automation.setInstance(admin,'Outra'),/Não consegui acessar/);
 await assert.rejects(automation.setInstance(admin,'x/../y'),/nome da instância/);
 assert.equal(evolution.instance,'Emerson');
 assert.deepEqual(await automation.setInstance(admin,'Atendimento'),{instance:'Atendimento',connected:true,default:'Emerson'});
 // Every sender shares the client: a family notice now leaves from the new instance.
 await broadcasts.notifyFamily({authorId:1,familyId:1,text:'Olá, {nome}! Teste.'});await broadcasts.tick();
 assert.deepEqual(sent.map(m=>[m.instance,m.number,m.text]),[['Atendimento','5564999990000','Olá, Ana! Teste.']]);
 assert.equal((await automation.diagnostic(admin)).instance,'Atendimento');
 // The choice survives a restart and is kept when the calendar rules are saved elsewhere.
 const restarted=new EvolutionClient({url:env.EVOLUTION_URL,key:'k',instance:'Emerson',fetchImpl});assert.equal(await createAutomation({db,billing:{},asaas:{},env,evolution:restarted}).loadInstance(),'Atendimento');
 assert.ok(await db.one("SELECT id FROM audit_log WHERE action='whatsapp.instance' AND target='Atendimento'"));
});
