import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cleanURL,printers,toStatus,toMinutes,template,createHomeAssistant} from '../homeassistant.mjs';
import {createPrinter} from '../printer.mjs';
import {createDatabase} from '../db.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const entity=(device,key,id)=>({platform:'bambu_lab',device_id:device,translation_key:key,entity_id:id,disabled_by:null});
const registryRows=[entity('d1','print_status','sensor.x2d_status_da_impressao'),entity('d1','print_progress','sensor.x2d_progresso'),entity('d1','remaining_time','sensor.x2d_tempo_restante'),entity('d1','current_layer','sensor.x2d_camada'),entity('d1','total_layers','sensor.x2d_camadas'),entity('d1','left_nozzle_temp','sensor.x2d_bico_esquerdo'),entity('d1','right_nozzle_temp','sensor.x2d_bico_direito'),entity('d1','bed_temp','sensor.x2d_mesa'),entity('d1','subtask_name','sensor.x2d_tarefa'),entity('d1','camera','camera.x2d_camera'),{...entity('d2','print_status','sensor.outra'),disabled_by:'user'},{platform:'hue',device_id:'d3',translation_key:'print_status',entity_id:'sensor.hue'}];
const deviceRows=[{id:'d1',name:'X2D',name_by_user:'Impressora do clube',model:'X2D'},{id:'d3',name:'Luz'}];

