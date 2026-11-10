import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
// Printer status through Home Assistant. The Bambu Lab integration (ha-bambulab) talks to the printer on the club's
// network; the portal server reaches Home Assistant over Tailscale and reads its sensors and camera. Read only.
const stateMap={running:'printing',prepare:'printing',slicing:'printing',init:'printing',pause:'paused',finish:'finished',failed:'failed',idle:'idle'};
// translation_key of each ha-bambulab entity, in order of preference (dual-nozzle printers have left/right sensors).
const wanted={status:['print_status'],progress:['print_progress'],remaining:['remaining_time'],layer:['current_layer'],layers:['total_layers'],nozzle:['nozzle_temp','right_nozzle_temp','left_nozzle_temp'],bed:['bed_temp'],job:['subtask_name','gcode_file'],weight:['print_weight'],camera:['camera','p1p_camera']};
const DISCOVERY_MS=6*3600000,CAMERA_MS=10000;
export function cleanURL(value){
 let u;try{u=new URL(String(value||'').trim());}catch{return null;}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||(u.pathname!=='/'&&u.pathname!=='')||u.search||u.hash)return null;
 return u.origin;
}
// Groups the integration's entities by printer.
export function printers(entities,devices){
 const byDevice=new Map();
 for(const e of entities){if(e.platform!=='bambu_lab'||e.disabled_by||!e.device_id)continue;if(!byDevice.has(e.device_id))byDevice.set(e.device_id,[]);byDevice.get(e.device_id).push(e);}
 const out=[];
 for(const [id,list] of byDevice){
  const map={};for(const [k,keys] of Object.entries(wanted)){for(const key of keys){const e=list.find(x=>x.translation_key===key&&x.entity_id.split('.')[0]===(k==='camera'?'camera':'sensor'));if(e){map[k]=e.entity_id;break;}}}
  if(!map.status)continue;
  const d=devices.find(x=>x.id===id)||{};out.push({deviceId:id,name:String(d.name_by_user||d.name||'Impressora').slice(0,80),model:String(d.model||'').slice(0,40),entities:map});
 }
 // Printers first by model (the club's X2D), then by name.
 return out.sort((a,b)=>Number(/x2d/i.test(b.model))-Number(/x2d/i.test(a.model))||a.name.localeCompare(b.name));
}
const number=v=>{const n=Number(v);return v===null||v===''||!Number.isFinite(n)?null:n;};
export function toMinutes(value,unit){const n=number(value);if(n===null)return null;return Math.round(unit==='h'?n*60:unit==='s'?n/60:unit==='d'?n*1440:n);}
const celsius=(value,unit)=>{const n=number(value);return n===null?null:unit==='°F'?Math.round((n-32)*5/9*10)/10:n;};
// Values read in one template call → the state the portal keeps. Null when the printer is offline or unknown.
export function toStatus(v){
 const state=stateMap[String(v.status??'').toLowerCase()];if(!state)return null;
 const job=typeof v.job==='string'&&!['unknown','unavailable','none',''].includes(v.job.toLowerCase())?v.job:undefined;
 return {state,percent:number(v.progress),remainingMinutes:toMinutes(v.remaining,v.remaining_unit),layer:number(v.layer),totalLayers:number(v.layers),nozzle:celsius(v.nozzle,v.nozzle_unit),bed:celsius(v.bed,v.bed_unit),job,weight:number(v.weight)===null?null:v.weight_unit==='kg'?number(v.weight)*1000:number(v.weight)};
}
export function template(entities){
 const parts=[];
 for(const k of ['status','progress','remaining','layer','layers','nozzle','bed','job','weight']){const id=entities[k];if(!id)continue;parts.push(`"${k}": states(${JSON.stringify(id)})`);if(['remaining','nozzle','bed','weight'].includes(k))parts.push(`"${k}_unit": state_attr(${JSON.stringify(id)}, "unit_of_measurement")`);}
 return `{{ {${parts.join(', ')}} | tojson }}`;
}
// Home Assistant's registry is only exposed on its WebSocket API.
export async function registry(url,token,{WebSocketImpl=globalThis.WebSocket,timeout=10000}={}){
 if(!WebSocketImpl)throw new Error('Este servidor não tem WebSocket.');
 return new Promise((resolve,reject)=>{
  let ws;const results={},done=v=>{clearTimeout(timer);try{ws.close();}catch{}v instanceof Error?reject(v):resolve(v);};
  const timer=setTimeout(()=>done(new Error('O Home Assistant não respondeu a tempo.')),timeout);
  try{ws=new WebSocketImpl(url.replace(/^http/,'ws')+'/api/websocket');}catch{return done(new Error('Endereço do Home Assistant inválido.'));}
  ws.onerror=()=>done(new Error('Não foi possível conectar ao Home Assistant. Confira o endereço e o Tailscale.'));
  ws.onmessage=e=>{let m;try{m=JSON.parse(typeof e.data==='string'?e.data:Buffer.from(e.data).toString());}catch{return;}
   if(m.type==='auth_required')ws.send(JSON.stringify({type:'auth',access_token:token}));
   else if(m.type==='auth_invalid')done(Object.assign(new Error('O Home Assistant recusou o token. Gere um novo token de longa duração.'),{status:400}));
   else if(m.type==='auth_ok'){ws.send(JSON.stringify({id:1,type:'config/entity_registry/list'}));ws.send(JSON.stringify({id:2,type:'config/device_registry/list'}));}
   else if(m.type==='result'){if(!m.success)return done(Object.assign(new Error('O token precisa ser de um usuário administrador do Home Assistant.'),{status:400}));results[m.id]=m.result;if(results[1]&&results[2])done({entities:results[1],devices:results[2]});}
  };
 });
}
export function createHomeAssistant({db,ingest,fail,env=process.env,fetchImpl=fetch,WebSocketImpl=globalThis.WebSocket,clock=()=>new Date(),log=console.error}){
 // The token gives access to the whole Home Assistant, so it is encrypted at rest with a key only the server has.
 const key=createHash('sha256').update('maker3d-ha|'+(env.PRINTER_SECRET_KEY||env.SUPABASE_SECRET_KEY||env.DATABASE_URL||'maker3d-local')).digest();
 const seal=t=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([c.update(t,'utf8'),c.final()]);return [iv,c.getAuthTag(),data].map(b=>b.toString('base64')).join('.');};
 const open=s=>{try{const [iv,tag,data]=s.split('.').map(p=>Buffer.from(p,'base64')),d=createDecipheriv('aes-256-gcm',key,iv);d.setAuthTag(tag);return Buffer.concat([d.update(data),d.final()]).toString('utf8');}catch{return null;}};
 let cache=null,loaded=false,running=false,lastCamera=0;const health={lastOk:null,lastError:null};
 async function readRow(){const row=await db.withRequest(()=>db.one('SELECT value FROM schedule_settings WHERE id=1'));let v={};try{v=row?JSON.parse(row.value):{};}catch{}return v;}
 async function load(force=false){
  if(loaded&&!force)return cache;loaded=true;
  if(env.HA_URL&&env.HA_TOKEN){const url=cleanURL(env.HA_URL);cache=url?{source:'servidor',url,token:env.HA_TOKEN,...((await readRow()).homeassistant?.discovered||{})}:null;return cache;}
  const ha=(await readRow()).homeassistant;cache=null;
  if(ha?.url&&ha.token){const token=open(ha.token);if(token)cache={source:'portal',url:ha.url,token,...(ha.discovered||{})};else health.lastError='Não foi possível ler o token salvo. Conecte o Home Assistant de novo.';}
  return cache;
 }
 async function store(patch){await db.transaction(async()=>{const row=await db.one('SELECT value FROM schedule_settings WHERE id=1');let v={};try{v=row?JSON.parse(row.value):{};}catch{}
  if(patch===null)delete v.homeassistant;else v.homeassistant={...(v.homeassistant||{}),...patch};
  await db.run('INSERT INTO schedule_settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',JSON.stringify(v));});}
 const headers=token=>({Authorization:'Bearer '+token,'Content-Type':'application/json'});
 async function find(url,token){const r=await registry(url,token,{WebSocketImpl});return printers(r.entities,r.devices);}
 async function values(c){
  const r=await fetchImpl(c.url+'/api/template',{method:'POST',headers:headers(c.token),body:JSON.stringify({template:template(c.entities)}),signal:AbortSignal.timeout(10000)});
  if(r.status===401)throw new Error('O Home Assistant recusou o token.');if(!r.ok)throw new Error(`O Home Assistant respondeu ${r.status}.`);
  return JSON.parse(await r.text());
 }
 async function camera(c){
  if(!c.entities.camera)return null;
  try{const r=await fetchImpl(c.url+'/api/camera_proxy/'+encodeURIComponent(c.entities.camera)+'?width=960',{headers:{Authorization:'Bearer '+c.token},signal:AbortSignal.timeout(15000)});if(!r.ok)return null;const b=Buffer.from(await r.arrayBuffer());return b.length>3&&b.length<=1500000&&b[0]===0xff&&b[1]===0xd8?b:null;}catch{return null;}
 }
 async function tick(){
  if(running)return;running=true;
  try{
   const c=await load();if(!c)return;
   if(!c.entities||!c.checkedAt||clock().getTime()-c.checkedAt>DISCOVERY_MS){
    const list=await find(c.url,c.token),pick=list.find(p=>p.deviceId===c.deviceId)||list[0];
    if(!pick)throw new Error('O Home Assistant não tem nenhuma impressora da integração Bambu Lab.');
    const discovered={deviceId:pick.deviceId,name:pick.name,model:pick.model,entities:pick.entities,checkedAt:clock().getTime()};
    Object.assign(c,discovered);await store({discovered});
   }
   const status=toStatus(await values(c));health.lastOk=clock().toISOString();health.lastError=null;
   if(!status)return;
   let snapshot=null;
   if(['printing','paused'].includes(status.state)&&clock().getTime()-lastCamera>=CAMERA_MS){lastCamera=clock().getTime();snapshot=await camera(c);}
   await ingest({...status,model:c.model||'Bambu Lab'},snapshot);
  }catch(e){health.lastError=String(e.message||'Falha ao ler o Home Assistant.').slice(0,200);}
  finally{running=false;}
 }
 // Admin: test the address and token, find the printer, and save. The network calls run outside any transaction.
 async function connect(b){
  const env_=Boolean(env.HA_URL&&env.HA_TOKEN),current=await load(true);
  const url=env_?current?.url:cleanURL(b.url);if(!url)fail('Informe o endereço do Home Assistant, como http://100.101.102.103:8123.');
  const token=env_?current.token:(typeof b.token==='string'&&b.token.trim()?b.token.trim():current?.url===url?current.token:null);
  if(!token)fail('Cole o token de longa duração do Home Assistant.');if(token.length>2000)fail('Token inválido.');
  let list;try{list=await find(url,token);}catch(e){fail(e.message,e.status||502);}
  if(!list.length)fail('Conectei ao Home Assistant, mas ele não tem impressora da integração Bambu Lab. Instale a integração e adicione a X2D primeiro.',409);
  const pick=list.find(p=>p.deviceId===b.deviceId)||list[0];
  const discovered={deviceId:pick.deviceId,name:pick.name,model:pick.model,entities:pick.entities,checkedAt:clock().getTime()};
  await store(env_?{discovered}:{url,token:seal(token),discovered});
  await load(true);health.lastError=null;void tick();
  return {...await view(),printers:list.map(({deviceId,name,model})=>({deviceId,name,model}))};
 }
 async function remove(){if(env.HA_URL&&env.HA_TOKEN)fail('A conexão está definida no servidor (runtime.env).',409);await store(null);cache=null;loaded=false;return view();}
 async function view(){const c=await load();return {configured:Boolean(c),source:c?.source||null,url:c?.url||null,printer:c?.deviceId?{name:c.name,model:c.model,camera:Boolean(c.entities?.camera)}:null,lastOk:health.lastOk,lastError:health.lastError};}
 return {tick,connect,remove,view,load,active:()=>Boolean(cache),frame:{available:()=>Boolean(cache?.entities?.camera),get:async()=>cache?camera(cache):null}};
}
