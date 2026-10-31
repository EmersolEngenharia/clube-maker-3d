export type PaymentMethodCode='pix_recurring'|'card_recurring'|'card_installments'|'pix_cash';
export interface ChargeCustomer{name:string;email:string;phone:string;document?:string}
export interface SplitRule{recipientId:string;percentage:number}
export interface CreateChargeInput{subscriptionId:string;method:PaymentMethodCode;amountCents:number;installments?:number;customer:ChargeCustomer;splitRules?:SplitRule[];cycle?:'MONTHLY'|'YEARLY';description?:string}
export interface ChargeResult{provider:'asaas'|'manual';gatewayChargeId:string;gatewaySubscriptionId?:string;gatewayInstallmentId?:string;checkoutUrl?:string;status:'pending'|'paid'|'failed'}
export interface WebhookEvent{type:'payment.paid'|'payment.failed'|'payment.refunded'|'unknown';gatewayChargeId:string;amountCents?:number;externalReference?:string;gatewaySubscriptionId?:string;gatewayInstallmentId?:string;raw:unknown}
export interface PaymentProvider{readonly id:string;createCharge(input:CreateChargeInput):Promise<ChargeResult>;cancelSubscription(id:string):Promise<void>;cancelCharge(id:string):Promise<void>;parseWebhook(rawBody:string,headers:Headers|Record<string,string>):Promise<WebhookEvent>}