test('mapeamento de entidades e valores da integração Bambu Lab',()=>{
 assert.equal(cleanURL('http://100.64.1.2:8123/'),'http://100.64.1.2:8123');assert.equal(cleanURL('http://ha.local:8123/api'),null);assert.equal(cleanURL('ftp://x'),null);assert.equal(cleanURL('http://u:p@x'),null);
 const list=printers(registryRows,deviceRows);assert.equal(list.length,1);assert.deepEqual(list[0],{deviceId:'d1',name:'Impressora do clube',model:'X2D',entities:{status:'sensor.x2d_status_da_impressao',progress:'sensor.x2d_progresso',remaining:'sensor.x2d_tempo_restante',layer:'sensor.x2d_camada',layers:'sensor.x2d_camadas',nozzle:'sensor.x2d_bico_direito',bed:'sensor.x2d_mesa',job:'sensor.x2d_tarefa',camera:'camera.x2d_camera'}});
 assert.match(template(list[0].entities),/"remaining_unit": state_attr\("sensor.x2d_tempo_restante", "unit_of_measurement"\)/);
 assert.equal(toMinutes('1.5','h'),90);assert.equal(toMinutes('unavailable','min'),null);
 assert.deepEqual(toStatus({status:'running',progress:'42',remaining:'2.25',remaining_unit:'h',layer:'10',layers:'200',nozzle:'428',nozzle_unit:'°F',bed:'60',job:'vaso'}),{state:'printing',percent:42,remainingMinutes:135,layer:10,totalLayers:200,nozzle:220,bed:60,job:'vaso'});
 assert.equal(toStatus({status:'offline'}),null);assert.equal(toStatus({status:'pause'}).state,'paused');assert.equal(toStatus({status:'FINISH',job:'unknown'}).job,undefined);
});
// A tiny Home Assistant: REST template + camera, and the WebSocket registry with real framing.
function fakeHA(token){
 const state={status:'running',progress:'10',remaining:'60',remaining_unit:'min',layer:'1',layers:'100',nozzle:'220',nozzle_unit:'°C',bed:'60',bed_unit:'°C',job:'vaso'},jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(100)]),calls={template:0,camera:0,ws:0};
 const server=http.createServer((req,res)=>{
  if(req.headers.authorization!=='Bearer '+token){res.writeHead(401);return res.end('{}');}
  let body='';req.on('data',c=>body+=c);req.on('end',()=>{
   if(req.url==='/api/template'){calls.template++;assert.match(JSON.parse(body).template,/states\("sensor.x2d_status_da_impressao"\)/);res.end(JSON.stringify(state));}
   else if(req.url.startsWith('/api/camera_proxy/camera.x2d_camera?width=960')){calls.camera++;res.writeHead(200,{'Content-Type':'image/jpeg'});res.end(jpeg);}
   else{res.writeHead(404);res.end();}
  });
 });
 server.on('upgrade',(req,socket)=>{
  calls.ws++;socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')+'\r\n\r\n');
  const send=o=>{const p=Buffer.from(JSON.stringify(o)),h=p.length<126?Buffer.from([0x81,p.length]):Buffer.from([0x81,126,p.length>>8,p.length&255]);socket.write(Buffer.concat([h,p]));};
  let buf=Buffer.alloc(0);
  socket.on('data',c=>{buf=Buffer.concat([buf,c]);while(buf.length>=6){let len=buf[1]&127,at=2;if(len===126){len=buf.readUInt16BE(2);at=4;}if(buf.length<at+4+len)break;const mask=buf.subarray(at,at+4),data=Buffer.from(buf.subarray(at+4,at+4+len)).map((b,i)=>b^mask[i%4]),op=buf[0]&15;buf=buf.subarray(at+4+len);if(op===8){socket.end();return;}if(op!==1)continue;
   const m=JSON.parse(data.toString());if(m.type==='auth')send(m.access_token===token?{type:'auth_ok'}:{type:'auth_invalid'});else if(m.type==='config/entity_registry/list')send({id:m.id,type:'result',success:true,result:registryRows});else if(m.type==='config/device_registry/list')send({id:m.id,type:'result',success:true,result:deviceRows});}});
  socket.on('error',()=>{});send({type:'auth_required'});
 });
 return {server,state,calls};
}
test('portal encontra a X2D no Home Assistant, lê o estado e a câmera e avisa o término',async t=>{
 const data=await mkdtemp(join(tmpdir(),'maker-ha-')),db=await createDatabase({data}),ha=fakeHA('token-certo');ha.server.listen(0,'127.0.0.1');await once(ha.server,'listening');
 t.after(async()=>{ha.server.close();await db.close();await rm(data,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+ha.server.address().port;let now=Date.parse('2026-11-10T12:00:00Z');const events=[];
 let assistant;const printer=createPrinter({db,fail,env:{},clock:()=>new Date(now),onEvent:async(k,i)=>{events.push([k,i.minutes]);},printingFamily:async()=>1,otherSource:()=>assistant.active()});
 assistant=createHomeAssistant({db,fail,env:{DATABASE_URL:'postgres://segredo'},clock:()=>new Date(now),ingest:(s,i)=>printer.ingest(s,i)});
 assert.equal((await printer.status({role:'admin'})).configured,false);
 await assert.rejects(assistant.connect({url:'nao é url',token:'x'}),/endereço/);
 await assert.rejects(assistant.connect({url,token:'token-errado'}),/recusou o token/);
 const r=await assistant.connect({url,token:'token-certo'});assert.equal(r.configured,true);assert.equal(r.printer.name,'Impressora do clube');assert.equal(r.printer.camera,true);assert.deepEqual(r.printers.map(p=>p.model),['X2D']);
 // The token is stored encrypted, never in clear text, and never sent back.
 const row=(await db.one('SELECT value FROM schedule_settings WHERE id=1')).value;assert.ok(!row.includes('token-certo'));assert.ok(!JSON.stringify(await assistant.view()).includes('token-certo'));
 for(let i=0;i<50&&!(await printer.status({role:'admin'})).online;i++)await new Promise(r=>setTimeout(r,10));
 let s=await printer.status({role:'admin'});assert.equal(s.state,'printing');assert.equal(s.percent,10);assert.equal(s.camera,true);assert.equal(s.job,'vaso');assert.equal(s.model,'X2D');
 assert.equal((await printer.status({role:'guardian',family_id:2})).camera,false);
 // Restart: a new instance reads the saved connection without the WebSocket discovery again.
 const again=createHomeAssistant({db,fail,env:{DATABASE_URL:'postgres://segredo'},clock:()=>new Date(now),ingest:(s,i)=>printer.ingest(s,i)});await again.load();assert.equal(again.active(),true);const ws=ha.calls.ws;
 now+=45*60000;Object.assign(ha.state,{status:'finish',progress:'100',remaining:'0'});await again.tick();assert.equal(ha.calls.ws,ws);
 await new Promise(r=>setTimeout(r,10));assert.deepEqual(events,[['finished',45]]);assert.equal((await printer.status({role:'admin'})).state,'finished');
 // Another server key cannot read the token: it asks to reconnect instead of failing silently.
 const other=createHomeAssistant({db,fail,env:{DATABASE_URL:'outro'},ingest:async()=>{}});await other.load();assert.equal(other.active(),false);assert.match((await other.view()).lastError,/Conecte o Home Assistant de novo/);
 // Saving calendar rules keeps the connection.
 await again.remove();assert.equal((await again.view()).configured,false);
});
