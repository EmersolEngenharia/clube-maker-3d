import {createHash,timingSafeEqual} from 'node:crypto';
import {ProviderError,methods,recurring,cents,checkoutURL} from './provider.mjs';
import {localDate} from '../quota.mjs';
export function celularAsaas(value){let n=String(value??'').replace(/\D/g,'');if(n.length===13&&n.startsWith('55'))n=n.slice(2);return n.length===11&&n[2]==='9'?n:undefined;}
export function corpoDeParcelamento(n,value){return !n||n<=1?{}:{installmentCount:n,totalValue:Math.round(value)/100};}
export function montarSplit(rows){return rows.filter(r=>r.walletId&&Number.isSafeInteger(r.amountCents)&&r.amountCents>0).map(r=>({walletId:r.walletId,fixedValue:r.amountCents/100}));}
export function tomorrow(date=new Date()){const today=localDate(date),d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
export function verifyToken(headers,expected){const get=name=>typeof headers.get==='function'?headers.get(name):headers[name];const received=get('asaas-access-token');if(!expected||typeof received!=='string'||!timingSafeEqual(createHash('sha256').update(received).digest(),createHash('sha256').update(expected).digest()))throw new ProviderError('Webhook não autenticado.',401);}
export class AsaasProvider{
 id='asaas';
 constructor({key='',webhookToken='',environment='production',fetchImpl=fetch,clock=()=>new Date()}={}){
  if(!['production','sandbox'].includes(environment))throw new Error('ASAAS_ENV deve ser production ou sandbox.');
  this.key=key.startsWith('$$aact_')?key.slice(1):key;this.token=webhookToken;this.environment=environment;this.fetch=fetchImpl;this.clock=clock;this.base=environment==='production'?'https://api.asaas.com/v3':'https://api-sandbox.asaas.com/v3';
 }
 async call(path,{method='GET',body}={}){
  if(!this.key)throw new ProviderError('Asaas não configurado. Use o recebimento manual.',503);
  if((this.key.includes('$aact_prod_')&&this.environment!=='production')||(this.key.includes('$aact_hmlg_')&&this.environment!=='sandbox'))throw new ProviderError('A chave Asaas não corresponde ao ambiente configurado.',503);
  let response;try{response=await this.fetch(this.base+path,{method,headers:{access_token:this.key,'Content-Type':'application/json','User-Agent':'ClubeMaker3D-Emersol/0.6'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});}catch{throw new ProviderError('Não foi possível confirmar a resposta do Asaas. Confira a cobrança antes de repetir.',502,{uncertain:method!=='GET'});}
  if(response.status===404&&method==='DELETE')return {};
  let data;try{data=await response.json();}catch{if(response.ok&&method==='DELETE')return {};if(response.status===404)throw new ProviderError('Recurso não encontrado no Asaas.',404);throw new ProviderError('O Asaas retornou uma resposta inválida.',502,{uncertain:method!=='GET'});}
  if(!response.ok){const raw=(data.errors||[]).map(e=>e.description).filter(v=>typeof v==='string').join(' · ')||'Operação recusada pelo Asaas.';const message=raw.split(this.key).join('[segredo omitido]').split(this.token||'\0').join('[segredo omitido]').slice(0,600);throw new ProviderError(message,response.status===404?404:502,{uncertain:response.status>=500&&method!=='GET'});}
  return data;
 }
 async garantirCliente(input){
  const found=await this.call('/customers?externalReference='+encodeURIComponent(input.externalReference));
  if(found.data?.[0]?.id){const id=found.data[0].id;if(input.cpfCnpj)await this.call('/customers/'+encodeURIComponent(id),{method:'POST',body:{name:input.name,email:input.email,cpfCnpj:input.cpfCnpj,mobilePhone:celularAsaas(input.mobilePhone)}});return id;}
  const customer=await this.call('/customers',{method:'POST',body:{name:input.name,email:input.email,cpfCnpj:input.cpfCnpj,mobilePhone:celularAsaas(input.mobilePhone),externalReference:input.externalReference,notificationDisabled:false}});if(typeof customer.id!=='string')throw new ProviderError('Resposta do cadastro incompleta. Confira o cliente pela referência.',502,{uncertain:true});return customer.id;
 }
 async firstInvoice(id){try{const list=await this.call('/subscriptions/'+encodeURIComponent(id)+'/payments?limit=1');const first=list.data?.[0];return first?{id:first.id,url:checkoutURL(first.invoiceUrl)}:null;}catch{return null;}}
 async findExisting(reference,method){
  const path=recurring(method)?'/subscriptions':'/payments',list=await this.call(path+'?externalReference='+encodeURIComponent(reference)+'&limit=2');
  if(!list.data?.length)return null;if(list.data.length>1&&!(method==='card_installments'&&list.data[0].installment&&list.data.every(p=>p.installment===list.data[0].installment)))throw new ProviderError('Há mais de uma cobrança para esta referência. Confira o Asaas antes de continuar.',409);
  const item=list.data[0];if(recurring(method)){const first=await this.firstInvoice(item.id);return {provider:this.id,gatewaySubscriptionId:item.id,gatewayChargeId:first?.id||item.id,checkoutUrl:first?.url,status:'pending'};}
  return {provider:this.id,gatewayChargeId:item.id,gatewayInstallmentId:item.installment,checkoutUrl:checkoutURL(item.invoiceUrl),status:['RECEIVED','CONFIRMED'].includes(item.status)?'paid':'pending'};
 }
 async createCharge(input){
  if(!methods.includes(input.method)||!Number.isSafeInteger(input.amountCents)||input.amountCents<=0)throw new ProviderError('Cobrança inválida.',400);
  if(input.method==='card_installments'&&(!Number.isInteger(input.installments??1)||(input.installments??1)<1||input.installments>12))throw new ProviderError('Escolha de 1 a 12 parcelas.',400);
  if(input.installments&&input.method!=='card_installments')throw new ProviderError('Parcelas só se aplicam ao cartão parcelado.',400);
  if(this.environment==='production'){const account=await this.diagnostic();if(account.documentMatch!==true)throw new ProviderError('Não foi possível confirmar o CNPJ Emersol Serviços LTDA na conta Asaas. Confira o diagnóstico antes de emitir cobranças.',409);}
  const existing=await this.findExisting(input.subscriptionId,input.method);if(existing)return existing;
  const customer=await this.garantirCliente({externalReference:input.subscriptionId,name:input.customer.name,email:input.customer.email,cpfCnpj:input.customer.document,mobilePhone:input.customer.phone});
  const split=montarSplit((input.splitRules||[]).map(r=>({walletId:r.recipientId,amountCents:Math.round(input.amountCents*r.percentage/100)})));
  const common={customer,billingType:input.method.startsWith('pix_')?'PIX':'CREDIT_CARD',value:Math.round(input.amountCents)/100,description:input.description||'Participação no Clube Maker 3D Emersol',externalReference:input.subscriptionId,...(split.length?{split}:{})};
  if(recurring(input.method)){const s=await this.call('/subscriptions',{method:'POST',body:{...common,cycle:input.cycle==='YEARLY'?'YEARLY':'MONTHLY',nextDueDate:input.dueDate||tomorrow(this.clock())}});if(typeof s.id!=='string')throw new ProviderError('Resposta da assinatura incompleta. Confira pela referência.',502,{uncertain:true});const first=await this.firstInvoice(s.id);return {provider:this.id,gatewaySubscriptionId:s.id,gatewayChargeId:first?.id||s.id,checkoutUrl:first?.url,status:'pending'};}
  const payment=await this.call('/payments',{method:'POST',body:{...common,dueDate:input.dueDate||tomorrow(this.clock()),...(input.method==='card_installments'?corpoDeParcelamento(input.installments,input.amountCents):{})}});
  if(typeof payment.id!=='string')throw new ProviderError('Resposta da cobrança incompleta. Confira pela referência.',502,{uncertain:true});
  return {provider:this.id,gatewayChargeId:payment.id,gatewayInstallmentId:payment.installment,checkoutUrl:checkoutURL(payment.invoiceUrl),status:['RECEIVED','CONFIRMED'].includes(payment.status)?'paid':'pending'};
 }
 async pixQRCode(chargeId){const q=await this.call('/payments/'+encodeURIComponent(chargeId)+'/pixQrCode');return {payload:typeof q.payload==='string'?q.payload:undefined,encodedImage:typeof q.encodedImage==='string'&&/^[A-Za-z0-9+/=]+$/.test(q.encodedImage)?q.encodedImage:undefined,expirationDate:q.expirationDate};}
 async checkout(result){if(result.gatewaySubscriptionId){const first=await this.firstInvoice(result.gatewaySubscriptionId);return {checkoutUrl:first?.url,gatewayChargeId:first?.id};}const p=await this.call('/payments/'+encodeURIComponent(result.gatewayChargeId));return {checkoutUrl:checkoutURL(p.invoiceUrl)};}
 async cancelSubscription(id){try{await this.call('/subscriptions/'+encodeURIComponent(id),{method:'DELETE'});}catch(e){if(e.status!==404)throw e;}}
 async cancelCharge(id){try{await this.call('/payments/'+encodeURIComponent(id),{method:'DELETE'});}catch(e){if(e.status!==404)throw e;}}
 async parseWebhook(rawBody,headers){
  verifyToken(headers,this.token);let raw;try{raw=JSON.parse(rawBody);}catch{throw new ProviderError('JSON inválido.',400);}
  const p=raw?.payment||{},type=({PAYMENT_RECEIVED:'payment.paid',PAYMENT_CONFIRMED:'payment.paid',PAYMENT_OVERDUE:'payment.failed',PAYMENT_REFUNDED:'payment.refunded',PAYMENT_CHARGEBACK_REQUESTED:'payment.refunded'})[raw?.event]||'unknown';
  return {type,gatewayChargeId:typeof p.id==='string'?p.id:'',amountCents:cents(p.value),externalReference:typeof p.externalReference==='string'?p.externalReference:null,gatewaySubscriptionId:p.subscription,gatewayInstallmentId:p.installment,dueDate:p.dueDate,paidDate:p.paymentDate||p.clientPaymentDate||p.confirmedDate,eventId:raw.id,raw};
 }
 async diagnostic(){let account;try{account=await this.call('/myAccount');}catch(e){if(e.status!==404)throw e;account=await this.call('/myAccount/commercialInfo');}
  if(!account.cpfCnpj){const commercial=await this.call('/myAccount/commercialInfo');account={...account,...commercial};}
  return {name:account.name||account.companyName,email:account.email,walletId:account.walletId,documentMatch:account.cpfCnpj?String(account.cpfCnpj).replace(/\D/g,'')==='45356855000198':null};
 }
}
