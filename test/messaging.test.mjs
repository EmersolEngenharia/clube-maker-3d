import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDatabase} from '../db.mjs';
import {createBilling} from '../payments/billing.mjs';
import {createAutomation} from '../messaging/automation.mjs';
import {EvolutionClient,whatsappNumber,payerDocument,EvolutionError} from '../messaging/evolution.mjs';
import {familyReport,previousMonth} from '../messaging/reports.mjs';
const fail=(m,status=400)=>{throw Object.assign(new Error(m),{status});},str=(v)=>v,integer=(v)=>v;
async function fixture(t,{annual=false,uncertain=false}={}){
 const data=await mkdtemp(join(tmpdir(),'maker-whatsapp-')),db=await createDatabase({data});t.after(async()=>{await db.close();await rm(data,{recursive:true,force:true});});
 await db.transaction(async()=>{await db.run("INSERT INTO families(id,name,plan,created) VALUES(1,'Família Um',?,'2026-10-31T12:00:00Z')",annual?'annual':'monthly');await db.run("INSERT INTO users(id,email,name,password,role,family_id) VALUES(1,'a@test.example','Admin','h','admin',NULL)");await db.run("INSERT INTO users(id,email,name,password,role,family_id) VALUES(2,'g@test.example','Principal','h','guardian',1)");await db.run("INSERT INTO users(id,email,name,password,role,family_id) VALUES(3,'other@test.example','Outro','h','guardian',1)");await db.run("INSERT INTO guardian_contacts VALUES(2,'5564999991234')");await db.run("INSERT INTO guardian_contacts VALUES(3,'5564999995678')");});
 const sent=[],created=[],invoices=[];let date=new Date('2026-10-31T13:00:00Z'),sendFail=uncertain;
 const provider={id:'asaas',createCharge:async input=>{created.push(input);const p={id:'pay_first',externalReference:input.subscriptionId,invoiceUrl:'https://www.asaas.com/i/first',dueDate:'2026-10-31',status:'PENDING',value:input.amountCents/100};invoices.push(p);return {gatewayChargeId:p.id,checkoutUrl:p.invoiceUrl,...(annual?{}:{gatewaySubscriptionId:'sub_1'})};}};
 const evo={configured:true,diagnostic:async()=>({connected:true}),sendText:async(number,text)=>{if(sendFail)throw new EvolutionError('lost',{uncertain:true});sent.push({number,text});return {messageId:'msg_'+sent.length};}};
 const asaas={call:async path=>path.startsWith('/subscriptions/')?{data:invoices,hasMore:false}:invoices.find(p=>path.endsWith('/'+p.id))};
 let automation;const billing=createBilling({db,fail,str,integer,config:async()=>({monthly:15000,annual:150000}),provider,env:{ASAAS_ENV:'sandbox'},onCharge:c=>automation.onCharge(c)});
 automation=createAutomation({db,billing,asaas,evolution:evo,env:{WHATSAPP_AUTOMATION_ENABLED:'true',PUBLIC_ORIGIN:'https://maker.test'},clock:()=>date,fail});
 await db.transaction(()=>automation.enrolled(1,2,{document:'52998224725',whatsapp:'64999991234',plan:annual?'annual':'monthly',installments:12}));
 return {db,billing,automation,created,sent,invoices,at:v=>{date=new Date(v);},unfail:()=>sendFail=false,admin:{id:1,role:'admin'},guardian:{id:2,role:'guardian',family_id:1}};
}
test('Evolution v2 usa instância, apikey privada e resposta confirmada; documentos e números válidos',async()=>{
 assert.equal(whatsappNumber('(64) 99999-1234'),'5564999991234');assert.equal(whatsappNumber('+55 55 99999-1234'),'5555999991234');assert.equal(whatsappNumber('6433331234'),null);assert.equal(payerDocument('529.982.247-25'),'52998224725');assert.equal(payerDocument('45.356.855/0001-98'),'45356855000198');assert.equal(payerDocument('11111111111'),null);
 const calls=[],client=new EvolutionClient({url:'https://evo.test',key:'secret',instance:'Emerson',fetchImpl:async(url,options)=>{calls.push({url,...options});return {ok:true,json:async()=>options.method==='GET'?{instance:{state:'open'}}:{key:{id:'msg'}}};}});
 assert.equal((await client.diagnostic()).connected,true);await client.sendText('64999991234','Olá');assert.equal(calls[1].url,'https://evo.test/message/sendText/Emerson');assert.equal(calls[1].headers.apikey,'secret');assert.deepEqual(JSON.parse(calls[1].body),{number:'5564999991234',text:'Olá',linkPreview:false});
});
test('cadastro emite PIX com vencimento imediato e envia somente ao principal; mensal e D+1 sem duplicação',async t=>{
 const f=await fixture(t);await f.automation.tick();await f.automation.tick();assert.equal(f.created.length,1);assert.equal(f.created[0].method,'pix_recurring');assert.match(f.created[0].dueDate,/^\d{4}-\d{2}-\d{2}$/);assert.equal(f.sent.length,1);assert.equal(f.sent[0].number,'5564999991234');assert.match(f.sent[0].text,/Equipe Financeiro/);
 f.at('2026-11-01T11:59:00Z');await f.automation.tick();assert.equal(f.sent.length,1);f.at('2026-11-01T12:00:00Z');await f.automation.tick();await f.automation.tick();assert.equal(f.sent.length,3);assert.equal(f.sent.filter(s=>s.text.includes('venceu ontem')).length,1);assert.equal(f.sent.filter(s=>s.text.includes('Resumo de 10/2026')).length,1);
 f.invoices[0].status='RECEIVED';f.invoices.push({id:'pay_next',externalReference:f.invoices[0].externalReference,invoiceUrl:'https://www.asaas.com/i/next',dueDate:'2026-11-30',status:'PENDING'});f.at('2026-11-30T12:00:00Z');await f.automation.tick();await f.automation.tick();assert.equal(f.sent.filter(s=>s.text.includes('/i/next')).length,1);assert.equal(f.created.length,1);
});
test('envio incerto exige revisão e não repete automaticamente, mesmo após reinício',async t=>{
 const f=await fixture(t,{uncertain:true});await f.automation.tick();assert.equal((await f.db.one('SELECT status FROM whatsapp_outbox')).status,'needs_review');f.unfail();await f.automation.tick();assert.equal(f.sent.length,0);const j=await f.db.one('SELECT id FROM whatsapp_outbox');await assert.rejects(f.automation.retry(f.guardian,j.id,true),e=>e.status===403);await f.automation.retry(f.admin,j.id,true);await f.automation.tick();assert.equal(f.sent.length,1);
});
test('anual é uma compra parcelada, sem renovar automaticamente; especial não cobra',async t=>{
 const f=await fixture(t,{annual:true});await f.automation.tick();assert.equal(f.created[0].method,'card_installments');assert.equal(f.created[0].installments,12);assert.equal(f.sent.length,1);
 await f.db.transaction(()=>f.db.run("UPDATE billing_contracts SET status='active',current_period_end='2027-10-31'"));f.invoices[0].status='CONFIRMED';f.at('2027-11-01T12:00:00Z');await f.automation.tick();assert.equal((await f.db.one('SELECT state FROM family_automation')).state,'renewal');assert.equal(f.created.length,1);assert.equal(f.sent.filter(s=>s.text.includes('Escolha novamente')).length,1);
});
test('condição especial e dados faltantes impedem emissão; controles só do principal ou financeiro',async t=>{
 const f=await fixture(t);await f.automation.save(f.admin,{familyId:1,specialCondition:true});await f.automation.tick();assert.equal(f.created.length,0);assert.equal(f.sent.length,0);await assert.rejects(f.automation.save({id:3,role:'guardian',family_id:1},{familyId:1,billingEnabled:false}),e=>e.status===403);await assert.rejects(f.automation.overview({id:5,role:'learner',family_id:1}),e=>e.status===403);
 await f.automation.save(f.admin,{familyId:1,specialCondition:false});await f.db.transaction(()=>f.db.run("UPDATE family_automation SET document=''"));await f.automation.tick();assert.equal(f.created.length,0);assert.match((await f.db.one('SELECT last_error FROM family_automation')).last_error,/Complete/);
});
test('visão da automação lê todas as famílias de uma vez e respeita o escopo do responsável',async t=>{
 const f=await fixture(t);await f.db.transaction(async()=>{await f.db.run("INSERT INTO families(id,name,plan,created) VALUES(2,'Família Dois','annual','2026-10-31T12:00:00Z')");await f.db.run("INSERT INTO users(id,email,name,password,role,family_id) VALUES(4,'d@test.example','Dois','h','guardian',2)");});
 const all=await f.automation.overview(f.admin);assert.deepEqual(all.families.map(x=>[x.familyId,x.name,x.plan,x.primaryGuardianId]),[[1,'Família Um','monthly',2],[2,'Família Dois','annual',4]]);
 assert.deepEqual(all.families[0].guardians.map(g=>g.id),[2,3]);assert.equal(all.families[0].guardians[0].whatsapp,'5564999991234');assert.ok(!('family_id' in all.families[0].guardians[0]));assert.equal(all.families[0].documentEnding,'4725');assert.equal(all.canManage,true);
 const own=await f.automation.overview(f.guardian);assert.deepEqual(own.families.map(x=>x.familyId),[1]);assert.deepEqual(own.families[0].guardians.map(g=>g.id),[2,3]);assert.equal(own.canManage,false);
 assert.deepEqual(JSON.parse(JSON.stringify(own.families[0])),JSON.parse(JSON.stringify({...await f.db.transaction(()=>f.automation.settings(f.guardian,1)),name:'Família Um',plan:'monthly'})));
});
test('relatório considera despesas do clube uma única vez, estornos, participantes e mês anterior',async t=>{
 const f=await fixture(t);await f.db.transaction(async()=>{await f.db.run("INSERT INTO participants(id,family_id,name) VALUES(1,1,'Ana')");for(const [id,scope,kind,cat,value]of [[1,'family','income','sales',30000],[2,'family','expense','supplies',5000],[3,'club','income','membership',15000],[4,'family','expense','supplies',9999]]){await f.db.run('INSERT INTO cash_entries(id,scope,family_id,kind,category,description,cents,entry_date,created,voided_at) VALUES(?,?,1,?,?,?,?,?,?,?)',id,scope,kind,cat,'Teste',value,'2026-10-12','2026-10-12T12:00:00Z',id===4?'2026-10-13':null);}await f.db.run('INSERT INTO cash_attributions(entry_id,participant_id) VALUES(1,1)');});
 assert.equal(previousMonth('2027-01-01'),'2026-12');const r=await f.db.withRequest(()=>familyReport(f.db,1,'2026-10'));assert.equal(r.income,30000);assert.equal(r.expenses,20000);assert.equal(r.club,15000);assert.equal(r.result,10000);assert.match(r.text,/Ana/);assert.match(r.text,/não representa necessariamente o lucro/);
});
