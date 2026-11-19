import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {addMonths,splitCents,installmentSourceKey} from '../domain.mjs';
import {createDatabase,ensureStockCost} from '../db.mjs';
import {PARCEL_ENTRY_IDS,parcelarCompras} from '../scripts/parcelar-compras.mjs';
import {localDate,monthEnd} from '../quota.mjs';

test('parcelas dividem o centavo na última e o mês acompanha o dia',()=>{
 assert.deepEqual(splitCents(10000,3),[3333,3333,3334]);
 assert.deepEqual(splitCents(100,3),[33,33,34]);
 assert.deepEqual(splitCents(1,6),[0,0,0,0,0,1]);
 assert.equal(splitCents(10000,6).reduce((n,v)=>n+v,0),10000);
 assert.equal(addMonths('2026-12-01',0),'2026-12-01');
 assert.equal(addMonths('2026-12-01',5),'2027-05-01');
 assert.equal(addMonths('2026-01-31',1),'2026-02-28');
 assert.equal(addMonths('2024-01-31',1),'2024-02-29');
 assert.equal(installmentSourceKey(41,1),'installment:stock:41:1');
});

test('sqlite antigo ganha cost_cents a partir do caixa, uma vez',()=>{
 const s=new DatabaseSync(':memory:');
 s.exec('CREATE TABLE cash_entries(id INTEGER PRIMARY KEY, cents INTEGER); CREATE TABLE stock_lots(id INTEGER PRIMARY KEY, entry_id INTEGER, grams INTEGER);');
 s.exec('INSERT INTO cash_entries(id,cents) VALUES (1,8000),(2,0); INSERT INTO stock_lots(id,entry_id,grams) VALUES (1,1,1000),(2,2,500);');
 assert.equal(ensureStockCost(s),true);
 assert.deepEqual(s.prepare('SELECT cost_cents FROM stock_lots ORDER BY id').all().map(r=>r.cost_cents),[8000,0]);
 s.exec('UPDATE stock_lots SET cost_cents=123 WHERE id=1');
 assert.equal(ensureStockCost(s),false);
 assert.equal(s.prepare('SELECT cost_cents FROM stock_lots WHERE id=1').get().cost_cents,123);
 s.close();
});

test('migration preenche cost_cents pelo caixa e não reescreve depois',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await db.exec(readFileSync(new URL('../db/postgres.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../db/extensions-postgres.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../db/finance-postgres.sql',import.meta.url),'utf8'));
  await db.exec('ALTER TABLE maker3d.stock_lots DROP COLUMN cost_cents');
  const entry=await db.query("INSERT INTO maker3d.cash_entries(scope,kind,category,description,cents,entry_date,created) VALUES ('club','expense','filament','Filamento',9000,'2026-11-01','2026-11-01') RETURNING id");
  await db.query("INSERT INTO maker3d.stock_lots(entry_id,material,color,grams) VALUES ($1,'PLA','Azul',1000)",[entry.rows[0].id]);
  const sql=readFileSync(new URL('../supabase/migrations/20261120000000_maker3d_stock_lot_cost.sql',import.meta.url),'utf8');
  await db.exec(sql);
  assert.equal((await db.query('SELECT cost_cents FROM maker3d.stock_lots')).rows[0].cost_cents,9000);
  await db.query('UPDATE maker3d.cash_entries SET cents=1500');
  await db.exec(sql);
  assert.equal((await db.query('SELECT cost_cents FROM maker3d.stock_lots')).rows[0].cost_cents,9000);
 }finally{await db.close();}
});

