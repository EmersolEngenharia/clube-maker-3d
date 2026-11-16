import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDatabase} from '../db.mjs';
import {financiallySettled,ordersInScope,financeKey} from '../domain.mjs';

function grab(source,name){
 const start=source.search(new RegExp('function '+name+'\\([^)]*\\)\\{'));
 if(start<0) throw new Error('Função não encontrada: '+name);
 let depth=0,end=start;
 for(;end<source.length;end++){
  if(source[end]==='{')depth++;
  else if(source[end]==='}'&&--depth===0){end++;break;}
 }
 return source.slice(start,end);
}
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ops=readFileSync(new URL('../public/operations.js',import.meta.url),'utf8');
const ui=new Function(grab(app,'ordersInScope')+'\n'+grab(app,'orderSettled')+'\n'+grab(ops,'paFinKey')+'\n'+grab(ops,'orderListed')+'\nreturn {ordersInScope,orderSettled,paFinKey,orderListed};')();

const projects=[
 {id:1,status:'review',family_id:1,paid:0,exempt:0,charge:0,name:'Avaliação'},
 {id:2,status:'printing',family_id:1,paid:0,exempt:0,charge:100,bill_open:1,name:'Impressão'},
 {id:3,status:'ready',family_id:2,paid:0,exempt:0,charge:100,name:'Retirar'},
 {id:4,status:'ready',family_id:2,paid:0,exempt:1,charge:100,name:'Presente'},
 {id:5,status:'completed',family_id:1,paid:1,exempt:0,charge:100,name:'Pago'},
 {id:6,status:'cancelled',family_id:1,paid:0,exempt:0,charge:0,name:'Cancelado'},
 {id:7,status:'completed',family_id:1,paid:0,exempt:0,charge:0,name:'Zero'}
];
const ids=list=>list.map(p=>p.id);

test('lista padrão esconde concluído e cancelado e combina com os outros filtros',()=>{
 assert.deepEqual(ids(ordersInScope(projects,'open')),[1,2,3,4]);
 assert.deepEqual(ids(ui.ordersInScope(projects,'open')),[1,2,3,4]);
 assert.deepEqual(ids(ordersInScope(projects,'completed')),[5,7]);
 assert.deepEqual(ids(ui.ordersInScope(projects,'completed')),[5,7]);
 assert.equal(ordersInScope(projects,'all').length,7);
 // Unknown or the old "active" value stays on the working list.
 assert.deepEqual(ids(ordersInScope(projects,'active')),[1,2,3,4]);
 const open=ordersInScope(projects,'open');
 assert.deepEqual(ids(open.filter(p=>ui.orderListed(p,{status:'ready',family:'',fin:''}))),[3,4]);
 assert.deepEqual(ids(open.filter(p=>ui.orderListed(p,{status:'',family:'2',fin:'exempt'}))),[4]);
 assert.deepEqual(ids(open.filter(p=>ui.orderListed(p,{status:'',family:'',fin:'unpaid'}))),[2,3]);
 assert.deepEqual(ids(ordersInScope(projects,'completed').filter(p=>ui.orderListed(p,{status:'cancelled',family:'',fin:''}))),[]);
 assert.deepEqual(ids(ordersInScope(projects,'all').filter(p=>ui.orderListed(p,{status:'cancelled',family:'',fin:''}))),[6]);
});

test('concluído exige pago ou isento; o financeiro distingue isento de sem valor',()=>{
 for(const p of projects){
  assert.equal(ui.orderSettled(p),financiallySettled(p));
  assert.equal(ui.paFinKey(p),financeKey(p));
 }
 assert.deepEqual(projects.filter(financiallySettled).map(p=>p.id),[4,5]);
 assert.equal(financeKey(projects[3]),'exempt');
 assert.equal(financeKey(projects[6]),'none');
 assert.equal(financeKey(projects[2]),'due');
 assert.equal(financiallySettled(projects[6]),false);
});

test('a tela nomeia À retirar, isento e a visão Não concluídos',()=>{
 assert.match(app,/ready:'À retirar'/);
 assert.match(app,/filter:'open'/);
 assert.match(app,/Não concluídos/);
 assert.match(app,/Concluídos/);
 assert.match(ops,/exempt:'Isento \/ Bonificado'/);
 assert.match(ops,/status:'',family:'',fin:''/);
 assert.match(ops,/À retirar/);
});

test('migração marca só o concluído sem valor e sem pagamento como isento',async t=>{
 const data=await mkdtemp(join(tmpdir(),'maker-exempt-'));
 const db=await createDatabase({data});
 t.after(async()=>{await db.close();await rm(data,{recursive:true,force:true});});
 const stamp='2026-01-01T00:00:00.000Z';
 await db.transaction(async()=>{
  await db.run('INSERT INTO families(name,created) VALUES(?,?)','Família',stamp);
  const row=(status,charge,paid,name)=>db.run('INSERT INTO projects(family_id,name,description,participant,kind,size,color,quantity,status,created,updated,charge,paid) VALUES(1,?,?,?,?,?,?,1,?,?,?,?,?)',name,'Peça','Ana','idea','P','Azul',status,stamp,stamp,charge,paid);
  await row('completed',0,0,'006');
  await row('completed',0,1,'Pago');
  await row('completed',500,0,'Em aberto');
  await row('ready',0,0,'Ainda na mesa');
 });
 const update=readFileSync(new URL('../supabase/migrations/20261116120000_maker3d_project_exempt.sql',import.meta.url),'utf8').match(/UPDATE projects SET exempt = 1[\s\S]*?;/)[0];
 await db.transaction(()=>db.run(update));
 const rows=await db.all('SELECT name,status,exempt FROM projects ORDER BY id');
 assert.deepEqual(rows.map(r=>[r.name,r.status,Number(r.exempt)]),[['006','completed',1],['Pago','completed',0],['Em aberto','completed',0],['Ainda na mesa','ready',0]]);
});
