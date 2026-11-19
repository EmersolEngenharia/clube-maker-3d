// Converte compras de estoque já lançadas à vista em 6 parcelas, sem mexer no lote.
//
// As cash_entries 41 a 51 (lotes 4 a 14) ficam assim, depois da migration de cost_cents:
//   a linha original vira a parcela 1/6 em 2026-12-01;
//   surgem as parcelas 2/6 a 6/6 de 2027-01-01 a 2027-05-01;
//   o resto dos centavos vai para a última;
//   stock_lots não é alterado, então o custo/kg continua o do cost_cents.
//
// Idempotente: se a entrada já é installment:stock:<id>:1 e as seis linhas somam o cost_cents, não faz nada.
// Se a conversão parou no meio, completa as parcelas que faltam usando o cost_cents (não divide de novo).
//
// Não rode no deploy. Primeiro aplique supabase/migrations/20261120000000_maker3d_stock_lot_cost.sql.
// Conferir sem gravar:
//   node scripts/parcelar-compras.mjs
// Gravar, só com o banco já migrado:
//   PARCELAR_CONFIRM=lotes-4-a-14 node scripts/parcelar-compras.mjs --apply
//
// Equivalente, para uma entrada já com cost_cents = cents (aqui, id 41 e total T):
//   UPDATE cash_entries SET cents = T/6, entry_date = '2026-12-01',
//     description = description || ' (parcela 1/6)', source_key = 'installment:stock:41:1' WHERE id = 41;
//   -- e INSERT das parcelas 2/6..6/6 com source_key installment:stock:41:k e o resto em 6/6.
// O script faz isso para as onze entradas e pode repetir sem duplicar.
import {pathToFileURL} from 'node:url';
import {addMonths,installmentSourceKey,splitCents} from '../domain.mjs';

export const PARCEL_ENTRY_IDS=[41,42,43,44,45,46,47,48,49,50,51];
const LOT_MIN=4, LOT_MAX=14;

export async function parcelarCompras(db,{entryIds=PARCEL_ENTRY_IDS,installments=6,start='2026-12-01',apply=true}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||Number.isNaN(Date.parse(start+'T12:00:00Z')))throw new Error('Data inicial inválida.');
 if(!Number.isInteger(installments)||installments<2||installments>24)throw new Error('Use de 2 a 24 parcelas.');
 const plan=[],skipped=[];
 for(const id of entryIds){
  const entry=await db.one('SELECT * FROM cash_entries WHERE id=?',id);
  if(!entry)throw new Error(`Lançamento ${id} não encontrado.`);
  if(entry.voided_at)throw new Error(`Lançamento ${id} está estornado. Nada foi parcelado.`);
  const lot=await db.one('SELECT * FROM stock_lots WHERE entry_id=?',id);
  if(!lot)throw new Error(`Lançamento ${id} não está ligado a um lote.`);
  const lotId=Number(lot.id);
  if(lotId<LOT_MIN||lotId>LOT_MAX)throw new Error(`Entrada ${id} está ligada ao lote ${lotId}, fora de ${LOT_MIN}–${LOT_MAX}.`);
  const rows=await db.all('SELECT id,cents,source_key FROM cash_entries WHERE source_key LIKE ? ORDER BY source_key','installment:stock:'+id+':%');
  const firstKey=installmentSourceKey(id,1);
  const cost=Number(lot.cost_cents);
  if(entry.source_key===firstKey&&rows.length===installments){
   const sum=rows.reduce((n,r)=>n+Number(r.cents),0);
   if(sum!==cost)throw new Error(`Lote ${lotId}: a soma das parcelas (${sum}) não bate com cost_cents (${cost}).`);
   skipped.push(id);continue;
  }
  if(entry.source_key&&entry.source_key!==firstKey)throw new Error(`Lançamento ${id} já tem source_key ${entry.source_key}.`);
  if(!entry.source_key&&rows.length)throw new Error(`Entrada ${id} ainda não é a parcela 1, mas já existem outras parcelas.`);
  const total=entry.source_key?cost:Number(entry.cents);
  if(!entry.source_key&&cost!==total)throw new Error(`Lote ${lotId} (entrada ${id}): cost_cents ${cost} difere do caixa ${total}. Aplique a migration de cost_cents antes de parcelar.`);
  const parts=splitCents(total,installments),dates=parts.map((_,i)=>addMonths(start,i));
  const base=String(entry.description).replace(/ \(parcela \d+\/\d+\)$/,'');
  plan.push({id,lotId,costCents:cost,total,parts,dates,base,scope:entry.scope,familyId:entry.family_id,kind:entry.kind,category:entry.category,createdBy:entry.created_by,created:entry.created,existing:new Set(rows.map(r=>r.source_key))});
 }
 if(!apply)return {applied:false,plan,skipped,created:0};
 let created=0;
 for(const item of plan){
  await db.run('UPDATE cash_entries SET cents=?,entry_date=?,description=?,source_key=? WHERE id=?',item.parts[0],item.dates[0],`${item.base} (parcela 1/${installments})`,installmentSourceKey(item.id,1),item.id);
  for(let k=2;k<=installments;k++){
   const key=installmentSourceKey(item.id,k),description=`${item.base} (parcela ${k}/${installments})`;
   if(item.existing.has(key))await db.run('UPDATE cash_entries SET cents=?,entry_date=?,description=? WHERE source_key=?',item.parts[k-1],item.dates[k-1],description,key);
   else {await db.run('INSERT INTO cash_entries(scope,family_id,kind,category,description,cents,entry_date,source_key,created_by,created) VALUES(?,?,?,?,?,?,?,?,?,?)',item.scope,item.familyId,item.kind,item.category,description,item.parts[k-1],item.dates[k-1],key,item.createdBy,item.created);created++;}
  }
 }
 return {applied:true,plan,skipped,created};
}

const isMain=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(isMain){
 const apply=process.argv.includes('--apply');
 if(apply&&process.env.PARCELAR_CONFIRM!=='lotes-4-a-14'){
  console.error('Nada foi gravado. Para aplicar, depois da migration de cost_cents: PARCELAR_CONFIRM=lotes-4-a-14 node scripts/parcelar-compras.mjs --apply');
  process.exit(1);
 }
 const {createDatabase}=await import('../db.mjs');
 const db=await createDatabase({data:process.env.DATA_DIR||'data'});
 try{
  const result=await db.transaction(()=>parcelarCompras(db,{apply}));
  console.log(result.applied?'Aplicado. stock_lots não foi alterado.':'Plano apenas. Nada foi gravado.');
  for(const item of result.plan)console.log(`entrada ${item.id} · lote ${item.lotId} · cost_cents ${item.costCents} · ${item.parts.join(' + ')} = ${item.total} · ${item.dates[0]} a ${item.dates.at(-1)}`);
  if(result.skipped.length)console.log('Já parceladas:',result.skipped.join(', '));
  console.log(result.applied?`Parcelas novas: ${result.created}.`:'');
 }finally{await db.close();}
}