test('script das entradas 41–51 parcela em 6x sem mudar o lote nem o custo',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'maker-parcelar-'));
 const db=await createDatabase({data:dir});
 t.after(async()=>{await db.close();await rm(dir,{recursive:true,force:true});});
 const totals=PARCEL_ENTRY_IDS.map((id,i)=>10000+i);
 await db.transaction(async()=>{
  for(const [i,id] of PARCEL_ENTRY_IDS.entries()){
   const lotId=4+i,cents=totals[i];
   await db.run("INSERT INTO cash_entries(id,scope,kind,category,description,cents,entry_date,created) VALUES(?,'club','expense','filament',?,?,?,?)",id,`Filamento lote ${lotId}`,cents,'2026-11-01','2026-11-01T00:00:00.000Z');
   await db.run('INSERT INTO stock_lots(id,entry_id,material,color,supplier,grams,cost_cents) VALUES(?,?,?,?,?,?,?)',lotId,id,'PLA','Azul','Tecnocubo',1000,cents);
  }
 });
 if(process.env.DATABASE_MODE==='pglite'){
  await db.run('RESET ROLE');
  await db.run("SELECT setval(pg_get_serial_sequence('maker3d.cash_entries','id'), (SELECT MAX(id) FROM maker3d.cash_entries))");
  await db.run("SELECT setval(pg_get_serial_sequence('maker3d.stock_lots','id'), (SELECT MAX(id) FROM maker3d.stock_lots))");
  await db.run('SET ROLE maker3d_app');
 }
 await db.run('UPDATE stock_lots SET cost_cents=? WHERE entry_id=?',1,41);
 await assert.rejects(()=>db.transaction(()=>parcelarCompras(db)),/cost_cents 1 difere/);
 assert.equal((await db.one('SELECT cents,source_key FROM cash_entries WHERE id=41')).cents,10000);
 await db.run('UPDATE stock_lots SET cost_cents=? WHERE entry_id=?',10000,41);
 const before=await db.all('SELECT id,entry_id,material,color,supplier,grams,cost_cents FROM stock_lots ORDER BY id');
 const preview=await db.transaction(()=>parcelarCompras(db,{apply:false}));
 assert.equal(preview.applied,false);
 assert.equal(preview.plan.length,11);
 assert.equal((await db.one('SELECT source_key FROM cash_entries WHERE id=41')).source_key,null);
 const first=await db.transaction(()=>parcelarCompras(db));
 assert.equal(first.created,11*5);
 assert.deepEqual(await db.all('SELECT id,entry_id,material,color,supplier,grams,cost_cents FROM stock_lots ORDER BY id'),before);
 const again=await db.transaction(()=>parcelarCompras(db));
 assert.equal(again.created,0);
 assert.deepEqual(again.skipped,PARCEL_ENTRY_IDS);
 for(const [i,id] of PARCEL_ENTRY_IDS.entries()){
  const rows=await db.all('SELECT cents,entry_date,description,source_key FROM cash_entries WHERE id=? OR source_key LIKE ? ORDER BY entry_date,id',id,'installment:stock:'+id+':%');
  assert.equal(rows.length,6);
  assert.equal(rows.reduce((n,r)=>n+Number(r.cents),0),totals[i]);
  assert.deepEqual(rows.map(r=>r.entry_date),['2026-12-01','2027-01-01','2027-02-01','2027-03-01','2027-04-01','2027-05-01']);
  assert.deepEqual(rows.map(r=>r.source_key),[1,2,3,4,5,6].map(k=>installmentSourceKey(id,k)));
  assert.ok(rows.every((r,k)=>r.description.endsWith(`(parcela ${k+1}/6)`)));
  assert.equal(Number(rows[0].cents),Math.floor(totals[i]/6));
  assert.equal(Number(rows[5].cents),totals[i]-Math.floor(totals[i]/6)*5);
 }
 const src=readFileSync(new URL('../scripts/parcelar-compras.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/UPDATE\s+stock_lots|INSERT\s+INTO\s+stock_lots/i);
 await db.run('DELETE FROM cash_entries WHERE source_key=?',installmentSourceKey(41,6));
 const repaired=await db.transaction(()=>parcelarCompras(db));
 assert.equal(repaired.created,1);
 assert.equal(Number((await db.one('SELECT cents FROM cash_entries WHERE id=41')).cents),Math.floor(10000/6));
 assert.equal(Number((await db.one('SELECT cents FROM cash_entries WHERE source_key=?',installmentSourceKey(41,6))).cents),10000-Math.floor(10000/6)*5);
 assert.equal(Number((await db.one('SELECT cost_cents FROM stock_lots WHERE entry_id=41')).cost_cents),10000);
});

