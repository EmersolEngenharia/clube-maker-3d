import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const billingUi=readFileSync(new URL('../public/billing.js',import.meta.url),'utf8');

test('a tela do pedido deixa a equipe escolher PIX ou cartão, com 1× como padrão',()=>{
 assert.match(app,/Gerar link de pagamento/);
 assert.match(app,/option value="pix_cash" selected>PIX/);
 assert.match(app,/Cartão — link de pagamento/);
 assert.match(app,/name="installments" disabled/);
 assert.match(app,/paymentBlock\(p\)/);
 assert.match(app,/Pagar no cartão/);
 assert.match(app,/Parcelas em andamento/);
 assert.match(app,/Ver cobrança no Asaas/);
 assert.match(app,/Pagar com PIX/);
 assert.match(app,/function chargeDoneModal/);
 assert.match(app,/Copiar link/);
 assert.match(app,/A família foi avisada no WhatsApp/);
 assert.match(app,/O WhatsApp não foi enviado/);
 assert.match(billingUi,/Cartão — link de pagamento \(até 12× sem juros\)/);
 assert.match(billingUi,/pix_cash:'PIX avulso'/);
});

test('equipe gera o link do pedido; a família vê a cobrança e o padrão continua PIX',async t=>{
 const data=await mkdtemp(join(tmpdir(),'maker-order-charge-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:data,PORT:'3187',HOST:'127.0.0.1',ASAAS_API_KEY:'',ASAAS_WEBHOOK_TOKEN:'',MODEL_LOOKUP:'off'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(data,{recursive:true,force:true});});
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Servidor não iniciou');})]);
 const base='http://127.0.0.1:3187';
 function client(){let cookie='';return async(path,b,status=200)=>{const r=await fetch(base+'/api'+path,{method:b===undefined?'GET':'POST',headers:{...(b===undefined?{}:{'Content-Type':'application/json'}),Cookie:cookie},body:b===undefined?undefined:JSON.stringify(b)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const value=await r.json();assert.equal(r.status,status,`${path}: ${JSON.stringify(value)}`);return value;};}
 const admin=client(),guardian=client(),learner=client();
 await admin('/setup',{name:'Equipe',email:'admin@test.example',password:'Testing123'});
 const family=await admin('/families',{name:'Família',plan:'monthly'});
 await admin('/schedule/settings',{open:'08:00',close:'18:00',days:[1,2,3,4,5],buffer:15,lead:60,horizon:30,maxMinutes:2880,maxActive:3,chargeWhen:'finish',teamWhatsapp:[],pickupDays:3,lowStockGrams:200,minCharge:500,pickupPlace:'Emersol'});
 const pass='Testing123',idea={name:'Vaso',description:'Um vaso.',participant:'Ana',kind:'idea',size:'Pequeno',color:'Azul',quantity:1};
 async function invite(account,role,email){const inv=await admin('/invites',{familyId:family.id,role});await account('/register',{token:inv.token,name:email.split('@')[0],email,password:pass});}
 await invite(guardian,'guardian','g@test.example');await invite(learner,'learner','kid@test.example');
 async function quoted(){const p=await guardian('/projects',idea);await guardian(`/projects/${p.id}/submit`,{});await admin(`/projects/${p.id}/quote`,{minutes:600,grams:100,material:'PLA',note:'Peça azul.'});const view=await guardian(`/projects/${p.id}`);await guardian(`/projects/${p.id}/approve`,{total:view.quote.total,included:view.quote.included});return p.id;}
 const cardId=await quoted(),pixId=await quoted();
 await learner(`/projects/${cardId}/charge`,{method:'card_installments'},403);
 await guardian(`/projects/${cardId}/charge`,{method:'card_installments'},403);
 await admin(`/projects/${cardId}/charge`,{method:'boleto'},400);
 await admin(`/projects/${cardId}/charge`,{method:'card_installments',installments:0},400);
 const card=await admin(`/projects/${cardId}/charge`,{method:'card_installments',installments:3});
 assert.equal(card.method,'card_installments');assert.equal(card.installments,3);assert.equal(card.purpose,'project');assert.equal(card.projectId,cardId);assert.equal(card.status,'pending');
 await admin(`/projects/${cardId}/charge`,{},409);
 const seen=await guardian(`/projects/${cardId}`);
 assert.equal(seen.payment.method,'card_installments');assert.equal(seen.payment.installments,3);assert.equal(seen.payment.amountCents,card.amountCents);assert.equal(seen.payment.status,'pending');assert.equal(seen.payment.checkoutUrl,null);assert.equal(seen.payment.error,undefined);
 assert.equal(card.issued,true);assert.equal(card.whatsapp,false);
 assert.match(seen.events.at(-1).text,/Link de pagamento no cartão \(até 3x\)/);
 const pix=await admin(`/projects/${pixId}/charge`,{});
 assert.equal(pix.method,'pix_cash');assert.equal(pix.installments,1);assert.equal(pix.issued,true);
 const pixSeen=await guardian(`/projects/${pixId}`);
 assert.equal(pixSeen.payment.method,'pix_cash');assert.match(pixSeen.events.at(-1).text,/emitida via PIX/);assert.match(pixSeen.events.at(-1).text,/WhatsApp não foi enviado/);
 const listed=await admin('/dashboard'),cardRow=listed.projects.find(p=>p.id===cardId),pixRow=listed.projects.find(p=>p.id===pixId);
 assert.equal(cardRow.bill_method,'card_installments');assert.equal(Number(cardRow.bill_installments),3);assert.equal(Number(cardRow.bill_open),1);
 assert.equal(pixRow.bill_method,'pix_cash');assert.equal(Number(pixRow.bill_installments),1);
 const familyList=await guardian('/dashboard');
 assert.equal(familyList.projects.find(p=>p.id===cardId).bill_method,'card_installments');
 const one=await quoted();
 await admin(`/projects/${one}/charge`,{method:'card_installments',installments:1});
 assert.equal(Number((await admin('/dashboard')).projects.find(p=>p.id===one).bill_installments),1);
});
