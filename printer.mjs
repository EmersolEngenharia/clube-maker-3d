import {createHash,timingSafeEqual} from 'node:crypto';
import {isTeam} from './permissions.mjs';
// Live printer status. The printer stays on the club's local network; a small bridge (scripts/printer-bridge.mjs)
// reads it there and posts the state and a camera frame here. The portal never sends commands to the machine.
const states=['idle','printing','paused','finished','failed'];
const digest=s=>createHash('sha256').update(String(s)).digest();
export function createPrinter({db,fail,env=process.env,clock=()=>new Date(),onEvent=async()=>{},printingFamily=async()=>null,otherSource=()=>false,liveFrame=null}){
 const token=env.PRINTER_BRIDGE_TOKEN||'';
 let current=null,snapshot=null,persisted=0,loaded=false,onDemand=null,pending=null;
 async function load(){if(loaded)return;loaded=true;const row=await db.one('SELECT payload FROM printer_status WHERE id=1');if(row&&!current){try{current=JSON.parse(row.payload);}catch{}}}
 const clamp=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):null;
 async function report(raw,headers){
  const sent=String(headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token||token.length<24||!sent||!timingSafeEqual(digest(sent),digest(token)))fail('Ponte da impressora não autorizada.',401);
  let b;try{b=JSON.parse(raw);}catch{fail('Dados inválidos.');}
  let image=null;if(b&&typeof b.snapshot==="string"&&b.snapshot)image=Buffer.from(b.snapshot,"base64");
  return ingest(b,image);
 }
 // One state reading, from the bridge or from Home Assistant.
 async function ingest(b,image=null){
  if(!b||typeof b!=='object'||!states.includes(b.state))fail('Estado da impressora inválido.');
  await load();
  const now=clock(),previous=current,startedAt=b.state==='printing'||b.state==='paused'?(previous&&['printing','paused'].includes(previous.state)?previous.startedAt:now.toISOString()):previous?.startedAt||null;
  const next={state:b.state,percent:clamp(b.percent,0,100),remainingMinutes:clamp(b.remainingMinutes,0,100000),layer:clamp(b.layer,0,1000000),totalLayers:clamp(b.totalLayers,0,1000000),nozzle:clamp(b.nozzle,0,500),bed:clamp(b.bed,0,200),job:typeof b.job==='string'?b.job.slice(0,120):null,weight:clamp(b.weight,0,100000),model:typeof b.model==='string'?b.model.slice(0,40):null,startedAt,lastMinutes:previous?.lastMinutes??null,lastJob:previous?.lastJob??null,updated:now.toISOString()};
  const ended=previous&&['printing','paused'].includes(previous.state)&&['finished','failed','idle'].includes(next.state);
  if(ended&&previous.startedAt)next.lastMinutes=Math.max(1,Math.round((now.getTime()-Date.parse(previous.startedAt))/60000));
  // What the machine measured in the last job: offered to the team when it registers the real consumption.
  if(ended&&next.state!=='idle')next.lastJob={minutes:next.lastMinutes,grams:previous.weight??null,percent:previous.percent??null,job:previous.job??null,state:next.state,finishedAt:now.toISOString()};
  const began=previous&&!['printing','paused'].includes(previous.state)&&next.state==='printing';
  if(image&&image.length>3&&image.length<=1500000&&image[0]===0xff&&image[1]===0xd8)snapshot={bytes:image,at:now.getTime()};
  if(!['printing','paused'].includes(next.state))snapshot=null;
  const changed=!previous||previous.state!==next.state;current=next;
  // The database is far away: store the state when it changes or every few minutes, not on every report.
  if(changed||now.getTime()-persisted>300000){persisted=now.getTime();await db.transaction(()=>db.run('INSERT INTO printer_status(id,payload,updated) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated=excluded.updated',JSON.stringify(next),next.updated));}
  if(began)void onEvent('started',{job:next.job}).catch(()=>console.error('Falha ao ligar a impressão ao pedido.'));
  if(ended&&next.state!=='idle')void onEvent(next.state,{minutes:next.lastMinutes,job:previous.job}).catch(()=>console.error('Falha ao avisar sobre a impressora.'));
  return {ok:true};
 }
 const cameraFor=async u=>isTeam(u)||(Boolean(u.family_id)&&u.family_id===await printingFamily());
 async function status(u){
  await load();const fresh=current&&clock().getTime()-Date.parse(current.updated)<180000,team=isTeam(u);
  if(!current)return {configured:Boolean(token)||otherSource(),online:false,state:'offline'};
  const camera=fresh&&((snapshot&&clock().getTime()-snapshot.at<120000&&await cameraFor(u))||(team&&Boolean(liveFrame?.available())));
  return {configured:true,online:Boolean(fresh),state:fresh?current.state:'offline',percent:fresh?current.percent:null,remainingMinutes:fresh?current.remainingMinutes:null,layer:fresh?current.layer:null,totalLayers:fresh?current.totalLayers:null,updated:current.updated,camera:Boolean(camera),...(team?{nozzle:current.nozzle,bed:current.bed,job:current.job,model:current.model,lastMinutes:current.lastMinutes}:{})};
 }
 // The camera shows the piece on the plate, so only its owner and the team may see it.
 // Outside a print only the team sees the plate, and the frame is fetched when someone is looking (at most every 10 s).
 async function frame(u){
  if(snapshot&&clock().getTime()-snapshot.at<120000&&await cameraFor(u))return snapshot.bytes;
  if(!isTeam(u)||!liveFrame?.available())fail('Imagem indisponível.',404);
  if(!onDemand||clock().getTime()-onDemand.at>=10000){pending=pending||liveFrame.get().finally(()=>{pending=null;});const bytes=await pending;if(bytes)onDemand={bytes,at:clock().getTime()};}
  if(!onDemand||clock().getTime()-onDemand.at>=60000)fail('Imagem indisponível.',404);return onDemand.bytes;
 }
 return {report,ingest,status,frame,lastJob:()=>current?.lastJob??null};
}
