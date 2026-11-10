import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {computeQuota,localDate,monthEnd} from '../quota.mjs';

test('bônus não renova; reserva sobrevive ao vencimento e consumo real libera apenas saldo válido',()=>{
 const gift={code:'gift',value:120,period:'2026-10',expires_on:'2026-11-10',created:'2026-10-31'},alloc=[{project_id:1,code:'gift',minutes:100}];
 const p={id:1,period:'2026-10',status:'queued',included:820,used:0,minutes:820,grams:0,extra_rate:0,material_rate:0};
 let q=computeQuota([p],720,[gift],alloc,'2026-10','2026-10-31');assert.equal(q.available,20);assert.equal(q.gifts[0].heldMinutes,100);
 q=computeQuota([p],720,[gift],alloc,'2026-11','2026-11-01');assert.equal(q.available,740);assert.equal(q.baseAvailable,720);
 q=computeQuota([p],720,[gift],alloc,'2026-11','2026-11-11');assert.equal(q.available,720);assert.equal(q.gifts[0].heldMinutes,100);
 const done={...p,status:'completed',used:750,actual_minutes:750,actual_grams:0};
 q=computeQuota([done],720,[gift],alloc,'2026-11','2026-11-01');assert.equal(q.available,810);assert.equal(q.gifts[0].usedMinutes,30);
 q=computeQuota([{...p,status:'cancelled',included:0}],720,[gift],alloc,'2026-11','2026-11-11');assert.equal(q.available,720);assert.equal(q.gifts[0].remaining,120);
 q=computeQuota([{...p,status:'failed',included:0}],720,[gift],alloc,'2026-11','2026-11-01');assert.equal(q.available,840);
});

