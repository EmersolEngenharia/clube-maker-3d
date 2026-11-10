import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import {once} from 'node:events';
import {deflateRawSync} from 'node:zlib';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scheduleDefaults as cfg,fromLocal,isOpen,nextOpen,nextFree,suggestions,reflow,conflict,cleanSettings,createSchedule,matchJob} from '../schedule.mjs';
import {analyzePrintFile} from '../slicer.mjs';
import {createPrinter} from '../printer.mjs';
import {mqtt,parsePackets,mergeReport,toStatus,startBridge} from '../scripts/printer-bridge.mjs';
import {createDatabase} from '../db.mjs';
import {createQuota} from '../quota.mjs';
import {createBilling} from '../payments/billing.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});},str=(v,label,max=500)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail(label);return v.trim();},integer=(v,label,min,max)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail(label);return v;},num=(v,label,min,max)=>{if(typeof v!=='number'||!(v>=min&&v<=max))fail(label);return v;};
const MIN=60000,at=(day,h,m=0)=>fromLocal(day,h*60+m);

test('horário de funcionamento, conflitos e próximos horários livres',()=>{
 // 2026-11-09 is a Monday.
 assert.equal(isOpen(cfg,at('2026-11-09',8)),true);assert.equal(isOpen(cfg,at('2026-11-09',7,59)),false);assert.equal(isOpen(cfg,at('2026-11-14',10)),false);
 assert.equal(nextOpen(cfg,at('2026-11-13',19)).toISOString(),at('2026-11-16',8).toISOString());
 const busy=[{start:at('2026-11-09',8).getTime(),end:at('2026-11-09',10).getTime()}];
 assert.ok(conflict(busy,at('2026-11-09',10,10).getTime(),at('2026-11-09',11).getTime(),15));assert.equal(conflict(busy,at('2026-11-09',10,15).getTime(),at('2026-11-09',11).getTime(),15),null);
 assert.equal(nextFree(cfg,busy,at('2026-11-09',7),60).toISOString(),at('2026-11-09',10,15).toISOString());
 // A long print that starts near closing time is allowed to run overnight; the next one waits for it.
 const overnight=[{start:at('2026-11-09',17).getTime(),end:at('2026-11-10',9).getTime()}];
 assert.equal(nextFree(cfg,overnight,at('2026-11-09',16,30),120).toISOString(),at('2026-11-10',9,15).toISOString());
 const s=suggestions(cfg,busy,at('2026-11-09',7),60,3).map(d=>d.toISOString());assert.deepEqual(s,[at('2026-11-09',10,15),at('2026-11-10',8),at('2026-11-11',8)].map(d=>d.toISOString()));
});
test('reorganização empurra só o que colide e preserva a ordem',()=>{
 const fixed=[{start:at('2026-11-09',9).getTime(),end:at('2026-11-09',12).getTime()}];
 const queued=[{id:1,start:at('2026-11-09',10).getTime(),end:at('2026-11-09',11).getTime()},{id:2,start:at('2026-11-09',12,30).getTime(),end:at('2026-11-09',13,30).getTime()},{id:3,start:at('2026-11-09',16).getTime(),end:at('2026-11-09',17).getTime()}];
 const moved=reflow(cfg,fixed,queued);assert.deepEqual(moved.map(m=>[m.id,new Date(m.start).toISOString()]),[[1,at('2026-11-09',12,15).toISOString()],[2,at('2026-11-09',13,30).toISOString()]]);
});
test('regras da agenda são validadas',()=>{
 const ok={...cfg,teamWhatsapp:['(64) 99999-1234']};assert.deepEqual(cleanSettings(ok,fail).teamWhatsapp,['5564999991234']);
 assert.throws(()=>cleanSettings({...cfg,close:'07:00'},fail));assert.throws(()=>cleanSettings({...cfg,days:[9]},fail));assert.throws(()=>cleanSettings({...cfg,chargeWhen:'never'},fail));assert.throws(()=>cleanSettings({...cfg,teamWhatsapp:['123']},fail));
});
function zip(name,content){const data=deflateRawSync(Buffer.from(content)),n=Buffer.from(name),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(8,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(Buffer.byteLength(content),22);local.writeUInt16LE(n.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(8,10);central.writeUInt32LE(data.length,20);central.writeUInt32LE(Buffer.byteLength(content),24);central.writeUInt16LE(n.length,28);central.writeUInt32LE(0,42);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(46+n.length,12);end.writeUInt32LE(30+n.length+data.length,16);return Buffer.concat([local,n,data,central,n,end]);}
test('tempo e peso são lidos do arquivo fatiado',()=>{
 const xml='<config><plate><metadata key="index" value="1"/><metadata key="prediction" value="5567"/><metadata key="weight" value="23.94"/><filament id="1" type="PLA" color="#FFFFFF" used_m="8.03" used_g="20.00" /><filament id="2" type="PETG" color="#000000" used_g="3.94" /></plate><plate><metadata key="prediction" value="600"/><metadata key="weight" value="5.00"/><filament id="1" type="PLA" color="#FFFFFF" used_g="5.00" /></plate></config>';
 const r=analyzePrintFile('peca.gcode.3mf',zip('Metadata/slice_info.config',xml));assert.equal(r.sliced,true);assert.equal(r.minutes,103);assert.equal(r.grams,28.9);assert.deepEqual(r.filaments,[{type:'PLA',color:'#FFFFFF',grams:25},{type:'PETG',color:'#000000',grams:3.9}]);
 assert.deepEqual(analyzePrintFile('projeto.3mf',zip('3D/3dmodel.model','<model/>')),{sliced:false});assert.deepEqual(analyzePrintFile('ruim.3mf',Buffer.from('not a zip')),{sliced:false});
 const g=analyzePrintFile('a.gcode',Buffer.from('; HEADER\n; model printing time: 1h 2m 3s; total estimated time: 1h 9m 30s\n; total filament weight [g] : 12.30,4.00\n; filament_type = PLA;PETG\nG1 X0\n'));assert.equal(g.minutes,70);assert.equal(g.grams,16.3);assert.equal(g.filaments[1].type,'PETG');
});
test('ponte: pacotes MQTT, estado da impressora e envio ao portal',async t=>{
 const framed=mqtt.publish('device/SN/report',JSON.stringify({print:{gcode_state:'RUNNING'}})),split=parsePackets(Buffer.concat([framed,framed.subarray(0,5)]));assert.equal(split.packets.length,1);assert.equal(split.packets[0].topic,'device/SN/report');assert.equal(split.rest.length,5);
 const big=parsePackets(mqtt.publish('t','x'.repeat(300)));assert.equal(big.packets[0].payload.length,300);
 let merged=mergeReport({},{print:{gcode_state:'RUNNING',mc_percent:10,total_layer_num:50}});merged=mergeReport(merged,{print:{mc_percent:12,mc_remaining_time:30}});assert.deepEqual(toStatus(merged,'X2D'),{state:'printing',percent:12,remainingMinutes:30,layer:undefined,totalLayers:50,nozzle:undefined,bed:undefined,job:undefined,model:'X2D'});assert.equal(toStatus({gcode_state:'???'}),null);
 // A fake printer (plain TCP) and a fake portal check the whole path without hardware.
 const reports=[];const portal=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{reports.push({auth:req.headers.authorization,...JSON.parse(body)});res.end('{}');});});portal.listen(0,'127.0.0.1');await once(portal,'listening');
 let login=null;const broker=net.createServer(socket=>{let buf=Buffer.alloc(0);socket.on('data',c=>{const p=parsePackets(Buffer.concat([buf,c]));buf=p.rest;for(const k of p.packets){if(k.type===1){login=true;socket.write(Buffer.from([0x20,2,0,0]));}if(k.type===8)socket.write(mqtt.publish('device/SN1/report',JSON.stringify({print:{gcode_state:'RUNNING',mc_percent:40,mc_remaining_time:90,subtask_name:'vaso'}})));}});});broker.listen(0,'127.0.0.1');await once(broker,'listening');
 const bridge=startBridge({host:'127.0.0.1',port:broker.address().port,serial:'SN1',accessCode:'12345678',portal:'http://127.0.0.1:'+portal.address().port,token:'segredo',useTls:false,camera:'cam',frame:async()=>Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(200)]),cameraInterval:0,interval:40,log:()=>{}});
 t.after(()=>{bridge.stop();broker.close();portal.close();});
 for(let i=0;i<100&&!reports.some(r=>r.snapshot);i++)await new Promise(r=>setTimeout(r,20));
 assert.ok(login);const last=reports.at(-1);assert.equal(last.auth,'Bearer segredo');assert.equal(last.state,'printing');assert.equal(last.percent,40);assert.equal(last.job,'vaso');assert.ok(last.snapshot);
});
async function database(t){const data=await mkdtemp(join(tmpdir(),'maker-agenda-')),db=await createDatabase({data});t.after(async()=>{await db.close();await rm(data,{recursive:true,force:true});});return db;}
test('estado da impressora: token, privacidade da câmera e aviso de término',async t=>{
 const db=await database(t);let clockNow=Date.parse('2026-11-09T12:00:00Z'),family=7;const events=[];
 const printer=createPrinter({db,fail,env:{PRINTER_BRIDGE_TOKEN:'x'.repeat(32)},clock:()=>new Date(clockNow),onEvent:async(kind,info)=>{events.push([kind,info.minutes]);},printingFamily:async()=>family});
 const auth={authorization:'Bearer '+'x'.repeat(32)},jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(50)]).toString('base64'),team={role:'admin'},owner={role:'guardian',family_id:7},other={role:'guardian',family_id:8};
 await assert.rejects(printer.report('{"state":"idle"}',{authorization:'Bearer errado'}),e=>e.status===401);await assert.rejects(printer.report('{"state":"voando"}',auth));
 assert.equal((await printer.status(other)).state,'offline');
 await printer.report(JSON.stringify({state:'printing',percent:10,remainingMinutes:50,nozzle:220,job:'segredo.3mf',snapshot:jpeg}),auth);
 const seen=await printer.status(other);assert.equal(seen.state,'printing');assert.equal(seen.percent,10);assert.equal(seen.camera,false);assert.equal(seen.job,undefined);assert.equal(seen.nozzle,undefined);
 assert.equal((await printer.status(owner)).camera,true);assert.equal((await printer.status(team)).job,'segredo.3mf');
 await assert.rejects(printer.frame(other),e=>e.status===404);assert.equal((await printer.frame(owner))[0],0xff);
 clockNow+=90*60000;await printer.report(JSON.stringify({state:'finished',percent:100}),auth);await new Promise(r=>setTimeout(r,10));
 assert.deepEqual(events,[['finished',90]]);assert.equal((await printer.status(team)).lastMinutes,90);await assert.rejects(printer.frame(owner));
 clockNow+=10*60000;assert.equal((await printer.status(owner)).state,'offline');
});
// Service-level fixture: real database, quota and billing; WhatsApp and the gateway are recorded in memory.
async function fixture(t,{chargeWhen='finish'}={}){
 const db=await database(t),sent=[];let time=Date.parse('2026-11-09T13:00:00Z'),charges=0,cancels=0;
 await db.transaction(async()=>{await db.run("INSERT INTO users(id,email,name,password,role) VALUES(1,'admin@test.example','Equipe','hash','admin')");for(const [id,name] of [[1,'Família A'],[2,'Família B']])await db.run('INSERT INTO families(id,name,allowance,created) VALUES(?,?,120,?)',id,name,'2026-01-01');
  await db.run("INSERT INTO users(id,email,name,password,role,family_id) VALUES(2,'a@test.example','Ana','hash','guardian',1),(3,'b@test.example','Bia','hash','guardian',2),(4,'c@test.example','Caio','hash','learner',1)");
  for(const [fid,uid] of [[1,2],[2,3]])await db.run("INSERT INTO family_automation(family_id,primary_guardian_id,document,created,updated) VALUES(?,?,'12345678909','2026-01-01','2026-01-01')",fid,uid);
  await db.run('INSERT INTO schedule_settings(id,value) VALUES(1,?)',JSON.stringify({chargeWhen}));});
 const config=async()=>({monthly:15000,annual:150000,extra:600,markup:20,materials:[{name:'PLA',cost:10000,colors:['Azul','Verde'],active:true}]});
 const provider={id:'asaas',createCharge:async input=>({provider:'asaas',gatewayChargeId:'pay_'+(++charges),checkoutUrl:'https://www.asaas.com/i/'+charges,status:'pending',amount:input.amountCents}),cancelCharge:async()=>{cancels++;},cancelSubscription:async()=>{}};
 const broadcasts={notifyFamily:async m=>{sent.push({to:'family:'+m.familyId,text:m.text});return {queued:1};},notifyTeam:async m=>{sent.push({to:'team',text:m.text});return {queued:1};},tick:async()=>{}};
 let schedule;const billing=createBilling({db,fail,str,integer,config,provider,env:{ASAAS_ENV:'sandbox'},notify:e=>schedule.onPaid(e)});
 const event=(id,text)=>db.run('INSERT INTO events(project_id,text,created) VALUES(?,?,?)',id,text,new Date(time).toISOString());
 schedule=createSchedule({db,quota:createQuota(db),billing,broadcasts,config,fail,str,num,integer,event,clock:()=>new Date(time),env:{},body:async req=>req.b,json:(res,obj)=>{res.out=obj;}});
 const call=(u,path,b)=>db.transaction(async()=>{const res={};if(!await schedule.route({url:path,b},res,path.split('?')[0],b===undefined?'GET':'POST',u))fail('rota',404);return res.out;});
 const users={admin:{id:1,role:'admin',name:'Equipe'},ana:{id:2,role:'guardian',family_id:1,name:'Ana'},bia:{id:3,role:'guardian',family_id:2,name:'Bia'},caio:{id:4,role:'learner',family_id:1,name:'Caio'}};
 const booking=(o={})=>({name:'Vaso',participant:'Ana',quantity:1,minutes:180,filaments:[{material:'PLA',color:'Azul',grams:100}],startsAt:at('2026-11-09',14).toISOString(),...o});
 const project=id=>db.one('SELECT * FROM projects WHERE id=?',id);
 // Mirrors what the order routes do around the hooks.
 const start=id=>db.transaction(async()=>{const p=await project(id);await schedule.beforeStart(p);await db.run("UPDATE projects SET status='printing' WHERE id=?",id);await schedule.onStarted(p,users.admin);});
 const finish=(id,minutes,grams)=>db.transaction(async()=>{const p=await project(id),s=await schedule.settle(p,minutes,grams);await db.run("UPDATE projects SET status='ready',actual_minutes=?,actual_grams=?,used=?,charge=?,updated=? WHERE id=?",minutes,grams,s.used,s.charge,new Date(time).toISOString(),id);await schedule.onFinished(p,users.admin);});
 return {db,schedule,billing,call,users,booking,project,start,finish,sent,advance:m=>{time+=m*MIN;},charges:()=>charges,cancels:()=>cancels,now:()=>time};
}
test('agendamento conta na cota, some para as outras famílias e passa por validação e edição da equipe',async t=>{
 const f=await fixture(t),{users:u}=f;
 // 13:00Z is 10:00 in Itumbiara; the minimum notice is one hour.
 await assert.rejects(f.call(u.ana,'/api/schedule/bookings',f.booking({startsAt:at('2026-11-09',10,30).toISOString()})),/antecedência/);
 await assert.rejects(f.call(u.ana,'/api/schedule/bookings',f.booking({startsAt:at('2026-11-09',19).toISOString()})),/equipe presente/);
 await assert.rejects(f.call(u.ana,'/api/schedule/bookings',f.booking({filaments:[{material:'ABS',color:'Azul',grams:10}]})),/material/);
 await assert.rejects(f.call(u.admin,'/api/schedule/bookings',f.booking()),e=>e.status===403);
 const q=await f.call(u.ana,'/api/schedule/quote',f.booking());assert.deepEqual([q.included,q.extra,q.extraCost,q.materialCost,q.total],[120,60,600,1200,1800]);
 const {id}=await f.call(u.ana,'/api/schedule/bookings',f.booking());let p=await f.project(id);
 assert.deepEqual([p.status,p.included,p.charge,p.period],['queued',120,1800,'2026-11']);assert.ok(f.sent.some(m=>m.to==='team'&&/novo agendamento/.test(m.text)));
 await assert.rejects(f.call(u.bia,'/api/schedule/bookings',f.booking({startsAt:at('2026-11-09',16).toISOString()})),e=>e.status===409);
 const seen=await f.call(u.bia,'/api/schedule?from=2026-11-09&days=3');assert.deepEqual(seen.slots,[{start:at('2026-11-09',14).toISOString(),end:at('2026-11-09',17).toISOString(),busy:true}]);assert.equal(seen.bookings.length,0);assert.equal(seen.settings.teamWhatsapp,undefined);
 const mine=await f.call(u.ana,'/api/schedule?from=2026-11-09&days=3');assert.equal(mine.slots[0].name,'Vaso');assert.equal(mine.slots[0].family,undefined);assert.equal((await f.call(u.admin,'/api/schedule')).slots[0].family,'Família A');
 const free=await f.call(u.bia,'/api/schedule/suggest?minutes=60');assert.equal(free.suggestions[0],at('2026-11-09',11).toISOString());assert.equal(free.suggestions[1],at('2026-11-10',8).toISOString());
 await assert.rejects(f.call(u.bia,`/api/schedule/bookings/${id}/update`,{minutes:10}),e=>e.status===404);await assert.rejects(f.call(u.ana,`/api/schedule/bookings/${id}/validate`,{}),e=>e.status===403);
 await assert.rejects(f.start(id),/Valide/);
 // The owner may still change it before validation; afterwards only the team can, and the family is told.
 await f.call(u.ana,`/api/schedule/bookings/${id}/update`,{minutes:150});assert.equal((await f.project(id)).charge,1500);
 await f.call(u.admin,`/api/schedule/bookings/${id}/validate`,{});assert.ok(f.sent.at(-1).to==='family:1'&&/confirmado pela equipe/.test(f.sent.at(-1).text));
 await assert.rejects(f.call(u.ana,`/api/schedule/bookings/${id}/update`,{minutes:100}),/já validou/);await assert.rejects(f.call(u.admin,`/api/schedule/bookings/${id}/update`,{minutes:100}),/Motivo/);
 await f.call(u.admin,`/api/schedule/bookings/${id}/update`,{minutes:240,filaments:[{material:'PLA',color:'Verde',grams:150}],startsAt:at('2026-11-10',9).toISOString(),note:'O fatiamento deu 4 h e 150 g.'});
 p=await f.project(id);assert.deepEqual([p.minutes,p.grams,p.included,p.charge],[240,150,120,3000]);const told=f.sent.at(-1);assert.equal(told.to,'family:1');assert.match(told.text,/tempo: 2 h 30 min → 4 h/);assert.match(told.text,/valor previsto: R\$\s15,00 → R\$\s30,00/);assert.match(told.text,/O fatiamento deu/);
 // Cancelling frees the slot.
 await f.db.transaction(async()=>{await f.db.run("UPDATE projects SET status='cancelled',included=0,charge=0 WHERE id=?",id);await f.schedule.onCancelled(p,u.ana);});
 assert.equal((await f.call(u.bia,'/api/schedule?from=2026-11-09&days=3')).slots.length,0);assert.ok(/cancelou/.test(f.sent.at(-1).text));
});
test('aprendiz reserva o horário, mas o custo depende do responsável',async t=>{
 const f=await fixture(t),{users:u}=f,{id}=await f.call(u.caio,'/api/schedule/bookings',f.booking());
 let p=await f.project(id);assert.deepEqual([p.status,p.included,p.charge],['approval',0,0]);assert.ok(f.sent.some(m=>m.to==='family:1'&&/aprova/.test(m.text)));
 await assert.rejects(f.call(u.bia,'/api/schedule/bookings',f.booking()),e=>e.status===409);await assert.rejects(f.call(u.admin,`/api/schedule/bookings/${id}/validate`,{}),/responsável/);
});
test('início reorganiza a agenda; conclusão cobra o consumo real, emite o PIX e dá baixa sozinha',async t=>{
 const f=await fixture(t),{users:u}=f;
 const a=(await f.call(u.ana,'/api/schedule/bookings',f.booking({startsAt:at('2026-11-09',11).toISOString(),minutes:120,filaments:[{material:'PLA',color:'Azul',grams:50}]}))).id;
 const b=(await f.call(u.bia,'/api/schedule/bookings',f.booking({startsAt:at('2026-11-09',13,30).toISOString(),minutes:60,participant:'Bia'}))).id;
 for(const id of [a,b])await f.call(u.admin,`/api/schedule/bookings/${id}/validate`,{});
 await assert.rejects(f.start(b),/agendamento anterior/);
 f.advance(150);await f.start(a);
 // Started 90 minutes late: it now ends at 14:30, so Bia's 13:30 slot is pushed after it and she is told.
 const moved=await f.db.one('SELECT starts_at FROM print_slots WHERE project_id=?',b);assert.equal(moved.starts_at,at('2026-11-09',14,45).toISOString());assert.ok(f.sent.some(m=>m.to==='family:2'&&/passou para/.test(m.text)));assert.ok(f.sent.some(m=>m.to==='family:1'&&/começou agora/.test(m.text)));
 await f.schedule.tick();assert.equal(f.charges(),0);
 f.advance(140);await f.finish(a,140,80);
 // 120 min of the allowance were reserved; 20 extra minutes (R$ 2) plus 80 g (R$ 9,60) by real consumption.
 let p=await f.project(a);assert.deepEqual([p.used,p.charge,p.minutes,p.grams],[120,1160,140,80]);
 const ready=f.sent.filter(m=>m.to==='family:1').at(-1).text;assert.match(ready,/está pronta/);assert.match(ready,/Retire na Emersol/);assert.match(ready,/R\$\s11,60/);
 await f.schedule.tick();await f.schedule.tick();assert.equal(f.charges(),1);
 const c=await f.db.one('SELECT * FROM billing_contracts WHERE project_id=?',a);assert.deepEqual([c.amount_cents,c.method,c.status,c.created_by],[1160,'pix_cash','pending',2]);
 const before=f.sent.length;await f.billing.handleEvent({type:'payment.paid',gatewayChargeId:'pay_1',externalReference:c.id,amountCents:1160,paidDate:'2026-11-09'});await f.billing.handleEvent({type:'payment.paid',gatewayChargeId:'pay_1',externalReference:c.id,amountCents:1160,paidDate:'2026-11-09'});
 assert.equal((await f.project(a)).paid,1);const entries=await f.db.all("SELECT * FROM cash_entries WHERE category='printing'");assert.equal(entries.length,1);assert.equal(entries[0].cents,1160);
 const after=f.sent.slice(before);assert.equal(after.length,2);assert.ok(after.some(m=>m.to==='family:1'&&/Recebemos o pagamento/.test(m.text)));assert.ok(after.some(m=>m.to==='team'&&/Baixa e lançamento/.test(m.text)));
 await f.schedule.tick();assert.equal(f.charges(),1);
 // Three days later the piece is still there: one reminder, during opening hours.
 f.advance(3*1440+60);await f.schedule.tick();await f.schedule.tick();assert.equal(f.sent.filter(m=>/continua esperando/.test(m.text)).length,1);
});
test('cobrança sem CPF fica registrada para a equipe e pode ser reemitida',async t=>{
 const f=await fixture(t),{users:u}=f;await f.db.run("UPDATE family_automation SET document='' WHERE family_id=1");
 const {id}=await f.call(u.ana,'/api/schedule/bookings',f.booking({startsAt:at('2026-11-09',11).toISOString()}));await f.call(u.admin,`/api/schedule/bookings/${id}/validate`,{});
 f.advance(60);await f.start(id);await f.finish(id,180,100);await f.schedule.tick();await f.schedule.tick();
 assert.equal(f.charges(),0);assert.match((await f.db.one('SELECT charge_error FROM print_slots WHERE project_id=?',id)).charge_error,/CPF/);assert.equal(f.sent.filter(m=>m.to==='team'&&/não consegui emitir/.test(m.text)).length,1);
 await f.db.run("UPDATE family_automation SET document='12345678909' WHERE family_id=1");await f.call(u.admin,`/api/schedule/bookings/${id}/charge`,{});await f.schedule.tick();assert.equal(f.charges(),1);
});
test('modo pré-pago: PIX na validação, troca ao editar e diferença ao concluir',async t=>{
 const f=await fixture(t,{chargeWhen:'validation'}),{users:u}=f;
 const {id}=await f.call(u.ana,'/api/schedule/bookings',f.booking({startsAt:at('2026-11-09',11).toISOString(),minutes:120}));
 await f.schedule.tick();assert.equal(f.charges(),0);
 await f.call(u.admin,`/api/schedule/bookings/${id}/validate`,{});await f.schedule.tick();assert.equal(f.charges(),1);
 let c=await f.db.one("SELECT * FROM billing_contracts WHERE project_id=? AND status='pending'",id);assert.equal(c.amount_cents,1200);
 await f.call(u.admin,`/api/schedule/bookings/${id}/update`,{filaments:[{material:'PLA',color:'Azul',grams:50}],note:'Peso corrigido.'});
 await f.schedule.tick();assert.equal(f.cancels(),1);await f.schedule.tick();assert.equal(f.charges(),2);
 c=await f.db.one("SELECT * FROM billing_contracts WHERE project_id=? AND status='pending'",id);assert.equal(c.amount_cents,600);
 await f.billing.handleEvent({type:'payment.paid',gatewayChargeId:'pay_2',externalReference:c.id,amountCents:600,paidDate:'2026-11-09'});assert.equal((await f.project(id)).paid,1);
 f.advance(60);await f.start(id);await f.finish(id,150,70);
 // Real consumption: 30 extra minutes (R$ 3) + 70 g (R$ 8,40) = R$ 11,40; R$ 6 already paid.
 let p=await f.project(id);assert.deepEqual([p.charge,p.paid],[1140,0]);assert.match(f.sent.filter(m=>m.to==='family:1').at(-1).text,/Valor a pagar: R\$\s5,40 \(já recebemos R\$\s6,00\)/);
 await f.schedule.tick();assert.equal(f.charges(),3);c=await f.db.one("SELECT * FROM billing_contracts WHERE project_id=? AND status='pending'",id);assert.equal(c.amount_cents,540);
 await f.billing.handleEvent({type:'payment.paid',gatewayChargeId:'pay_3',externalReference:c.id,amountCents:540,paidDate:'2026-11-09'});
 p=await f.project(id);assert.equal(p.paid,1);assert.deepEqual((await f.db.all("SELECT cents FROM cash_entries WHERE category='printing' ORDER BY id")).map(e=>e.cents),[600,540]);
 await f.schedule.tick();assert.equal(f.charges(),3);
});

