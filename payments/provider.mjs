/** @typedef {'pix_recurring'|'card_recurring'|'card_installments'|'pix_cash'} PaymentMethodCode */
/**
 * PaymentProvider: id, createCharge(input), cancelSubscription(id),
 * cancelCharge(id), parseWebhook(rawBody, headers). Optional checkout recovery
 * and connection diagnostics are read-only provider capabilities.
 * All internal amounts are integer cents. No card fields are accepted.
 */
export const methods=['pix_recurring','card_recurring','card_installments','pix_cash'];
export const recurring=method=>['pix_recurring','card_recurring'].includes(method);
export class ProviderError extends Error{constructor(message,status=502,{uncertain=false}={}){super(message);this.status=status;this.uncertain=uncertain;}}
export function cents(value){const text=String(value??'');if(!/^\d+(?:\.\d{1,2})?$/.test(text))return undefined;const [whole,decimal='']=text.split('.'),n=Number(whole)*100+Number(decimal.padEnd(2,'0'));return Number.isSafeInteger(n)&&n>0?n:undefined;}
export function checkoutURL(value){if(!value)return undefined;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='asaas.com'||u.hostname.endsWith('.asaas.com'))?u.href:undefined;}catch{return undefined;}}
export class ManualProvider{
 id='manual';
 async createCharge(input){return {provider:'manual',gatewayChargeId:'manual:'+input.subscriptionId,status:'pending'};}
 async cancelSubscription(){} async cancelCharge(){}
 async parseWebhook(){return {type:'unknown',gatewayChargeId:'',raw:{}};}
}
