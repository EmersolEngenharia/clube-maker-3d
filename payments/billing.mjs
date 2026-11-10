import {randomUUID} from 'node:crypto';
import {AsaasProvider} from './asaas.mjs';
import {ManualProvider,methods,recurring,ProviderError} from './provider.mjs';
import {isAdmin,canFinance} from '../permissions.mjs';
import {localDate} from '../quota.mjs';
const now=()=>new Date().toISOString();
export function nextPeriod(start,plan){const d=new Date(start+'T12:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+(plan==='annual'?12:1));const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);}
const daysAhead=n=>{const d=new Date(localDate()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const validDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))?v:null;
export function createBilling({db,fail,str,integer,config,env=process.env,provider,notify=async()=>false,onCharge=async()=>{}}){
 const asaas=provider||new AsaasProvider({key:env.ASAAS_API_KEY,webhookToken:env.ASAAS_WEBHOOK_TOKEN,environment:env.ASAAS_ENV||'production'}),manual=new ManualProvider();
 const configured=Boolean(env.ASAAS_API_KEY)||Boolean(provider),enabled=configured&&Boolean(env.ASAAS_WEBHOOK_TOKEN||provider);
 const selected=enabled?asaas:manual;
 let splitRules=[];if(env.ASAAS_SPLIT_RULES){try{splitRules=JSON.parse(env.ASAAS_SPLIT_RULES);if(!Array.isArray(splitRules)||splitRules.some(r=>typeof r.recipientId!=='string'||typeof r.percentage!=='number'||r.percentage<0||r.percentage>100)||splitRules.reduce((n,r)=>n+r.percentage,0)>100)throw new Error();}catch{throw new Error('ASAAS_SPLIT_RULES inválido.');}}
 const need=ok=>{if(!ok)fail('Ação exclusiva do responsável da família ou do financeiro autorizado.',403);};
 const actor=(u,fid)=>canFinance(u)||(u.role==='guardian'&&u.family_id===fid);
 const audit=(u,action,id)=>db.run('INSERT INTO audit_log(user_id,action,target,created) VALUES(?,?,?,?)',u.id,action,id,now());
 const safe=c=>({id:c.id,familyId:c.family_id,projectId:c.project_id,purpose:c.purpose,plan:c.plan,provider:c.provider,environment:c.environment,method:c.method,installments:c.installments,amountCents:c.amount_cents,status:c.status,checkoutUrl:c.checkout_url,currentPeriodEnd:c.current_period_end,created:c.created,error:c.error_note});
 // A project may be paid in parts (an estimate first, the difference after the real consumption).
 const projectReceived=async id=>Number((await db.one("SELECT COALESCE(SUM(cents),0) n FROM cash_entries WHERE voided_at IS NULL AND (source_key=? OR source_key LIKE ?)",'project:'+id,'project:'+id+':part:%')).n);
 async function get(id,u){const c=await db.one('SELECT * FROM billing_contracts WHERE id=?',id);if(!c)fail('Cobrança não encontrada.',404);need(actor(u,c.family_id));return c;}
 async function finalize(id,result){return db.transaction(async()=>{
  const c=await db.one('SELECT * FROM billing_contracts WHERE id=?',id);
  // A webhook may arrive before the create request finishes. Never overwrite it.
  await db.run("UPDATE billing_contracts SET gateway_subscription_id=?,gateway_charge_id=?,gateway_installment_id=?,checkout_url=?,status=CASE WHEN status IN ('creating','needs_review') THEN 'pending' ELSE status END,error_note=NULL,updated=? WHERE id=?",result.gatewaySubscriptionId||null,result.gatewayChargeId,result.gatewayInstallmentId||null,result.checkoutUrl||null,now(),id);
  return safe(await db.one('SELECT * FROM billing_contracts WHERE id=?',id));
 });}
 async function create(b,u){
  const intent=await db.transaction(async()=>{
   need(canFinance(u)||u.role==='guardian');const fid=integer(b.familyId||u.family_id,'Família',1,2147483647);need(actor(u,fid));const f=await db.one('SELECT * FROM families WHERE id=?',fid);if(!f)fail('Família não encontrada.',404);
   const key=str(b.requestKey,'Identificação da cobrança',100),existing=await db.one('SELECT * FROM billing_contracts WHERE request_key=?',key);if(existing){need(actor(u,existing.family_id));return {existing};}
   if(!methods.includes(b.method))fail('Forma de pagamento inválida.');
   const plan=b.plan||f.plan;if(!['monthly','annual'].includes(plan))fail('Plano inválido.');
   const installments=b.method==='card_installments'?integer(b.installments??1,'Parcelas',1,12):1;
   if(b.purpose==='project'&&!b.projectId)fail('Escolha um projeto concluído.');
   const projectId=b.projectId?integer(b.projectId,'Projeto',1,2147483647):null,cfg=await config();let amount=plan==='annual'?cfg.annual:cfg.monthly;
   if(projectId){const p=await db.one('SELECT * FROM projects WHERE id=? AND family_id=?',projectId,fid);if(!p||!['queued','printing','ready','completed'].includes(p.status)||p.paid)fail('O projeto precisa estar aprovado e sem pagamento.');if(recurring(b.method))fail('Impressões avulsas não podem gerar assinatura.');amount=p.charge-await projectReceived(projectId);}
   integer(amount,'Valor em centavos',1,10000000);
   const pending=await db.one("SELECT id FROM billing_contracts WHERE family_id=? AND purpose=? AND (status IN ('creating','pending','needs_review') OR (provider='asaas' AND method IN ('pix_recurring','card_recurring') AND status IN ('active','past_due')))"+(projectId?' AND project_id=?':''),fid,projectId?'project':'membership',...(projectId?[projectId]:[]));
   if(pending)fail('Já existe cobrança ou recorrência em andamento. Abra a cobrança existente antes de criar outra.',409);
   const customer=b.customer||{},name=str(customer.name||u.name,'Nome do responsável',100),email=str(customer.email||u.email,'E-mail',150),document=String(customer.document||'').replace(/\D/g,''),phone=typeof customer.phone==='string'?customer.phone.slice(0,30):'';
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('E-mail inválido.');if(enabled&&!/^(\d{11}|\d{14})$/.test(document))fail('Informe o CPF ou CNPJ do pagador para emitir a cobrança.');
   const id=randomUUID();await db.run('INSERT INTO billing_contracts(id,family_id,project_id,purpose,plan,provider,environment,method,installments,amount_cents,status,request_key,created_by,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,fid,projectId,projectId?'project':'membership',plan,selected.id,enabled?(env.ASAAS_ENV||'production'):'manual',b.method,installments,amount,'creating',key,u.id,now(),now());
   await audit(u,'billing.create',id);return {id,input:{subscriptionId:id,method:b.method,amountCents:amount,installments:b.method==='card_installments'?installments:undefined,cycle:plan==='annual'?'YEARLY':'MONTHLY',customer:{name,email,document:document||undefined,phone},splitRules,projectDue:projectId?daysAhead(3):undefined,description:projectId?'Impressão #'+projectId+' — Clube Maker 3D Emersol':(plan==='annual'?'Anuidade':'Mensalidade')+' — Clube Maker 3D Emersol'}};
  });
  if(intent.existing)return safe(intent.existing);
  try{const dueDate=intent.input.projectDue||localDate(),{projectDue,...input}=intent.input,result=await selected.createCharge({...input,dueDate});const c=await finalize(intent.id,result);try{await onCharge({...c,...result,dueDate});}catch{/* Scheduler recovers invoices by contract; issuing never repeats because notification failed. */}return c;}
  catch(e){await db.transaction(async()=>{await db.run("UPDATE billing_contracts SET status=CASE WHEN status='creating' THEN 'needs_review' ELSE status END,error_note=?,updated=? WHERE id=?",e.uncertain?'Resposta não confirmada. Recupere a cobrança por referência; não repita a criação.':'Emissão recusada. Confira os dados e a integração antes de tentar novamente.',now(),intent.id);});throw e;}
 }
 async function refresh(id,u){
  const c=await db.withRequest(()=>get(id,u));if(c.provider==='manual')return safe(c);if(!enabled)fail('Reconfigure o Asaas no mesmo ambiente para consultar a cobrança.',503);if(c.environment!==(env.ASAAS_ENV||'production'))fail('A cobrança pertence a outro ambiente do Asaas.',409);
  if(c.status==='needs_review'||c.status==='creating'){
   if(c.status==='creating'&&Date.now()-Date.parse(c.created)<120000)fail('A emissão ainda está em andamento. Aguarde antes de consultar novamente.',409);
   const result=await asaas.findExisting(c.id,c.method);if(!result){await db.transaction(()=>db.run("UPDATE billing_contracts SET status='needs_review',error_note=?,updated=? WHERE id=?",'Não encontrada pela referência. Confira o painel antes de encerrar a tentativa.',now(),c.id));return safe(await db.withRequest(()=>db.one('SELECT * FROM billing_contracts WHERE id=?',c.id)));}return finalize(c.id,result);
  }
  const result=await asaas.checkout({gatewayChargeId:c.gateway_charge_id,gatewaySubscriptionId:c.gateway_subscription_id});
  await db.transaction(()=>db.run('UPDATE billing_contracts SET checkout_url=?,gateway_charge_id=COALESCE(?,gateway_charge_id),updated=? WHERE id=?',result.checkoutUrl||null,result.gatewayChargeId||null,now(),c.id));
  return {...safe(c),checkoutUrl:result.checkoutUrl};
 }
 async function resolve(id,u,confirmed){
  need(canFinance(u));if(confirmed!==true)fail('Confirme que conferiu o painel do Asaas.');
  const c=await db.withRequest(()=>get(id,u));if(c.status!=='needs_review')fail('Esta cobrança não exige conferência.');
  if(!enabled||c.environment!==(env.ASAAS_ENV||'production'))fail('Configure o mesmo ambiente do Asaas para conferir a cobrança.',503);
  const found=await asaas.findExisting(c.id,c.method);if(found)return finalize(c.id,found);
  await db.transaction(async()=>{await db.run("UPDATE billing_contracts SET status='cancelled',error_note=?,updated=? WHERE id=?",'Emissão descartada após conferência humana e busca por referência.',now(),c.id);await audit(u,'billing.not_issued',c.id);});return {ok:true};
 }
 async function cancel(id,u){
  const c=await db.withRequest(()=>get(id,u));if(c.status==='cancelled')return {ok:true};
  if(c.status==='needs_review'||c.status==='creating')fail('Recupere e confira a cobrança no Asaas antes de cancelar.',409);
  if(!recurring(c.method)&&c.status==='active')fail('Cobrança paga não pode ser cancelada. Um estorno exige decisão humana no Asaas.',409);
  if(c.provider==='asaas'){
   if(!enabled||c.environment!==(env.ASAAS_ENV||'production'))fail('Configure o mesmo ambiente do Asaas para cancelar a cobrança.',503);
   if(recurring(c.method))await asaas.cancelSubscription(c.gateway_subscription_id);else await asaas.cancelCharge(c.gateway_charge_id);
  }
  await db.transaction(async()=>{await db.run("UPDATE billing_contracts SET status='cancelled',updated=? WHERE id=?",now(),id);await audit(u,'billing.cancel',id);});return {ok:true};
 }
 async function paid(event,c,source){
  if(!event.amountCents)return {ignored:'valor_ausente'};
  const duplicate=await db.one('SELECT status FROM billing_receipts WHERE gateway=? AND gateway_charge_id=?',source,event.gatewayChargeId);if(duplicate)return {duplicate:true};
  let entitlement=null;
  if(c.purpose==='membership'){
   const prior=await db.one("SELECT MAX(r.entitlement_end) ending FROM billing_receipts r JOIN billing_contracts b ON b.id=r.contract_id WHERE b.family_id=? AND r.status='paid'",c.family_id);
   const already=await db.one("SELECT gateway_charge_id FROM billing_receipts WHERE contract_id=? AND status='paid' LIMIT 1",c.id);
   if(!recurring(c.method)&&already)entitlement=c.current_period_end;
   else {const anchor=prior?.ending&&prior.ending>localDate()?prior.ending:localDate();entitlement=nextPeriod(anchor,c.plan);}
  }
  const description=(c.purpose==='project'?'Impressão #'+c.project_id:(c.plan==='annual'?'Anuidade':'Mensalidade'))+' · '+(source==='manual'?'recebimento manual':'Asaas'),entryDate=validDay(event.paidDate)||localDate();
  let paymentId=null;
  if(c.purpose==='membership')paymentId=Number((await db.run('INSERT INTO payments(family_id,description,cents,created) VALUES(?,?,?,?)',c.family_id,description,event.amountCents,now())).lastInsertRowid);
  const entryId=Number((await db.run('INSERT INTO cash_entries(scope,family_id,kind,category,description,cents,entry_date,source_key,created_by,created) VALUES(?,?,?,?,?,?,?,?,?,?)','club',c.family_id,'income',c.purpose==='project'?'printing':'membership',description,event.amountCents,entryDate,paymentId?'payment:'+paymentId:(await db.one('SELECT id FROM cash_entries WHERE source_key=?','project:'+c.project_id))?'project:'+c.project_id+':part:'+event.gatewayChargeId:'project:'+c.project_id,c.created_by,now())).lastInsertRowid);
  await db.run('INSERT INTO billing_receipts(gateway,gateway_charge_id,contract_id,amount_cents,status,payment_id,entry_id,entitlement_end,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)',source,event.gatewayChargeId,c.id,event.amountCents,'paid',paymentId,entryId,entitlement,now(),now());
  if(c.project_id)await db.run('UPDATE projects SET paid=CASE WHEN charge<=? THEN 1 ELSE 0 END WHERE id=?',await projectReceived(c.project_id),c.project_id);
  await db.run("UPDATE billing_contracts SET status=CASE WHEN status='cancelled' THEN status ELSE 'active' END,current_period_end=COALESCE(?,current_period_end),updated=? WHERE id=?",entitlement,now(),c.id);
  return {paid:true};
 }
 async function handleEvent(event,source='asaas'){
  if(event.type==='unknown')return {ignored:event.raw?.event||'evento_desconhecido'};
  if(!event.externalReference||!event.gatewayChargeId)return {ignored:'sem_referencia'};
  const result=await db.transaction(async()=>{
   const c=await db.one('SELECT * FROM billing_contracts WHERE id=?',event.externalReference);if(!c||c.provider!==source)return {ignored:'referencia_externa'};
   if(source==='asaas'&&c.environment!==(env.ASAAS_ENV||'production'))return {ignored:'outro_ambiente'};
   if(c.gateway_subscription_id&&event.gatewaySubscriptionId!==c.gateway_subscription_id)return {ignored:'assinatura_divergente'};
   if(!recurring(c.method)&&c.gateway_charge_id&&c.gateway_charge_id!==event.gatewayChargeId){if(!(c.method==='card_installments'&&c.gateway_installment_id&&c.gateway_installment_id===event.gatewayInstallmentId))return {ignored:'cobranca_divergente'};}
   if(event.type==='payment.paid')return paid(event,c,source);
   if(event.type==='payment.failed'){if(c.status!=='cancelled'&&(!c.current_period_end||c.current_period_end<localDate()))await db.run("UPDATE billing_contracts SET status='past_due',updated=? WHERE id=?",now(),c.id);return {ok:true};}
   if(event.type==='payment.refunded'){
    const r=await db.one('SELECT * FROM billing_receipts WHERE gateway=? AND gateway_charge_id=?',source,event.gatewayChargeId);
    if(r?.status==='refunded')return {duplicate:true};
    if(r){await db.run("UPDATE billing_receipts SET status='refunded',updated=? WHERE gateway=? AND gateway_charge_id=?",now(),source,event.gatewayChargeId);if(r.entry_id)await db.run('UPDATE cash_entries SET voided_at=?,void_reason=? WHERE id=?',now(),'Estorno / chargeback comunicado pelo Asaas',r.entry_id);}
    else await db.run('INSERT INTO billing_receipts(gateway,gateway_charge_id,contract_id,amount_cents,status,created,updated) VALUES(?,?,?,?,?,?,?)',source,event.gatewayChargeId,c.id,event.amountCents||0,'refunded',now(),now());
    const remaining=await db.one("SELECT MAX(entitlement_end) ending,COUNT(*) n FROM billing_receipts WHERE contract_id=? AND status='paid'",c.id);
    await db.run("UPDATE billing_contracts SET status=CASE WHEN status='cancelled' THEN status ELSE ? END,current_period_end=?,updated=? WHERE id=?",Number(remaining?.n)>0?'active':'refunded',remaining?.ending||null,now(),c.id);
    if(c.project_id){await db.run('UPDATE projects SET paid=? WHERE id=?',Number(remaining?.n)>0?1:0,c.project_id);if(r?.entry_id)await db.run('UPDATE cash_entries SET source_key=? WHERE id=?','project:'+c.project_id+':refunded:'+r.entry_id,r.entry_id);}return {refunded:true};
   }
   return {ignored:'evento_desconhecido'};
  });
  if(result.paid){try{await notify(event);}catch{/* A delivery failure never rolls back a received payment. */}}
  return result;
 }
 async function manualPaid(id,u){need(canFinance(u));const c=await db.withRequest(()=>get(id,u));if(c.provider!=='manual')fail('Confirme pagamentos Asaas pelo webhook. Para pagamentos externos, confira ou cancele a cobrança antes de registrar.',409);return handleEvent({type:'payment.paid',gatewayChargeId:'manual:'+c.id,externalReference:c.id,amountCents:c.amount_cents,paidDate:localDate()},'manual');}
 async function list(u){need(canFinance(u)||u.role==='guardian');const rows=await db.all('SELECT b.*,f.name family_name FROM billing_contracts b JOIN families f ON f.id=b.family_id'+(canFinance(u)?'':' WHERE b.family_id=?')+' ORDER BY b.created DESC LIMIT 100',...(canFinance(u)?[]:[u.family_id]));return {charges:rows.map(c=>({...safe(c),familyName:c.family_name})),configured:enabled,provider:selected.id,environment:enabled?(env.ASAAS_ENV||'production'):'manual',canManage:canFinance(u),methods};}
 async function diagnostic(u,test=false){need(isAdmin(u));const base={configured:enabled,apiKeyPresent:configured,webhookTokenPresent:Boolean(env.ASAAS_WEBHOOK_TOKEN||provider),environment:env.ASAAS_ENV||'production',webhookPath:'/api/webhooks/asaas',fallback:selected.id==='manual'};if(!test||!configured)return base;try{return {...base,connected:true,account:await asaas.diagnostic()};}catch(e){return {...base,connected:false,error:e.message};}}
 return {automatic:enabled,create,refresh,resolve,cancel,manualPaid,list,diagnostic,handleEvent,parseWebhook:(raw,headers)=>asaas.parseWebhook(raw,headers),async pix(id,u){const c=await db.withRequest(()=>get(id,u));if(!enabled||c.environment!==(env.ASAAS_ENV||'production'))fail('Configure o mesmo ambiente do Asaas para consultar o PIX.',503);if(c.provider!=='asaas'||!c.method.startsWith('pix_'))fail('QR Code indisponível para esta cobrança.',409);return asaas.pixQRCode(c.gateway_charge_id);}};
}