test('caixa, estoque, benefícios, convites e permissões de cada função',async t=>{
 const data=await mkdtemp(join(tmpdir(),'maker-operations-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:data,PORT:'3171',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
 let err='';child.stderr.on('data',d=>err+=d);
 t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(data,{recursive:true,force:true});});
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Servidor não iniciou: '+err);})]);
 const base='http://127.0.0.1:3171',pass='Local-test-123',today=localDate(),range='?from=2000-01-01&to=2099-12-31';
 function client(){let cookie='';return async(path,b,status=200)=>{const r=await fetch(base+'/api'+path,{method:b===undefined?'GET':'POST',headers:{...(b===undefined?{}:{'Content-Type':'application/json'}),Cookie:cookie},body:b===undefined?undefined:JSON.stringify(b)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const value=await r.json();if(Array.isArray(status))assert.ok(status.includes(r.status),path+': '+JSON.stringify(value));else assert.equal(r.status,status,path+': '+JSON.stringify(value));return {...value,responseStatus:r.status};};}
 const admin=client(),g=client(),other=client(),kid=client(),op=client(),fin=client(),delegated=client();
 await admin('/setup',{name:'Admin',email:'admin@test.example',password:pass});
 const f=await admin('/families',{name:'Família Um',plan:'monthly'}),f2=await admin('/families',{name:'Família Dois',plan:'annual'});
 for(const [c,email,role,fid]of[[g,'g@test.example','guardian',f.id],[other,'other@test.example','guardian',f2.id],[kid,'kid@test.example','learner',f.id]]){const i=await admin('/invites',{familyId:fid,role});await c('/register',{token:i.token,name:email,email,password:pass});}
 async function staff(c,email,accessRole){const i=await admin('/staff-invites',{email,accessRole});await c('/staff-register',{token:i.token,name:email,email,password:pass});await c('/staff-register',{token:i.token,name:email,email,password:pass},400);return (await c('/session')).user;}
 const operator=await staff(op,'op@test.example','operator'),finance=await staff(fin,'fin@test.example','finance'),delegate=await staff(delegated,'delegate@test.example','admin');
 assert.equal(operator.family_id,null);assert.equal(finance.team_role,'finance');
 await t.test('funções limitam APIs, convites revogam e administrador delegado funciona',async()=>{
  await op('/finance'+range,undefined,403);await op('/payments',{familyId:f.id,cents:100,description:'Negado'},403);
  await op('/benefits',{familyId:f.id,kind:'hours',value:60,reason:'Negado'},403);
  await fin('/team',undefined,403);await fin('/families',{name:'Negado',plan:'monthly'},403);await fin('/enrollment-invites',{label:'Negado'},403);
  await delegated('/team');await delegated('/settings',{},400);
  await admin('/team/'+(await kid('/session')).user.id,{enabled:true},400);
  const i=await admin('/staff-invites',{email:'revoked@test.example',accessRole:'operator'}),before=(await admin('/team')).invites;const hashed=before.find(x=>x.email==='revoked@test.example').token;
  await admin('/staff-invites/revoke',{id:hashed});await other('/staff-invite?token='+i.token,undefined,410);
 });
 await t.test('contatos são visíveis à própria família e equipe, sem outras famílias',async()=>{
  await g('/profile',{name:'Responsável',whatsapp:'(64) 99999-4321'});
  assert.equal((await admin('/dashboard')).families.find(x=>x.id===f.id).members.find(x=>x.role==='guardian').whatsapp,'5564999994321');
  const own=await g('/dashboard');assert.ok(own.familyMembers.some(m=>m.email==='g@test.example'));assert.equal(own.families.length,0);
  assert.ok(!(await other('/dashboard')).familyMembers.some(m=>m.email==='g@test.example'));
 });
 let purchase,expense;
 await t.test('aporte, compra e despesas têm efeito único no caixa e estoque',async()=>{
  const investment={scope:'club',kind:'investment',category:'capital',description:'Aporte inicial',cents:100000,entryDate:today,requestKey:randomUUID()};
  await admin('/finance/entries',investment);await admin('/finance/entries',investment);
  expense=await fin('/finance/entries',{scope:'club',kind:'expense',category:'energy',description:'Energia',cents:5000,entryDate:today,requestKey:randomUUID()});
  const buy={material:'PLA',color:'Azul',grams:1000,cents:10000,supplier:'Fornecedor',entryDate:today,requestKey:randomUUID()};
  purchase=await fin('/stock/purchases',buy);await fin('/stock/purchases',buy);
  const stock=await admin('/stock');assert.equal(stock.totals.grams,1000);assert.equal(stock.totals.value,10000);assert.equal(stock.lots[0].costPerKg,10000);
  let cash=await admin('/finance'+range);assert.equal(cash.totals.investments,100000);assert.equal(cash.totals.expenses,15000);assert.equal(cash.totals.result,-15000);assert.equal(cash.totals.closing,85000);
  await g('/finance/entries',{scope:'club',kind:'income'},403);await op('/stock/purchases',buy,403);
 });
 await t.test('desconto, isenção e impressão viram despesas da família uma única vez',async()=>{
  await fin('/benefits',{familyId:f.id,kind:'discount',value:3000,reason:'Boas-vindas',code:'BEMVINDO',expiresOn:'2099-12-31'});
  const summary=await fin('/payments/preview',{familyId:f.id,gross:15000,coupon:'BEMVINDO'});assert.equal(summary.total,12000);
  const payment={familyId:f.id,description:'Participação',gross:15000,coupon:'BEMVINDO',cents:12000,entryDate:today,requestKey:randomUUID()};
  await fin('/payments',{...payment,cents:15000},400);
  const concurrent=await Promise.all([fin('/payments',payment),admin('/payments',payment)]);assert.equal(concurrent.filter(x=>x.duplicate).length,1);
  await fin('/payments',{...payment,requestKey:randomUUID()},400);
  await fin('/payments',{familyId:f.id,description:'Isenção',gross:15000,cents:0,waiver:true,reason:'Bolsa de participação',entryDate:today,requestKey:randomUUID()});
  const p=await g('/projects',{name:'Peça',description:'Uma peça',participant:'Criador',kind:'idea',size:'Pequena',color:'Azul',quantity:1});await g(`/projects/${p.id}/submit`,{});
  await fin(`/projects/${p.id}/quote`,{minutes:60,grams:100,material:'PLA',note:'Negado'},403);
  await op(`/projects/${p.id}/quote`,{minutes:60,grams:100,material:'PLA',note:'Conferido'});
  const q=(await g(`/projects/${p.id}`)).quote;await g(`/projects/${p.id}/approve`,{total:q.total,included:q.included});await op(`/projects/${p.id}/start`,{checked:true});await op(`/projects/${p.id}/finish`,{minutes:60,grams:100});
  await op(`/projects/${p.id}/paid`,{},403);await fin(`/projects/${p.id}/paid`,{});await fin(`/projects/${p.id}/paid`,{},409);
  const own=await g('/finance'+range+'&scope=family');assert.equal(own.totals.expenses,13200);assert.equal(own.entries.filter(e=>e.category==='printing').length,1);
  const cash=await admin('/finance'+range);assert.equal(cash.totals.income,13200);assert.equal(cash.totals.closing,98200);
  assert.equal((await other('/finance'+range+'&scope=family')).entries.length,0);
  const receipt=cash.entries.find(e=>e.source_key==='project:'+p.id);
  await fin(`/finance/entries/${receipt.id}/void`,{reason:'Correção do recebimento'});
  assert.equal((await g('/finance'+range+'&scope=family')).totals.expenses,12000);
  await fin(`/projects/${p.id}/paid`,{});
  const restored=await g('/finance'+range+'&scope=family');assert.equal(restored.totals.expenses,13200);assert.equal(restored.entries.filter(e=>e.category==='printing'&&e.voided_at).length,1);

 });
 await t.test('vendas, despesas privadas, resultado, filtros e estorno',async()=>{
  const sale={scope:'family',kind:'income',category:'sales',description:'Venda de chaveiros',cents:30000,entryDate:today,requestKey:randomUUID()};
  const entry=await g('/finance/entries',sale);await g('/finance/entries',sale);
  await g('/finance/entries',{scope:'family',kind:'expense',category:'shipping',description:'Entrega',cents:2000,entryDate:today,requestKey:randomUUID()});
  const own=await g('/finance'+range+'&scope=family');assert.equal(own.totals.income,30000);assert.equal(own.totals.expenses,15200);assert.equal(own.totals.result,14800);
  assert.ok(!(await admin('/finance'+range)).entries.some(e=>e.description==='Venda de chaveiros'));
  await admin('/finance'+range+'&scope=family',undefined,403);assert.equal((await kid('/finance'+range+'&scope=family')).scope,'family');
  await other(`/finance/entries/${entry.id}/void`,{reason:'Outro'},403);await admin(`/finance/entries/${entry.id}/void`,{reason:'Outro'},403);
  await g(`/finance/entries/${entry.id}/void`,{reason:'Venda cancelada'});
  const reversed=await g('/finance'+range+'&scope=family');assert.equal(reversed.totals.income,0);assert.ok(reversed.entries.find(x=>x.id===entry.id).voided_at);
  await g('/finance?scope=family&from=2026-02-30&to=2026-03-01',undefined,400);
  await fin(`/finance/entries/${expense.id}/void`,{reason:'Duplicado'});assert.equal((await admin('/finance'+range)).totals.expenses,10000);
 });
 await t.test('baixas não duplicam despesas nem deixam estoque negativo',async()=>{
  const use={lotId:purchase.id,grams:250,reason:'Projeto e suportes',requestKey:randomUUID()};await op('/stock/use',use);await op('/stock/use',use);
  await op('/stock/use',{...use,grams:1000,requestKey:randomUUID()},400);
  // The 100 g of the PLA Azul order finished earlier already left this lot automatically.
  const stock=await fin('/stock');assert.equal(stock.totals.grams,650);assert.equal(stock.totals.value,6500);assert.ok(stock.uses.some(x=>x.grams===100&&/^Pedido #/.test(x.reason)));
  assert.equal((await admin('/finance'+range)).totals.expenses,10000);
  assert.equal((await op('/stock')).lots[0].cents,undefined);
  await fin(`/finance/entries/${purchase.entryId}/void`,{reason:'Já utilizado'},400);
 });
 await t.test('aprovações concorrentes reservam bônus uma só vez; falha libera e consumo menor devolve saldo',async()=>{
  await admin(`/families/${f.id}/edit`,{name:'Família Um',plan:'monthly',allowance:60});
  await fin('/benefits',{familyId:f.id,kind:'hours',value:120,reason:'Imprimir mais',expiresOn:'2099-12-31'});
  const ps=[];
  for(let n=0;n<2;n++){
   const p=await g('/projects',{name:'Bônus '+n,description:'Teste bônus',participant:'Criador',kind:'idea',size:'Pequena',color:'Azul',quantity:1});await g(`/projects/${p.id}/submit`,{});
   await op(`/projects/${p.id}/quote`,{minutes:120,grams:10,material:'PLA',note:'Bônus'});ps.push({...p,q:(await g(`/projects/${p.id}`)).quote});
  }
  const approvals=await Promise.all(ps.map(p=>g(`/projects/${p.id}/approve`,{total:p.q.total,included:p.q.included},[200,409])));
  assert.deepEqual(approvals.map(r=>r.responseStatus).sort(),[200,409]);
  const p=ps[approvals.findIndex(r=>r.responseStatus===200)],otherP=ps[approvals.findIndex(r=>r.responseStatus===409)];
  assert.equal((await g('/dashboard')).balance.giftAvailable,0);
  await op(`/projects/${p.id}/cancel`,{});assert.equal((await g('/dashboard')).balance.giftAvailable,120);
  await g(`/projects/${otherP.id}/approve`,{total:otherP.q.total,included:otherP.q.included});await op(`/projects/${otherP.id}/start`,{checked:true});await op(`/projects/${otherP.id}/fail`,{reason:'Falha técnica'});
  assert.equal((await g('/dashboard')).balance.giftAvailable,120);
  await op(`/projects/${otherP.id}/quote`,{minutes:90,grams:10,material:'PLA',note:'Nova tentativa'});
  const q=(await g(`/projects/${otherP.id}`)).quote;await g(`/projects/${otherP.id}/approve`,{total:q.total,included:q.included});await op(`/projects/${otherP.id}/start`,{checked:true});await op(`/projects/${otherP.id}/finish`,{minutes:30,grams:5});
  assert.equal((await g('/dashboard')).balance.giftAvailable,90);
  await admin(`/families/${f.id}/edit`,{name:'Família Um',plan:'monthly',allowance:60});
 });
 await t.test('benefícios têm histórico e validade independente; sessão revogada após mudança de função',async()=>{
  await fin('/benefits',{familyId:f.id,kind:'hours',value:120,reason:'Bônus futuro',expiresOn:'2099-12-31'});
  const benefits=(await g('/benefits')).benefits;assert.ok(benefits.some(b=>b.code==='BEMVINDO'&&b.status==='used'&&b.redeemed_at));assert.ok(benefits.some(b=>b.kind==='hours'&&b.expiresOn==='2099-12-31'));
  await other('/benefits?familyId='+f.id,undefined,403);
  await admin('/team/'+finance.id,{enabled:true,accessRole:'operator'});await fin('/finance'+range,undefined,401);await fin('/login',{email:finance.email,password:pass});await fin('/finance'+range,undefined,403);
  await admin('/team/'+operator.id,{enabled:false});await op('/dashboard',undefined,401);await op('/login',{email:operator.email,password:pass},403);
 });
 await t.test('aprendiz participa do caixa compartilhado; responsável classifica por participante',async()=>{
  const student=(await kid('/session')).user,clubBefore=(await admin('/finance'+range)).totals;
  const profile=await g('/dependents',{familyId:f.id,name:'Ana',ageGroup:'child'});
  const sale=await kid('/finance/entries',{scope:'family',kind:'income',category:'sales',description:'Venda do participante',cents:1000,entryDate:today,participantKey:'u:'+(await g('/session')).user.id,requestKey:randomUUID()});
  const shared=await g('/finance'+range+'&scope=family'),entry=shared.entries.find(e=>e.id===sale.id);assert.equal(entry.participant_key,'u:'+student.id);assert.equal(entry.participant_name,student.name);
  await kid('/finance/entries',{scope:'family',kind:'expense',category:'supplies',description:'Embalagem do participante',cents:200,entryDate:today,requestKey:randomUUID()});
  const forProfile=await g('/finance/entries',{scope:'family',kind:'income',category:'allowance',description:'Mesada da Ana',cents:500,entryDate:today,participantKey:'p:'+profile.id,requestKey:randomUUID()});
  const familyView=await kid('/finance'+range+'&scope=family');assert.ok(familyView.entries.some(e=>e.id===forProfile.id&&e.participant_name==='Ana'));assert.equal(familyView.entries.find(e=>e.id===forProfile.id).canVoid,false);
  await kid(`/finance/entries/${forProfile.id}/void`,{reason:'Não é meu'},403);
  await g(`/finance/entries/${sale.id}/void`,{reason:'Correção pelo responsável'});
  assert.ok((await kid('/finance'+range+'&scope=family')).entries.find(e=>e.id===sale.id).voided_at);
  await kid('/finance'+range+'&scope=club',undefined,403);assert.ok(!(await other('/finance'+range+'&scope=family')).entries.some(e=>e.description==='Venda do participante'));
  await g('/finance/entries',{scope:'family',kind:'income',category:'gift',description:'Pessoa de outra família',cents:100,entryDate:today,participantKey:'u:'+(await other('/session')).user.id,requestKey:randomUUID()},403);
  assert.deepEqual((await admin('/finance'+range)).totals,clubBefore);
 });

});