test('compra parcelada mantém o custo/kg e some do mês até a data da parcela',async t=>{
 const data=await mkdtemp(join(tmpdir(),'maker-stock-installments-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:data,PORT:'3191',HOST:'127.0.0.1',MODEL_LOOKUP:'off'},stdio:['ignore','pipe','pipe']});
 let err='';child.stderr.on('data',d=>err+=d);
 t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(data,{recursive:true,force:true});});
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Servidor não iniciou: '+err);})]);
 const base='http://127.0.0.1:3191',pass='Local-test-123',today=localDate(),future=addMonths(today,1);
 const monthFrom=today.slice(0,7)+'-01',monthTo=monthEnd(today.slice(0,7));
 function client(){let cookie='';return async(path,b,status=200)=>{const r=await fetch(base+'/api'+path,{method:b===undefined?'GET':'POST',headers:{...(b===undefined?{}:{'Content-Type':'application/json'}),Cookie:cookie},body:b===undefined?undefined:JSON.stringify(b)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const value=await r.json();assert.equal(r.status,status,path+': '+JSON.stringify(value));return value;};}
 const admin=client(),op=client(),guardian=client();
 await admin('/setup',{name:'Admin',email:'admin@test.example',password:pass});
 const invite=await admin('/staff-invites',{email:'op@test.example',accessRole:'operator'});
 await op('/staff-register',{token:invite.token,name:'Operação',email:'op@test.example',password:pass});
 const buy=(extra)=>({material:'PLA',grams:1000,supplier:'Tecnocubo',requestKey:randomUUID(),...extra});
 await admin('/stock/purchases',buy({color:'Futuro',cents:10000,installments:1,entryDate:future}),400);
 await admin('/stock/purchases',buy({color:'Demais',cents:10000,installments:25,entryDate:today}),400);
 const key=randomUUID();
 const purchase=await admin('/stock/purchases',buy({color:'Parcelado',cents:10000,installments:3,entryDate:future,requestKey:key}));
 assert.equal(purchase.installments,3);
 await admin('/stock/purchases',buy({color:'Parcelado',cents:10000,installments:3,entryDate:future,requestKey:key}));
 let stock=await admin('/stock'),lot=stock.lots.find(l=>l.color==='Parcelado');
 assert.equal(stock.lots.length,1);
 assert.equal(lot.grams,1000);assert.equal(lot.remaining,1000);assert.equal(lot.cents,10000);assert.equal(lot.costPerKg,10000);assert.equal(lot.remainingValue,10000);assert.equal(lot.installments,3);
 assert.equal(stock.totals.grams,1000);assert.equal(stock.totals.value,10000);
 assert.equal('cost_cents' in lot,false);
 const hidden=await op('/stock');assert.equal(hidden.lots[0].cents,undefined);assert.equal('cost_cents' in hidden.lots[0],false);assert.equal(hidden.lots[0].remaining,1000);
 const month=await admin(`/finance?from=${monthFrom}&to=${monthTo}`);
 assert.equal(month.entries.some(e=>e.description.includes('Parcelado')),false);
 const wide=await admin('/finance?from=2000-01-01&to=2099-12-31');
 const parts=wide.entries.filter(e=>e.description.includes('Parcelado')).sort((a,b)=>a.entry_date.localeCompare(b.entry_date)||a.id-b.id);
 assert.equal(parts.length,3);
 assert.equal(parts.reduce((n,e)=>n+e.cents,0),10000);
 assert.deepEqual(parts.map(e=>e.cents),[3333,3333,3334]);
 assert.deepEqual(parts.map(e=>e.entry_date),[future,addMonths(future,1),addMonths(future,2)]);
 assert.deepEqual(parts.map(e=>e.source_key),purchase.entryIds.map((id,i)=>installmentSourceKey(purchase.entryId,i+1)));
 assert.ok(parts.every((e,i)=>e.description.endsWith(`(parcela ${i+1}/3)`)));
 const family=await admin('/families',{name:'Família Teste',plan:'monthly'});
 const gi=await admin('/invites',{familyId:family.id,role:'guardian'});
 await guardian('/register',{token:gi.token,name:'Responsável',email:'g@test.example',password:pass});
 const project=await guardian('/projects',{name:'Peça',description:'Uma peça',participant:'Ana',kind:'idea',size:'Pequena',color:'Azul',quantity:1});
 const preview=await admin(`/projects/${project.id}/quotepreview`,{minutes:60,grams:100,material:'PLA'});
 assert.equal(preview.materialCost,1200);
 const vista=await admin('/stock/purchases',buy({color:'Vista',cents:10000,entryDate:today}));
 assert.equal(vista.installments,1);
 stock=await admin('/stock');
 assert.equal(stock.lots.find(l=>l.color==='Vista').costPerKg,10000);
 assert.equal(stock.totals.value,20000);
 const vistaEntry=(await admin('/finance?from=2000-01-01&to=2099-12-31')).entries.find(e=>e.description.includes('Vista'));
 assert.equal(vistaEntry.cents,10000);assert.equal(vistaEntry.source_key,null);
 assert.equal((await admin(`/finance?from=${monthFrom}&to=${monthTo}`)).entries.filter(e=>e.category==='filament').reduce((n,e)=>n+e.cents,0),10000);
 await op('/stock/use',{lotId:purchase.id,grams:400,reason:'Pedido de teste',requestKey:randomUUID()});
 stock=await admin('/stock');lot=stock.lots.find(l=>l.color==='Parcelado');
 assert.equal(lot.costPerKg,10000);assert.equal(lot.remaining,600);assert.equal(lot.remainingValue,6000);assert.equal(stock.totals.value,16000);
 await admin(`/finance/entries/${purchase.entryId}/void`,{reason:'Já baixou'},400);
 assert.equal((await admin('/finance?from=2000-01-01&to=2099-12-31')).entries.filter(e=>e.description.includes('Parcelado')&&!e.voided_at).length,3);
 const cancel=await admin('/stock/purchases',buy({color:'Anulada',cents:100,installments:3,entryDate:future}));
 const mid=(await admin('/finance?from=2000-01-01&to=2099-12-31')).entries.find(e=>e.description.includes('Anulada')&&e.description.includes('(parcela 2/3)'));
 await admin(`/finance/entries/${mid.id}/void`,{reason:'Compra cancelada'});
 const after=await admin('/finance?from=2000-01-01&to=2099-12-31');
 const cancelled=after.entries.filter(e=>e.description.includes('Anulada'));
 assert.equal(cancelled.length,3);assert.ok(cancelled.every(e=>e.voided_at&&e.void_reason==='Compra cancelada'));
 assert.equal(after.entries.filter(e=>e.description.includes('Anulada')&&!e.voided_at).reduce((n,e)=>n+e.cents,0),0);
 stock=await admin('/stock');
 assert.equal(stock.lots.find(l=>l.color==='Anulada'),undefined);
 assert.equal(stock.lots.find(l=>l.color==='Parcelado').costPerKg,10000);
 assert.equal(stock.totals.grams,1600);assert.equal(stock.totals.value,16000);
 assert.equal(cancel.installments,3);
});
