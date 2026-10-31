import test from 'node:test';
import assert from 'node:assert/strict';
import {AsaasProvider,celularAsaas,corpoDeParcelamento,montarSplit,tomorrow} from '../payments/asaas.mjs';
const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
function gateway(fn){const calls=[];return {calls,provider:new AsaasProvider({key:'test-key',webhookToken:'secret-token',environment:'sandbox',clock:()=>new Date('2026-11-01T01:00:00Z'),fetchImpl:async(url,options)=>{const call={path:new URL(url).pathname.replace('/v3','')+new URL(url).search,...options,body:options.body?JSON.parse(options.body):undefined};calls.push(call);return fn(call);}})};}
const base={subscriptionId:'our-reference',amountCents:15000,customer:{name:'Responsável',email:'guardian@example.test',document:'12345678909',phone:'+5564999991234'}};
test('telefone brasileiro, incluindo DDD 55; parcelas e split em centavos',()=>{
 assert.equal(celularAsaas('64999991234'),'64999991234');assert.equal(celularAsaas('+55 64 99999-1234'),'64999991234');assert.equal(celularAsaas('55999991234'),'55999991234');
 for(const v of['6433331234','',undefined])assert.equal(celularAsaas(v),undefined);
 assert.deepEqual(corpoDeParcelamento(1,15000),{});assert.deepEqual(corpoDeParcelamento(0,15000),{});assert.deepEqual(corpoDeParcelamento(undefined,15000),{});
 for(let n=2;n<=12;n++)assert.deepEqual(corpoDeParcelamento(n,15001),{installmentCount:n,totalValue:150.01});
 assert.deepEqual(montarSplit([{walletId:'a',amountCents:1234},{walletId:'',amountCents:100},{walletId:'b',amountCents:0}]),[{walletId:'a',fixedValue:12.34}]);
 assert.equal(tomorrow(new Date('2026-11-01T01:00:00Z')),'2026-11-01');
});
test('webhook autentica antes de parsear; eventos e zero não queimam recebimento',async()=>{
 const {provider}=gateway(()=>response({})),headers=new Headers({'asaas-access-token':'secret-token'});
 await assert.rejects(provider.parseWebhook('{',new Headers({'asaas-access-token':'wrong'})),e=>e.status===401);
 await assert.rejects(provider.parseWebhook('{',headers),e=>e.status===400);
 for(const [event,type]of Object.entries({PAYMENT_RECEIVED:'payment.paid',PAYMENT_CONFIRMED:'payment.paid',PAYMENT_OVERDUE:'payment.failed',PAYMENT_REFUNDED:'payment.refunded',PAYMENT_CHARGEBACK_REQUESTED:'payment.refunded',OTHER_EVENT:'unknown'})){
  const p=await provider.parseWebhook(JSON.stringify({event,payment:{id:'pay_1',value:123.45,externalReference:'ours'}}),headers);assert.equal(p.type,type);assert.equal(p.amountCents,12345);
 }
 for(const value of[undefined,0,-1,1.234])assert.equal((await provider.parseWebhook(JSON.stringify({event:'PAYMENT_RECEIVED',payment:{value}}),headers)).amountCents,undefined);
});
test('reutiliza cliente e completa CPF; não envia celular inválido',async()=>{
 const {provider,calls}=gateway(c=>c.method==='GET'?response({data:[{id:'cus_1'}]}):response({id:'cus_1'}));
 assert.equal(await provider.garantirCliente({externalReference:'ours',name:'Nome',email:'n@test.example',cpfCnpj:'12345678909',mobilePhone:'6433331234'}),'cus_1');
 assert.equal(calls.length,2);assert.equal(calls[1].path,'/customers/cus_1');assert.equal(calls[1].body.cpfCnpj,'12345678909');assert.equal('mobilePhone' in calls[1].body,false);
 const fresh=gateway(c=>c.method==='GET'?response({data:[]}):response({id:'cus_new'}));assert.equal(await fresh.provider.garantirCliente({externalReference:'ours',name:'Nome'}),'cus_new');assert.equal(fresh.calls[1].path,'/customers');
});
test('quatro métodos, fatura da assinatura, 1× sem installmentCount e 12× com totalValue',async()=>{
 for(const [method,n]of[['pix_cash',undefined],['pix_recurring',undefined],['card_recurring',undefined],['card_installments',1],['card_installments',12]]){
  const {provider,calls}=gateway(c=>{
   if(c.method==='GET'&&c.path.startsWith('/customers?'))return response({data:[]});
   if(c.path==='/customers')return response({id:'cus_1'});
   if(c.method==='GET'&&c.path.startsWith('/subscriptions/sub_1/payments'))return response({data:[{id:'pay_first',invoiceUrl:'https://www.asaas.com/i/test'}]});
   if(c.method==='GET')return response({data:[]});
   if(c.path==='/subscriptions')return response({id:'sub_1'});
   return response({id:'pay_1',invoiceUrl:'https://www.asaas.com/i/test',status:'PENDING'});
  });
  const r=await provider.createCharge({...base,method,installments:n});const creation=calls.find(c=>c.method==='POST'&&['/payments','/subscriptions'].includes(c.path));
  assert.equal(creation.headers.access_token,'test-key');assert.ok(creation.headers['User-Agent']);assert.equal(creation.body.value,150);
  if(method.endsWith('recurring')){assert.equal(creation.path,'/subscriptions');assert.equal(creation.body.cycle,'MONTHLY');assert.equal(creation.body.nextDueDate,'2026-11-01');assert.equal(r.gatewayChargeId,'pay_first');assert.equal(r.gatewaySubscriptionId,'sub_1');}
  if(n===1)assert.equal('installmentCount' in creation.body,false);if(n===12){assert.equal(creation.body.installmentCount,12);assert.equal(creation.body.totalValue,150);}
  assert.equal(creation.body.billingType,method.startsWith('pix_')?'PIX':'CREDIT_CARD');assert.equal(r.checkoutUrl,'https://www.asaas.com/i/test');
 }
});
test('fatura indisponível não recria assinatura; cancelamento 404 é sucesso e erros não vazam chave',async()=>{
 const g=gateway(c=>c.method==='DELETE'?response({errors:[{description:'not found'}]},404):c.path.startsWith('/subscriptions/sub_1/payments')?response({errors:[{description:'Unavailable'}]},500):c.method==='GET'?response({data:[]}):response({id:c.path==='/customers'?'cus_1':'sub_1'}));
 const result=await g.provider.createCharge({...base,method:'pix_recurring'});assert.equal(result.gatewaySubscriptionId,'sub_1');assert.equal(result.checkoutUrl,undefined);await g.provider.cancelSubscription('sub_1');await g.provider.cancelCharge('pay_1');
 const bad=gateway(()=>response({errors:[{description:'test-key secret-token refused'}]},403));await assert.rejects(bad.provider.call('/customers'),e=>!e.message.includes('test-key')&&!e.message.includes('secret-token'));
});
