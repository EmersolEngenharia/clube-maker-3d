import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDatabase} from '../db.mjs';
import {createBilling} from '../payments/billing.mjs';
import {createOperations} from '../operations.mjs';
import {localDate} from '../quota.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});},str=(v,label,max)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail(label);return v.trim();},integer=(v,label,min,max)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail(label);return v;};
async function fixture(t,overrides={}){
 const data=await mkdtemp(join(tmpdir(),'maker-billing-')),db=await createDatabase({data});t.after(async()=>{await db.close();await rm(data,{recursive:true,force:true});});
 await db.transaction(async()=>{await db.run("INSERT INTO users(id,email,name,password,role) VALUES(1,'admin@test.example','Admin','hash','admin')");await db.run("INSERT INTO families(id,name,created) VALUES(1,'Família',?)",new Date().toISOString());await db.run("INSERT INTO users(id,email,name,password,role,family_id) VALUES(2,'g@test.example','Responsável','hash','guardian',1)");});
 let creates=0,cancels=0;const provider={id:'asaas',createCharge:async input=>{creates++;return {provider:'asaas',gatewayChargeId:'pay_1',...(input.method.endsWith('recurring')?{gatewaySubscriptionId:'sub_1'}:{}),...(input.method==='card_installments'?{gatewayInstallmentId:'inst_1'}:{}),checkoutUrl:'https://www.asaas.com/i/test',status:'pending'};},cancelSubscription:async()=>{cancels++;},cancelCharge:async()=>{cancels++;},...overrides.provider};
 const cfg=async()=>({monthly:15000,annual:150000}),billing=createBilling({db,...{fail,str,integer,config:cfg},provider,notify:overrides.notify,env:{ASAAS_ENV:'sandbox'},...overrides.service});
 const admin={id:1,role:'admin',name:'Admin',email:'admin@test.example'},g={id:2,role:'guardian',family_id:1,name:'Responsável',email:'g@test.example'},input={familyId:1,requestKey:'request-one',method:'pix_recurring',customer:{name:'Responsável',email:'g@test.example',document:'12345678909'}},event=(c,extra={})=>({type:'payment.paid',gatewayChargeId:'pay_1',gatewaySubscriptionId:'sub_1',externalReference:c.id,amountCents:15000,paidDate:localDate(),...extra});
 return {db,billing,admin,g,input,event,creates:()=>creates,cancels:()=>cancels,cfg};
}
test('reentrega, confirmado/recebido e reinicialização não duplicam receita nem vigência',async t=>{
 const f=await fixture(t,{notify:async()=>{throw new Error('canal fora');}}),c=await f.billing.create(f.input,f.g);await f.billing.create(f.input,f.g);assert.equal(f.creates(),1);
 await f.billing.handleEvent(f.event(c,{amountCents:undefined}));assert.equal((await f.db.all('SELECT * FROM billing_receipts')).length,0);
 const replies=await Promise.all([f.billing.handleEvent(f.event(c)),f.billing.handleEvent(f.event(c))]);assert.equal(replies.filter(x=>x.duplicate).length,1);
 const before=await f.db.one('SELECT * FROM billing_contracts WHERE id=?',c.id);assert.equal(before.status,'active');assert.ok(before.current_period_end>localDate());
 await f.billing.handleEvent(f.event(c));assert.equal((await f.db.one('SELECT * FROM billing_contracts WHERE id=?',c.id)).current_period_end,before.current_period_end);
 const ops=createOperations({db:f.db});await f.db.transaction(()=>ops.backfill());assert.equal((await f.db.all('SELECT * FROM cash_entries')).length,1);assert.equal((await f.db.all('SELECT * FROM payments')).length,1);
 await f.billing.handleEvent(f.event(c,{type:'payment.failed'}));assert.equal((await f.db.one('SELECT status FROM billing_contracts WHERE id=?',c.id)).status,'active');
 await f.billing.cancel(c.id,f.g);assert.equal(f.cancels(),1);assert.equal((await f.db.one('SELECT status FROM billing_contracts WHERE id=?',c.id)).status,'cancelled');
});
test('rollback integral deixa reentrega limpa após falha parcial',async t=>{
 const f=await fixture(t);let failOnce=true;const wrapped={...f.db,run:async(sql,...args)=>{if(sql.startsWith('INSERT INTO billing_receipts')&&failOnce){failOnce=false;throw new Error('falha simulada');}return f.db.run(sql,...args);}};
 const billing=createBilling({db:wrapped,fail,str,integer,config:f.cfg,provider:{id:'asaas',createCharge:async()=>({gatewayChargeId:'pay_1',gatewaySubscriptionId:'sub_1'})},env:{ASAAS_ENV:'sandbox'}}),c=await billing.create(f.input,f.g);
 await assert.rejects(billing.handleEvent(f.event(c)));assert.equal((await f.db.all('SELECT * FROM payments')).length,0);assert.equal((await f.db.all('SELECT * FROM cash_entries')).length,0);
 await billing.handleEvent(f.event(c));assert.equal((await f.db.all('SELECT * FROM cash_entries')).length,1);
});
test('estorno é terminal, não reativa em evento fora de ordem e preserva financeiro',async t=>{
 const f=await fixture(t),c=await f.billing.create(f.input,f.g);await f.billing.handleEvent(f.event(c));await f.billing.handleEvent(f.event(c,{type:'payment.refunded'}));await f.billing.handleEvent(f.event(c));
 assert.equal((await f.db.one('SELECT status FROM billing_receipts')).status,'refunded');assert.ok((await f.db.one('SELECT voided_at FROM cash_entries')).voided_at);assert.equal((await f.db.one('SELECT status FROM billing_contracts')).status,'refunded');
});
test('parcelas não acrescentam uma anuidade por parcela; cada valor efetivo só entra uma vez',async t=>{
 const f=await fixture(t),c=await f.billing.create({...f.input,plan:'annual',method:'card_installments',installments:12},f.g);await f.billing.handleEvent(f.event(c,{gatewaySubscriptionId:undefined,gatewayInstallmentId:'inst_1',amountCents:12500}));const end=(await f.db.one('SELECT current_period_end FROM billing_contracts')).current_period_end;
 await f.billing.handleEvent(f.event(c,{gatewayChargeId:'pay_2',gatewaySubscriptionId:undefined,gatewayInstallmentId:'inst_1',amountCents:12500}));assert.equal((await f.db.one('SELECT current_period_end FROM billing_contracts')).current_period_end,end);assert.equal((await f.db.one('SELECT SUM(cents) total FROM cash_entries')).total,25000);
});
test('falta de credencial cria solicitação manual, aprendiz não cobra e outra família não acessa',async t=>{
 const f=await fixture(t,{service:{provider:undefined,env:{}}});await assert.rejects(f.billing.create(f.input,{...f.g,role:'learner'}),e=>e.status===403);const c=await f.billing.create(f.input,f.g);assert.equal(c.provider,'manual');assert.equal(f.creates(),0);
 await assert.rejects(f.billing.manualPaid(c.id,f.g),e=>e.status===403);await f.billing.manualPaid(c.id,f.admin);await f.billing.manualPaid(c.id,f.admin);assert.equal((await f.db.all('SELECT * FROM payments')).length,1);
 await assert.rejects(f.billing.refresh(c.id,{...f.g,family_id:2}),e=>e.status===403);assert.equal((await f.billing.diagnostic(f.admin)).fallback,true);
});
test('falha de emissão não repete POST; conferência humana libera tentativa sem cobrança',async t=>{
 const f=await fixture(t,{provider:{createCharge:async()=>{throw Object.assign(new Error('resposta incerta'),{uncertain:true});},findExisting:async()=>null}});
 await assert.rejects(f.billing.create(f.input,f.g));const c=await f.db.one('SELECT * FROM billing_contracts');assert.equal(c.status,'needs_review');
 const retry=await f.billing.create(f.input,f.g);assert.equal(retry.id,c.id);assert.equal(retry.status,'needs_review');await assert.rejects(f.billing.resolve(c.id,f.g,true),e=>e.status===403);
 await f.billing.resolve(c.id,f.admin,true);assert.equal((await f.db.one('SELECT status FROM billing_contracts')).status,'cancelled');assert.equal((await f.db.all('SELECT * FROM cash_entries')).length,0);
});
test('webhook recebido antes da resposta da criação não é sobrescrito',async t=>{
 const f=await fixture(t);let billing;const provider={id:'asaas',createCharge:async input=>{await billing.handleEvent({type:'payment.paid',gatewayChargeId:'pay_1',gatewaySubscriptionId:'sub_1',externalReference:input.subscriptionId,amountCents:15000});return {gatewayChargeId:'pay_1',gatewaySubscriptionId:'sub_1'};}};
 billing=createBilling({db:f.db,fail,str,integer,config:f.cfg,provider,env:{ASAAS_ENV:'sandbox'}});const c=await billing.create(f.input,f.g);assert.equal(c.status,'active');assert.equal((await f.db.all('SELECT * FROM cash_entries')).length,1);
});
test('PIX de projeto concilia sem duplicar no reinício e estorno reabre o pagamento',async t=>{
 const f=await fixture(t);await f.db.transaction(()=>f.db.run("INSERT INTO projects(id,family_id,name,description,participant,kind,size,color,quantity,status,charge,created,updated) VALUES(1,1,'Peça','Teste','Ana','idea','Pequena','Azul',1,'ready',600,?,?)",new Date().toISOString(),new Date().toISOString()));
 const c=await f.billing.create({...f.input,projectId:1,purpose:'project',method:'pix_cash'},f.g);assert.equal(c.amountCents,600);const event=f.event(c,{amountCents:600,gatewaySubscriptionId:undefined});await f.billing.handleEvent(event);
 assert.equal((await f.db.one('SELECT paid FROM projects WHERE id=1')).paid,1);assert.equal((await f.db.all('SELECT * FROM payments')).length,0);await f.db.transaction(()=>createOperations({db:f.db}).backfill());assert.equal((await f.db.all('SELECT * FROM cash_entries')).length,1);
 await f.billing.handleEvent({...event,type:'payment.refunded'});assert.equal((await f.db.one('SELECT paid FROM projects WHERE id=1')).paid,0);assert.ok((await f.db.one('SELECT voided_at FROM cash_entries')).voided_at);
});
