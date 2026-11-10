#!/usr/bin/env node
// Ponte da impressora: roda num computador da rede local da Emersol (Node 20+), lê o estado da Bambu Lab
// pelo MQTT local e envia ao portal. Só leitura: nunca envia comandos à impressora.
// Configuração por variáveis de ambiente — veja docs/IMPRESSORA.md.
import tls from 'node:tls';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// ---- MQTT 3.1.1 mínimo (CONNECT, SUBSCRIBE, PUBLISH QoS 0, PING) ----
const text=s=>{const b=Buffer.from(String(s));const len=Buffer.alloc(2);len.writeUInt16BE(b.length);return Buffer.concat([len,b]);};
function packet(type,body){const size=[];let n=body.length;do{let d=n%128;n=Math.floor(n/128);if(n)d|=128;size.push(d);}while(n);return Buffer.concat([Buffer.from([type,...size]),body]);}
export const mqtt={
 connect:({clientId,username,password})=>packet(0x10,Buffer.concat([text('MQTT'),Buffer.from([4,0xc2,0,60]),text(clientId),text(username),text(password)])),
 subscribe:(id,topic)=>packet(0x82,Buffer.concat([Buffer.from([id>>8,id&255]),text(topic),Buffer.from([0])])),
 publish:(topic,payload)=>packet(0x30,Buffer.concat([text(topic),Buffer.from(payload)])),
 ping:()=>Buffer.from([0xc0,0])
};
// Splits the stream into packets; returns the parsed packets and the unread remainder.
export function parsePackets(buffer){
 const packets=[];let at=0;
 while(at<buffer.length){
  let size=0,shift=0,i=at+1,done=false;
  for(;i<buffer.length&&i<at+5;i++){size+=(buffer[i]&127)<<shift;shift+=7;if(!(buffer[i]&128)){done=true;i++;break;}}
  if(!done||i+size>buffer.length)break;
  const type=buffer[at]>>4,flags=buffer[at]&15,body=buffer.subarray(i,i+size);
  if(type===3){const tl=body.readUInt16BE(0),qos=(flags>>1)&3,skip=2+tl+(qos?2:0);packets.push({type,topic:body.toString('utf8',2,2+tl),payload:body.subarray(skip),qos,id:qos?body.readUInt16BE(2+tl):0});}
  else packets.push({type,code:type===2?body[1]:undefined});
  at=i+size;
 }
 return {packets,rest:buffer.subarray(at)};
}
// ---- Bambu Lab report → portal state ----
const stateOf={RUNNING:'printing',PREPARE:'printing',SLICING:'printing',PAUSE:'paused',FINISH:'finished',FAILED:'failed',IDLE:'idle'};
const numeric=v=>typeof v==='number'&&Number.isFinite(v)?v:undefined;
// The printer sends either the full status or only what changed, so reports are merged over the last known one.
export function mergeReport(previous,message){return message?.print&&typeof message.print==='object'?{...previous,...message.print}:previous;}
export function toStatus(print,model=''){
 const state=stateOf[print.gcode_state];if(!state)return null;
 return {state,percent:numeric(print.mc_percent),remainingMinutes:numeric(print.mc_remaining_time),layer:numeric(print.layer_num),totalLayers:numeric(print.total_layer_num),nozzle:numeric(print.nozzle_temper),bed:numeric(print.bed_temper),job:typeof print.subtask_name==='string'?print.subtask_name:undefined,model};
}
function grabFrame(url,ffmpeg='ffmpeg'){
 return new Promise(resolve=>{
  let child;const chunks=[];
  try{child=spawn(ffmpeg,['-loglevel','error','-rtsp_transport','tcp','-i',url,'-frames:v','1','-vf','scale=960:-2','-q:v','7','-f','image2pipe','-vcodec','mjpeg','pipe:1'],{stdio:['ignore','pipe','ignore']});}catch{return resolve(null);}
  const timer=setTimeout(()=>child.kill('SIGKILL'),15000);
  child.stdout.on('data',c=>chunks.push(c));child.on('error',()=>{clearTimeout(timer);resolve(null);});
  child.on('close',()=>{clearTimeout(timer);const b=Buffer.concat(chunks);resolve(b.length>100&&b.length<1400000?b:null);});
 });
}
export function startBridge({host,port=8883,serial,accessCode,portal,token,model='',camera='',useTls=true,interval=15000,cameraInterval=10000,log=console.log,fetchImpl=fetch,frame=grabFrame}){
 let print={},socket=null,stopped=false,buffer=Buffer.alloc(0),lastFrame=null,lastFrameAt=0,grabbing=false,retry=2000;
 const timers=[];
 async function send(){
  const status=toStatus(print,model);if(!status)return;
  const working=['printing','paused'].includes(status.state);
  if(camera&&working&&!grabbing&&Date.now()-lastFrameAt>=cameraInterval){grabbing=true;frame(camera).then(b=>{if(b){lastFrame=b;lastFrameAt=Date.now();}}).finally(()=>{grabbing=false;});}
  const fresh=working&&lastFrame&&Date.now()-lastFrameAt<60000;
  try{const r=await fetchImpl(new URL('/api/printer/report',portal),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...status,...(fresh?{snapshot:lastFrame.toString('base64')}:{})}),signal:AbortSignal.timeout(20000)});if(!r.ok)log(`Portal recusou o envio (${r.status}).`);}
  catch{log('Portal fora de alcance; nova tentativa em instantes.');}
 }
 function connect(){
  if(stopped)return;buffer=Buffer.alloc(0);
  // The printer uses a self-signed certificate; this connection never leaves the local network.
  socket=useTls?tls.connect({host,port,rejectUnauthorized:false}):net.connect({host,port});
  socket.once(useTls?'secureConnect':'connect',()=>socket.write(mqtt.connect({clientId:'maker3d-'+Math.random().toString(16).slice(2,10),username:'bblp',password:accessCode})));
  socket.on('data',chunk=>{
   const parsed=parsePackets(Buffer.concat([buffer,chunk]));buffer=parsed.rest;
   for(const p of parsed.packets){
    if(p.type===2){if(p.code){log('A impressora recusou a conexão. Confira o código de acesso e o modo LAN.');socket.destroy();return;}retry=2000;log('Conectada à impressora.');socket.write(mqtt.subscribe(1,`device/${serial}/report`));socket.write(mqtt.publish(`device/${serial}/request`,JSON.stringify({pushing:{sequence_id:'0',command:'pushall'}})));}
    else if(p.type===3){if(p.qos===1)socket.write(Buffer.from([0x40,2,p.id>>8,p.id&255]));try{const before=print.gcode_state;print=mergeReport(print,JSON.parse(p.payload.toString('utf8')));if(print.gcode_state!==before)void send();}catch{}}
   }
  });
  socket.on('error',()=>{});
  socket.on('close',()=>{if(stopped)return;log('Sem conexão com a impressora; tentando de novo.');setTimeout(connect,retry);retry=Math.min(60000,retry*2);});
 }
 connect();
 timers.push(setInterval(()=>void send(),interval),setInterval(()=>{if(socket?.writable)socket.write(mqtt.ping());},30000));
 return {stop(){stopped=true;timers.forEach(clearInterval);socket?.destroy();},send};
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const e=process.env,missing=['PRINTER_HOST','PRINTER_SERIAL','PRINTER_ACCESS_CODE','PRINTER_BRIDGE_TOKEN'].filter(k=>!e[k]);
 if(missing.length){console.error('Faltam variáveis: '+missing.join(', ')+'. Veja docs/IMPRESSORA.md.');process.exit(1);}
 const camera=e.PRINTER_CAMERA==='off'?'':(e.PRINTER_CAMERA_URL||`rtsps://bblp:${e.PRINTER_ACCESS_CODE}@${e.PRINTER_HOST}:322/streaming/live/1`);
 startBridge({host:e.PRINTER_HOST,serial:e.PRINTER_SERIAL,accessCode:e.PRINTER_ACCESS_CODE,portal:e.PORTAL_URL||'https://maker3d.emersol.ai',token:e.PRINTER_BRIDGE_TOKEN,model:e.PRINTER_MODEL||'Bambu Lab X2D',camera});
 console.log('Ponte da impressora iniciada.');
}
