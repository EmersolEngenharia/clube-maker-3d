import {randomUUID,randomBytes} from 'node:crypto';
import {EvolutionClient,whatsappNumber} from './evolution.mjs';
// Accepted attachments, checked by content rather than by the file name.
const media=[
 {kind:'image',mime:'image/jpeg',test:b=>b[0]===0xff&&b[1]===0xd8&&b[2]===0xff},
 {kind:'image',mime:'image/png',test:b=>b.subarray(0,4).toString('hex')==='89504e47'},
 {kind:'image',mime:'image/webp',test:b=>b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'},
 {kind:'video',mime:'video/mp4',test:b=>b.subarray(4,8).toString()==='ftyp'&&!/^(3g|qt)/.test(b.subarray(8,12).toString())},
 {kind:'video',mime:'video/3gpp',test:b=>b.subarray(4,8).toString()==='ftyp'&&b.subarray(8,10).toString()==='3g'},
 {kind:'document',mime:'application/pdf',test:b=>b.subarray(0,5).toString()==='%PDF-'}
];
export const mediaType=bytes=>media.find(t=>t.test(bytes));
const statusOrder=['pending','sending','sent','needs_review','failed','cancelled'];
const firstName=n=>String(n||'').trim().split(/\s+/)[0]||'responsável';
export function createBroadcasts({db,storage,env=process.env,evolution,clock=()=>new Date(),pause=ms=>new Promise(r=>setTimeout(r,ms)),fail=(m,s=400)=>{throw Object.assign(new Error(m),{status:s});}}){
 const client=evolution||new EvolutionClient({url:env.EVOLUTION_URL,key:env.EVOLUTION_API_KEY,instance:env.EVOLUTION_INSTANCE});
 const enabled=()=>env.WHATSAPP_AUTOMATION_ENABLED==='true'&&client.configured;
 const stamp=()=>clock().toISOString();
 let running=false;
 // Only the club owner (the first administrator account) may send announcements; delegated team admins may not.
 async function owner(u){if(!u||u.role!=='admin')return false;const first=await db.withRequest(()=>db.one("SELECT MIN(id) AS id FROM users WHERE role='admin'"));return Number(first?.id)===Number(u.id);}
 async function need(u){if(!u)fail('Entre na sua conta para continuar.',401);if(!await owner(u))fail('Comunicados são exclusivos do administrador do clube.',403);}
 const recipientsSQL="SELECT u.id,u.name,u.family_id,f.name family,c.whatsapp,CASE WHEN COALESCE(a.primary_guardian_id,(SELECT MIN(x.id) FROM users x WHERE x.family_id=u.family_id AND x.role IN ('guardian','admin')))=u.id THEN 1 ELSE 0 END is_primary FROM users u JOIN families f ON f.id=u.family_id LEFT JOIN guardian_contacts c ON c.user_id=u.id LEFT JOIN family_automation a ON a.family_id=u.family_id WHERE u.role IN ('guardian','admin') ORDER BY f.name,u.name";
 async function overview(u){await need(u);
  const d=await db.withRequest(()=>db.snapshot({
   people:{sql:recipientsSQL},
   broadcasts:{sql:'SELECT b.id,b.body,b.audience,b.media_name,b.media_kind,b.created,u.name author FROM broadcasts b JOIN users u ON u.id=b.author_id ORDER BY b.created DESC LIMIT 20'},
   deliveries:{sql:'SELECT d.id,d.broadcast_id,d.status,d.last_error,d.updated,u.name,f.name family FROM broadcast_deliveries d JOIN users u ON u.id=d.user_id LEFT JOIN families f ON f.id=d.family_id WHERE d.broadcast_id IN (SELECT id FROM broadcasts ORDER BY created DESC LIMIT 20) ORDER BY f.name,u.name'}
  }));
  const recipients=d.people.map(p=>({id:p.id,name:p.name,familyId:p.family_id,family:p.family,primary:Boolean(Number(p.is_primary)),whatsappEnding:whatsappNumber(p.whatsapp)?.slice(-4)||null}));
  const history=d.broadcasts.map(b=>{const list=d.deliveries.filter(x=>x.broadcast_id===b.id).map(({broadcast_id,...x})=>x);return {...b,counts:Object.fromEntries(statusOrder.map(s=>[s,list.filter(x=>x.status===s).length])),deliveries:list};});
  return {recipients,history,enabled:enabled()};
 }
 function attachment(m){if(m==null)return null;if(typeof m!=='object'||typeof m.data!=='string'||!m.data||!/^[A-Za-z0-9+/]*={0,2}$/.test(m.data))fail('Arquivo inválido.');
  const bytes=Buffer.from(m.data,'base64');if(!bytes.length||bytes.length>10*1024*1024)fail('O arquivo deve ter entre 1 byte e 10 MB.');
  const type=media.find(t=>t.test(bytes));if(!type)fail('Envie foto (JPG, PNG ou WebP), vídeo (MP4 ou 3GP) ou PDF.');
  const name=String(m.name||'arquivo').replace(/[\\/\0-\x1f]/g,'').trim().slice(0,120)||'arquivo';return {...type,name,bytes};}
 async function create(u,b){await need(u);
  const body=typeof b.text==='string'?b.text.replace(/\r\n/g,'\n').trim():'';const file=attachment(b.media);
  if(!body&&!file)fail('Escreva a mensagem ou anexe um arquivo.');if(body.length>(file?1000:4000))fail(file?'Com anexo, o texto pode ter até 1.000 caracteres.':'A mensagem pode ter até 4.000 caracteres.');
  if(!['primary','guardians','selected'].includes(b.audience))fail('Escolha os destinatários.');
  const chosen=b.audience==='selected'?[...new Set((Array.isArray(b.userIds)?b.userIds:[]).map(Number))].filter(Number.isInteger):[];
  if(b.audience==='selected'&&!chosen.length)fail('Selecione ao menos um responsável.');
  const people=await db.withRequest(()=>db.all(recipientsSQL));
  const targets=people.filter(p=>whatsappNumber(p.whatsapp)&&(b.audience==='guardians'||(b.audience==='primary'?Number(p.is_primary):chosen.includes(Number(p.id)))));
  if(b.audience==='selected'&&chosen.some(id=>!people.some(p=>Number(p.id)===id)))fail('Responsável não encontrado.');
  if(!targets.length)fail('Nenhum destinatário com WhatsApp válido.');
  const id=randomUUID(),key=file?'broadcast-'+randomBytes(24).toString('hex'):null;
  if(file)await storage.put(key,file.bytes);
  try{await db.transaction(async()=>{
   await db.run('INSERT INTO broadcasts(id,author_id,body,audience,media_key,media_name,media_kind,media_mime,media_size,created) VALUES(?,?,?,?,?,?,?,?,?,?)',id,u.id,body,b.audience,key,file?.name??null,file?.kind??null,file?.mime??null,file?.bytes.length??null,stamp());
   for(const p of targets)await db.run('INSERT INTO broadcast_deliveries(id,broadcast_id,user_id,family_id,whatsapp,available_at,created,updated) VALUES(?,?,?,?,?,?,?,?)',randomUUID(),id,p.id,p.family_id,whatsappNumber(p.whatsapp),stamp(),stamp(),stamp());
   await db.run('INSERT INTO audit_log(user_id,action,target,created) VALUES(?,?,?,?)',u.id,'broadcast.create',id,stamp());
  });}catch(e){if(key)await storage.remove(key).catch(()=>{});throw e;}
  return {id,queued:targets.length,skipped:b.audience==='selected'?chosen.length-targets.length:0};
 }
 // Project conversation: tells the family's primary guardian that the team wrote, reusing this queue.
 async function notifyFamily({authorId,familyId,text,media=null}){
  const target=(await db.withRequest(()=>db.all(recipientsSQL))).find(p=>Number(p.family_id)===Number(familyId)&&Number(p.is_primary)&&whatsappNumber(p.whatsapp));
  if(!target)return {queued:0};
  const id=randomUUID();
  await db.transaction(async()=>{
   await db.run('INSERT INTO broadcasts(id,author_id,body,audience,media_key,media_name,media_kind,media_mime,media_size,created) VALUES(?,?,?,?,?,?,?,?,?,?)',id,authorId,text,'selected',media?.key??null,media?.name??null,media?'image':null,media?.mime??null,media?.size??null,stamp());
   await db.run('INSERT INTO broadcast_deliveries(id,broadcast_id,user_id,family_id,whatsapp,available_at,created,updated) VALUES(?,?,?,?,?,?,?,?)',randomUUID(),id,target.id,target.family_id,whatsappNumber(target.whatsapp),stamp(),stamp(),stamp());
  });
  return {queued:1};
 }
 async function retry(u,id,confirmed){await need(u);if(confirmed!==true)fail('Confirme que verificou o envio na Evolution.');
  await db.transaction(async()=>{const j=await db.one('SELECT status FROM broadcast_deliveries WHERE id=?',String(id));if(!j||!['failed','needs_review'].includes(j.status))fail('Mensagem indisponível para nova tentativa.');await db.run("UPDATE broadcast_deliveries SET status='pending',available_at=?,last_error=NULL,updated=? WHERE id=?",stamp(),stamp(),String(id));await db.run('INSERT INTO audit_log(user_id,action,target,created) VALUES(?,?,?,?)',u.id,'broadcast.retry',String(id),stamp());});return {ok:true};}
 async function cancel(u,id){await need(u);const r=await db.transaction(async()=>{const r=await db.run("UPDATE broadcast_deliveries SET status='cancelled',updated=? WHERE broadcast_id=? AND status='pending'",stamp(),String(id));await db.run('INSERT INTO audit_log(user_id,action,target,created) VALUES(?,?,?,?)',u.id,'broadcast.cancel',String(id),stamp());return r;});return {cancelled:Number(r.changes)||0};}
 async function tick(){if(running||!enabled())return;running=true;try{
  await db.transaction(()=>db.run("UPDATE broadcast_deliveries SET status='needs_review',last_error='Envio interrompido. Confira na Evolution antes de reenviar.',updated=? WHERE status='sending' AND updated<?",stamp(),new Date(clock().getTime()-300000).toISOString()));
  const jobs=await db.withRequest(()=>db.all("SELECT d.*,b.body,b.media_key,b.media_name,b.media_kind,b.media_mime,u.name FROM broadcast_deliveries d JOIN broadcasts b ON b.id=d.broadcast_id JOIN users u ON u.id=d.user_id WHERE d.status='pending' AND d.available_at<=? ORDER BY d.created,d.id LIMIT 10",stamp()));
  if(!jobs.length)return;
  let connected=false;try{connected=(await client.diagnostic()).connected;}catch{}if(!connected)return;
  const files=new Map();let first=true;
  for(const job of jobs){
   if(!first)await pause(3000);first=false;
   const claimed=await db.transaction(()=>db.run("UPDATE broadcast_deliveries SET status='sending',attempts=attempts+1,updated=? WHERE id=? AND status='pending'",stamp(),job.id));if(!Number(claimed.changes))continue;
   const text=job.body.replaceAll('{nome}',firstName(job.name));
   try{let sent;
    if(job.media_key){if(!files.has(job.media_key))files.set(job.media_key,(await storage.get(job.media_key)).toString('base64'));sent=await client.sendMedia(job.whatsapp,{kind:job.media_kind,mime:job.media_mime,name:job.media_name,data:files.get(job.media_key),caption:text});}
    else sent=await client.sendText(job.whatsapp,text);
    await db.transaction(()=>db.run("UPDATE broadcast_deliveries SET status='sent',provider_message_id=?,last_error=NULL,updated=? WHERE id=?",sent.messageId,stamp(),job.id));}
   catch(e){await db.transaction(()=>db.run('UPDATE broadcast_deliveries SET status=?,last_error=?,updated=? WHERE id=?',e.uncertain?'needs_review':'failed',e.uncertain?'Envio não confirmado. Confira a Evolution antes de reenviar.':'Envio recusado. Confira o contato, o arquivo e a instância.',stamp(),job.id));}
  }
 }finally{running=false;}}
 return {owner,overview,create,notifyFamily,retry,cancel,tick,enabled};
}