test('arquivo que a impressora começou é ligado ao pedido certo, ou a equipe escolhe',()=>{
 const now=at('2026-11-10',9),o=(id,name,h)=>({id,name,starts_at:at('2026-11-10',h).toISOString()});
 const orders=[o(1,'Cortadores de biscoito Papai Noel',14),o(2,'Vaso geométrico',9),o(3,'Chaveiro foguete',16)];
 assert.equal(matchJob('Cortadores_Papai_noel.gcode.3mf',orders,[],now).id,1);
 assert.equal(matchJob('plate_1.gcode',orders,[{project_id:3,name:'foguete-v2.3mf'}],now)?.id,2);
 assert.equal(matchJob('foguete-v2',orders,[{project_id:3,name:'foguete-v2.3mf'}],now).id,3);
 assert.equal(matchJob('',[o(1,'A',9),o(2,'B',9,30)],[],now),null);
 assert.equal(matchJob('teste da impressora',orders,[],at('2026-11-10',20)),null);
});
test('impressora inicia o pedido sozinha, a tela de conclusão vem preenchida e o filamento sai do estoque',async t=>{
 const f=await fixture(t),{users:u}=f;let last=null;f.schedule.useMeasured(()=>last);
 // Stock: 300 g of PLA Azul in two lots (oldest first) and 1000 g of PLA Verde.
 await f.db.transaction(async()=>{for(const [i,color,grams,day] of [[1,'Azul',150,'2026-10-01'],[2,'azul',150,'2026-10-05'],[3,'Verde',1000,'2026-10-02']]){await f.db.run("INSERT INTO cash_entries(id,scope,kind,category,description,cents,entry_date,created) VALUES(?,'club','expense','filament','Filamento',?,?,?)",i,grams*10,day,day);await f.db.run('INSERT INTO stock_lots(id,entry_id,material,color,grams) VALUES(?,?,?,?,?)',i,i,'PLA',color,grams);}});
 const a=(await f.call(u.ana,'/api/schedule/bookings',f.booking({name:'Cortadores Papai Noel',startsAt:at('2026-11-09',11).toISOString(),minutes:120,filaments:[{material:'PLA',color:'Azul',grams:200},{material:'PLA',color:'Verde',grams:50}]}))).id;
 const b=(await f.call(u.bia,'/api/schedule/bookings',f.booking({name:'Dragão',startsAt:at('2026-11-09',14).toISOString(),minutes:60,participant:'Bia'}))).id;
 // Not validated yet: the printer start finds no order and does nothing.
 await f.schedule.onPrinter('started',{job:'Cortadores_Papai_noel'});assert.equal((await f.project(a)).status,'queued');
 for(const id of [a,b])await f.call(u.admin,`/api/schedule/bookings/${id}/validate`,{});
 f.advance(60);await f.schedule.onPrinter('started',{job:'Cortadores_Papai_noel.gcode.3mf'});
 assert.equal((await f.project(a)).status,'printing');assert.ok(f.sent.some(m=>m.to==='team'&&/Liguei ao pedido #001/.test(m.text)));assert.ok(f.sent.some(m=>m.to==='family:1'&&/começou agora/.test(m.text)));
 // Already printing: a second start report changes nothing.
 await f.schedule.onPrinter('started',{job:'Dragão'});assert.equal((await f.project(b)).status,'queued');
 // The printer finished: the team sees the measured time and the slicer weight; the family never does.
 let slot=await f.db.transaction(()=>f.schedule.projectSlot(a,u.admin));assert.equal(slot.measured,null);
 f.advance(130);last={minutes:131,grams:238.4,job:'Cortadores_Papai_noel',state:'finished',finishedAt:new Date(f.now()).toISOString()};
 slot=await f.db.transaction(()=>f.schedule.projectSlot(a,u.admin));assert.deepEqual({...slot.measured},{minutes:131,grams:238.4,job:'Cortadores_Papai_noel',failed:false,percent:undefined});
 assert.equal((await f.db.transaction(()=>f.schedule.projectSlot(a,u.ana))).measured,null);
 // 240 g real, booked 200 Azul + 50 Verde: 192 g Azul (150 from the oldest lot, 42 from the next) and 48 g Verde.
 await f.finish(a,131,240);
 const uses=await f.db.all('SELECT lot_id,grams FROM stock_uses ORDER BY id');assert.deepEqual(uses.map(x=>[x.lot_id,x.grams]),[[1,150],[2,42],[3,48]]);
 assert.match((await f.db.all('SELECT text FROM events WHERE project_id=? ORDER BY id',a)).at(-1).text,/Baixa automática no estoque: 192 g de PLA Azul, 48 g de PLA Verde/);
 assert.ok(f.sent.some(m=>m.to==='team'&&/estoque de filamento baixo\. PLA Azul: restam 108 g/.test(m.text)));
 // A color with no lot is reported, and the team picks the order when the printer start is not clear.
 // Two validated orders close to now and a file name that matches neither: the team decides.
 const c=(await f.call(u.ana,'/api/schedule/bookings',f.booking({name:'Peça teste',startsAt:at('2026-11-09',15,30).toISOString(),minutes:30,filaments:[{material:'PLA',color:'Quero ajuda',grams:10}]}))).id;await f.call(u.admin,`/api/schedule/bookings/${c}/validate`,{});
 const before=f.sent.length;await f.schedule.onPrinter('started',{job:'calibracao'});assert.equal((await f.project(b)).status,'queued');assert.ok(f.sent.slice(before).some(m=>m.to==='team'&&/não sei de qual pedido/.test(m.text)));
 await assert.rejects(f.call(u.bia,`/api/schedule/bookings/${b}/link`,{}),e=>e.status===403);
 await f.call(u.admin,`/api/schedule/bookings/${c}/link`,{});assert.equal((await f.project(c)).status,'printing');
 await assert.rejects(f.call(u.admin,`/api/schedule/bookings/${b}/link`,{}),e=>e.status===409);
 await f.finish(c,30,10);assert.ok(f.sent.some(m=>m.to==='team'&&/10 g de PLA \(cor não definida\)/.test(m.text)));
});
test('impressão interrompida desconta do estoque o filamento gasto, sem cobrar',async t=>{
 const f=await fixture(t),{users:u}=f;let last=null;f.schedule.useMeasured(()=>last);
 await f.db.transaction(async()=>{await f.db.run("INSERT INTO cash_entries(id,scope,kind,category,description,cents,entry_date,created) VALUES(1,'club','expense','filament','Filamento',1000,'2026-10-01','2026-10-01')");await f.db.run("INSERT INTO stock_lots(id,entry_id,material,color,grams) VALUES(1,1,'PLA','Azul',500)");});
 const {id}=await f.call(u.ana,'/api/schedule/bookings',f.booking({startsAt:at('2026-11-09',11).toISOString(),minutes:120,filaments:[{material:'PLA',color:'Azul',grams:200}]}));await f.call(u.admin,`/api/schedule/bookings/${id}/validate`,{});
 f.advance(60);await f.start(id);f.advance(40);
 // The printer stopped at 25 %: the team is offered a quarter of the slicer weight.
 last={minutes:40,grams:200,percent:25,job:'Vaso',state:'failed',finishedAt:new Date(f.now()).toISOString()};
 const slot=await f.db.transaction(()=>f.schedule.projectSlot(id,u.admin));assert.deepEqual(slot.measured,{minutes:40,grams:50,job:'Vaso',failed:true,percent:25});
 const p=await f.project(id);
 await f.db.transaction(async()=>{await f.db.run("UPDATE projects SET status='failed',included=0,used=0,charge=0 WHERE id=?",id);await f.schedule.onFailed(p,u.admin,'descolou da mesa',50);});
 assert.deepEqual((await f.db.all('SELECT lot_id,grams,request_key FROM stock_uses')).map(x=>[x.lot_id,x.grams,/^project:\d+:fail-\d+:0:1$/.test(x.request_key)]),[[1,50,true]]);
 assert.equal((await f.project(id)).charge,0);assert.equal(await f.db.one('SELECT project_id FROM print_slots WHERE project_id=?',id),undefined);
 // A second attempt of the same order can fail again and spend more without colliding with the first record.
 f.advance(1);await f.db.transaction(()=>f.schedule.onFailed(p,u.admin,'de novo',20));assert.equal((await f.db.one('SELECT SUM(grams) n FROM stock_uses')).n,70);
});
