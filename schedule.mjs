import {randomUUID} from 'node:crypto';
import {isTeam,isAdmin,canOperate} from './permissions.mjs';
import {period,allocation} from './domain.mjs';
import {analyzePrintFile} from './slicer.mjs';
import {whatsappNumber} from './messaging/evolution.mjs';

// Printer calendar. Every approved order holds one time slot; members book their own slot and the team validates it.
// Times are stored in UTC. The club works in America/Sao_Paulo, which has had a fixed -03:00 offset since 2019.
const OFFSET=-180,MIN=60000;
export const scheduleDefaults={open:'08:00',close:'18:00',days:[1,2,3,4,5],buffer:15,lead:60,horizon:30,maxMinutes:2880,maxActive:3,chargeWhen:'finish',teamWhatsapp:[],pickupDays:3,pickupPlace:'Emersol, em Itumbiara'};
const hm=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
const local=d=>new Date(new Date(d).getTime()+OFFSET*MIN);
export const fromLocal=(day,minutes=0)=>new Date(Date.parse(day+'T00:00:00Z')+(minutes-OFFSET)*MIN);
export const localDay=d=>local(d).toISOString().slice(0,10);
export function isOpen(cfg,date){const l=local(date),m=l.getUTCHours()*60+l.getUTCMinutes();return cfg.days.includes(l.getUTCDay())&&m>=hm(cfg.open)&&m<=hm(cfg.close);}
// First moment at or after `date` when someone is at the club to start a print.
export function nextOpen(cfg,date){
 let t=new Date(date);
 for(let i=0;i<15;i++){
  if(isOpen(cfg,t))return t;
  const l=local(t),m=l.getUTCHours()*60+l.getUTCMinutes(),day=l.toISOString().slice(0,10);
  t=cfg.days.includes(l.getUTCDay())&&m<hm(cfg.open)?fromLocal(day,hm(cfg.open)):fromLocal(day,1440+hm(cfg.open));
 }
 return null;
}
// Intervals are {start,end} in milliseconds. Two prints need `buffer` minutes between them to clear the plate.
export function conflict(intervals,start,end,buffer=0){const gap=buffer*MIN;return intervals.find(i=>start<i.end+gap&&end+gap>i.start)||null;}
export function nextFree(cfg,intervals,from,minutes){
 let t=nextOpen(cfg,new Date(Math.ceil(new Date(from).getTime()/(5*MIN))*5*MIN));
 for(let i=0;i<500&&t;i++){const hit=conflict(intervals,t.getTime(),t.getTime()+minutes*MIN,cfg.buffer);if(!hit)return t;t=nextOpen(cfg,new Date(Math.ceil((hit.end+cfg.buffer*MIN)/(5*MIN))*5*MIN));}
 return null;
}
// The earliest free start, then the first free start of each following day.
export function suggestions(cfg,intervals,from,minutes,count=6){
 const out=[],limit=new Date(from).getTime()+cfg.horizon*1440*MIN;let cursor=new Date(from);
 while(out.length<count){const t=nextFree(cfg,intervals,cursor,minutes);if(!t||t.getTime()>limit)break;out.push(t);cursor=fromLocal(localDay(t),1440);}
 return out;
}
// Keeps the order of the queue and pushes later any slot that now collides with a fixed one. Returns only what moved.
export function reflow(cfg,fixed,queued){
 const placed=[...fixed],moved=[];
 for(const s of [...queued].sort((a,b)=>a.start-b.start)){
  let start=s.start;const length=s.end-s.start;
  if(conflict(placed,start,start+length,cfg.buffer)){const t=nextFree(cfg,placed,new Date(start),length/MIN);if(t)start=t.getTime();}
  placed.push({start,end:start+length});if(start!==s.start)moved.push({id:s.id,start,end:start+length,from:s.start});
 }
 return moved;
}
export function cleanSettings(b,fail){
 const time=(v,label)=>{if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))fail(`${label}: use o formato HH:MM.`);return v;},int=(v,label,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)fail(`${label}: valor inválido.`);return v;};
 const open=time(b.open,'Abertura'),close=time(b.close,'Fechamento');if(hm(close)<=hm(open))fail('O fechamento deve ser depois da abertura.');
 if(!Array.isArray(b.days)||!b.days.length||b.days.some(d=>!Number.isInteger(d)||d<0||d>6))fail('Escolha os dias de funcionamento.');
 if(!['finish','validation'].includes(b.chargeWhen))fail('Momento da cobrança inválido.');
 const numbers=(Array.isArray(b.teamWhatsapp)?b.teamWhatsapp:[]).map(n=>{const v=whatsappNumber(n);if(!v)fail('WhatsApp da equipe inválido: use celular com DDD.');return v;});
 if(numbers.length>5)fail('Informe até cinco números da equipe.');
 const place=typeof b.pickupPlace==='string'&&b.pickupPlace.trim()?b.pickupPlace.trim().slice(0,120):scheduleDefaults.pickupPlace;
 return {open,close,days:[...new Set(b.days)].sort(),buffer:int(b.buffer,'Intervalo entre impressões',0,240),lead:int(b.lead,'Antecedência mínima',0,10080),horizon:int(b.horizon,'Dias de agenda aberta',1,180),maxMinutes:int(b.maxMinutes,'Duração máxima',10,10000),maxActive:int(b.maxActive,'Agendamentos por família',1,20),chargeWhen:b.chargeWhen,teamWhatsapp:[...new Set(numbers)],pickupDays:int(b.pickupDays,'Lembrete de retirada',1,30),pickupPlace:place};
}
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
const when=d=>{const p=Object.fromEntries(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(d)).map(x=>[x.type,x.value]));return `${p.weekday}, ${p.day}/${p.month} às ${p.hour}:${p.minute}`;};
const span=m=>{const h=Math.floor(m/60),r=m%60;return h?(r?`${h} h ${r} min`:`${h} h`):`${r} min`;};
const number=id=>'#'+String(id).padStart(3,'0');

export function createSchedule({db,quota,billing,broadcasts,config,fail,str,num,integer,body,json,event,env=process.env,clock=()=>new Date()}){
 const one=(q,...a)=>db.one(q,...a),all=(q,...a)=>db.all(q,...a),run=(q,...a)=>db.run(q,...a);
 const stamp=()=>clock().toISOString(),origin=env.PUBLIC_ORIGIN||'https://maker3d.emersol.ai';
 let running=false;
 const guardianLike=u=>u.role==='guardian'||(u.role==='admin'&&Boolean(u.family_id));
 async function settings(){const row=await one('SELECT value FROM schedule_settings WHERE id=1');let saved={};try{saved=row?JSON.parse(row.value):{};}catch{}const {homeassistant,...rest}=saved;return {...scheduleDefaults,...rest};}
 const slotOf=id=>one('SELECT * FROM print_slots WHERE project_id=?',id);
 async function intervals(exclude=null){
  const from=new Date(clock().getTime()-1440*MIN).toISOString();
  const slots=await all("SELECT s.project_id,s.starts_at,s.ends_at,p.status FROM print_slots s JOIN projects p ON p.id=s.project_id WHERE p.status IN ('approval','queued','printing') AND s.ends_at>?",from),blocks=await all('SELECT id,starts_at,ends_at FROM schedule_blocks WHERE ends_at>?',from);
  // A queued print whose time passed without starting no longer holds the calendar; it is replaced when it starts.
  const live=slots.filter(s=>s.project_id!==exclude&&(s.status==='printing'||Date.parse(s.ends_at)>clock().getTime()));
  return [...live.map(s=>({id:s.project_id,status:s.status,start:Date.parse(s.starts_at),end:Date.parse(s.ends_at)})),...blocks.map(b=>({block:b.id,start:Date.parse(b.starts_at),end:Date.parse(b.ends_at)}))];
 }
 function parseStart(value){const d=new Date(typeof value==='string'?value:NaN);if(!Number.isFinite(d.getTime()))fail('Escolha o dia e a hora do agendamento.');d.setUTCSeconds(0,0);return d;}
 async function checkStart(cfg,start,minutes,{team=false,exclude=null}={}){
  const t=start.getTime(),nowMs=clock().getTime();
  if(!team){
   if(minutes>cfg.maxMinutes)fail(`Cada agendamento pode ter até ${span(cfg.maxMinutes)}. Para impressões maiores, fale com a equipe.`);
   if(t<nowMs+cfg.lead*MIN)fail(`Agende com pelo menos ${span(cfg.lead)} de antecedência.`);
   if(t>nowMs+cfg.horizon*1440*MIN)fail(`A agenda está aberta para os próximos ${cfg.horizon} dias.`);
   if(!isOpen(cfg,start))fail(`A impressão precisa começar com a equipe presente: entre ${cfg.open} e ${cfg.close}, nos dias de funcionamento.`);
  }
  if(conflict(await intervals(exclude),t,t+minutes*MIN,cfg.buffer))fail('Este horário já está ocupado. Escolha um dos horários livres.',409);
 }
 // Filaments are descriptive; the cost keeps the single grams × rate formula used everywhere else.
 function readFilaments(b,cfg){
  if(!Array.isArray(b.filaments)||!b.filaments.length||b.filaments.length>4)fail('Informe de 1 a 4 filamentos.');
  const colors=cfg.materials.filter(m=>m.active).flatMap(m=>m.colors);let grams=0,cost=0;
  const rows=b.filaments.map(f=>{const m=cfg.materials.find(m=>m.active&&m.name===f?.material);if(!m)fail('Escolha um material disponível.');const color=str(f.color,'Cor',80);if(color!=='Quero ajuda'&&!colors.includes(color))fail('Escolha uma cor disponível.');const g=num(f.grams,'Peso do filamento',0.1,10000),rate=Math.round(m.cost*(1+cfg.markup/100));grams+=g;cost+=g*rate;return {material:m.name,color,grams:Math.round(g*10)/10,rate};});
  grams=Math.round(grams*10)/10;
  return {rows,grams,rate:Math.round(cost/grams),material:[...new Set(rows.map(r=>r.material))].join(' + ').slice(0,80),color:rows[0].color};
 }
 const received=async id=>Number((await one("SELECT COALESCE(SUM(cents),0) n FROM cash_entries WHERE voided_at IS NULL AND (source_key=? OR source_key LIKE ?)",'project:'+id,'project:'+id+':part:%')).n);
 async function estimate(u,b,project=null){
  const cfg=await config(),f=readFilaments(b,cfg),minutes=integer(b.minutes,'Tempo de impressão',1,10000),fid=project?.family_id??u.family_id;
  const bal=fid?await quota.balance(fid):{available:0},back=project&&['queued','printing'].includes(project.status)&&project.period===period()?project.included:0;
  const a=allocation(minutes,bal.available+back,cfg.extra),materialCost=Math.round(f.grams*f.rate/1000);
  return {minutes,grams:f.grams,included:a.included,extra:a.extra,extraCost:a.extraCost,materialCost,total:a.extraCost+materialCost,available:bal.available+back,extraRate:cfg.extra};
 }
 // Reserves the family's free minutes for a project in 'approval' and puts it in the queue.
 async function reserveNow(p){
  const b=await quota.balance(p.family_id),a=allocation(p.minutes,b.available,p.extra_rate),total=a.extraCost+Math.round(p.grams*p.material_rate/1000);
  await quota.reserve(p.id,p.family_id,a.included);
  await run("UPDATE projects SET status='queued',included=?,period=?,approved_at=?,charge=?,updated=? WHERE id=?",a.included,period(),stamp(),total,stamp(),p.id);
  return {included:a.included,total};
 }
 // New numbers for a project that already holds minutes (queued or printing): the reservation is redone.
 async function requote(p,minutes,grams,rate,material){
  let included=Math.min(p.included,minutes);
  if(p.period===period()){
   await run('DELETE FROM benefit_allocations WHERE project_id=?',p.id);await run('UPDATE projects SET included=0 WHERE id=?',p.id);
   included=Math.min(minutes,(await quota.balance(p.family_id)).available);await quota.reserve(p.id,p.family_id,included);
  }else{let room=included;for(const a of await all('SELECT * FROM benefit_allocations WHERE project_id=? ORDER BY code',p.id)){const m=Math.min(a.minutes,room);room-=m;if(!m)await run('DELETE FROM benefit_allocations WHERE project_id=? AND code=?',p.id,a.code);else if(m!==a.minutes)await run('UPDATE benefit_allocations SET minutes=? WHERE project_id=? AND code=?',m,p.id,a.code);}}
  const charge=Math.round((minutes-included)*p.extra_rate/60)+Math.round(grams*rate/1000);
  await run('UPDATE projects SET minutes=?,grams=?,material_rate=?,material=?,included=?,charge=?,updated=? WHERE id=?',minutes,grams,rate,material,included,charge,stamp(),p.id);
  return {included,charge};
 }
 async function author(){return Number((await one("SELECT MIN(id) id FROM users WHERE role='admin'"))?.id)||null;}
 const kick=()=>void broadcasts.tick().catch(()=>console.error('Falha no envio de avisos da agenda.'));
 async function tellFamily(familyId,text,by=null){try{const authorId=by??await author();if(!authorId)return;if((await broadcasts.notifyFamily({authorId,familyId,text})).queued)kick();}catch{console.error('Falha ao avisar a família sobre a agenda.');}}
 async function tellTeam(text,by=null){try{const authorId=by??await author();if(!authorId)return;if((await broadcasts.notifyTeam({authorId,text,numbers:(await settings()).teamWhatsapp})).queued)kick();}catch{console.error('Falha ao avisar a equipe sobre a agenda.');}}
 const link=id=>`${origin}/?pedido=${id}`;
 const costLine=p=>p.charge>0?`Valor previsto: ${money(p.charge)} (horas além da cota e filamento).`:'Cabe na cota da família, sem valor adicional previsto.';
 async function applyReflow(by=null){
  const cfg=await settings(),list=await intervals(),fixed=list.filter(i=>i.block||i.status==='printing'),queued=list.filter(i=>i.id&&i.status!=='printing'),moved=reflow(cfg,fixed,queued);
  for(const m of moved){
   await run('UPDATE print_slots SET starts_at=?,ends_at=?,updated=? WHERE project_id=?',new Date(m.start).toISOString(),new Date(m.end).toISOString(),stamp(),m.id);
   const p=await one('SELECT id,name,family_id FROM projects WHERE id=?',m.id);await event(m.id,`Horário ajustado pela agenda: agora ${when(m.start)}.`);
   if(Math.abs(m.start-m.from)>=10*MIN)await tellFamily(p.family_id,`Olá, {nome}! A agenda da impressora mudou e o pedido ${number(p.id)} "${p.name}" passou para ${when(m.start)}. Se o novo horário não servir, reagende pelo portal: ${link(p.id)}`,by);
  }
  return moved.length;
 }
 // Called when a guardian approves a quote, and for old queued orders: guarantees a valid slot.
 async function ensureSlot(p,u=null){
  const cfg=await settings(),s=await slotOf(p.id),minutes=Math.max(1,p.minutes),nowMs=clock().getTime();
  if(s){
   const start=Date.parse(s.starts_at),end=start+minutes*MIN;
   if(start>nowMs&&!conflict(await intervals(p.id),start,end,cfg.buffer)){if(end!==Date.parse(s.ends_at))await run('UPDATE print_slots SET ends_at=?,updated=? WHERE project_id=?',new Date(end).toISOString(),stamp(),p.id);return {...s,ends_at:new Date(end).toISOString()};}
  }
  const t=nextFree(cfg,await intervals(p.id),new Date(nowMs+(s?cfg.lead:0)*MIN),minutes)||nextOpen(cfg,new Date(nowMs))||new Date(nowMs),starts=t.toISOString(),ends=new Date(t.getTime()+minutes*MIN).toISOString();
  if(s)await run('UPDATE print_slots SET starts_at=?,ends_at=?,updated=? WHERE project_id=?',starts,ends,stamp(),p.id);
  else await run('INSERT INTO print_slots(project_id,starts_at,ends_at,created_by,self_service,filaments,est_minutes,est_grams,validated_by,validated_at,created,updated) VALUES(?,?,?,?,0,?,?,?,?,?,?,?)',p.id,starts,ends,u?.id??null,JSON.stringify(p.material?[{material:p.material,color:p.color,grams:p.grams,rate:p.material_rate}]:[]),minutes,p.grams,null,stamp(),stamp(),stamp());
  return slotOf(p.id);
 }
 async function backfill(){for(const p of await all("SELECT p.* FROM projects p WHERE p.status IN ('queued','printing') AND NOT EXISTS(SELECT 1 FROM print_slots s WHERE s.project_id=p.id) ORDER BY CASE p.status WHEN 'printing' THEN 0 ELSE 1 END,p.approved_at,p.id")){
  if(p.status==='printing'){const start=Date.parse(p.updated)||clock().getTime();await run('INSERT INTO print_slots(project_id,starts_at,ends_at,self_service,est_minutes,est_grams,validated_at,created,updated) VALUES(?,?,?,0,?,?,?,?,?)',p.id,new Date(start).toISOString(),new Date(Math.max(start+p.minutes*MIN,clock().getTime()+10*MIN)).toISOString(),p.minutes,p.grams,stamp(),stamp(),stamp());}
  else await ensureSlot(p);
 }}
 // ---- hooks called by the order routes, inside the request transaction ----
 async function onApproved(p,u){
  const had=await slotOf(p.id),s=await ensureSlot(p,u),moved=had&&had.starts_at!==s.starts_at;
  await event(p.id,`${had?(moved?'Horário anterior indisponível; novo horário':'Horário confirmado'):'Entrou na agenda da impressora'}: ${when(s.starts_at)}.`);
  if(had?.self_service&&!had.validated_at)await tellTeam(`Clube Maker 3D: o responsável aprovou o agendamento ${number(p.id)} "${p.name}" para ${when(s.starts_at)} (${span(p.minutes)}). Falta a validação da equipe: ${link(p.id)}`,u.id);
  return s;
 }
 async function beforeStart(p){
  const s=await slotOf(p.id);if(!s)return;
  if(!s.validated_at)fail('Valide o agendamento antes de iniciar a impressão.');
  const first=await one("SELECT s.project_id FROM print_slots s JOIN projects p ON p.id=s.project_id WHERE p.status='queued' AND s.validated_at IS NOT NULL ORDER BY s.starts_at,s.project_id LIMIT 1");
  if(first&&first.project_id!==p.id)fail('Há um agendamento anterior na agenda. Para adiantar este pedido, mude o horário dele antes de iniciar.');
 }
 async function onStarted(p,u){
  const s=await slotOf(p.id);if(!s)return;const start=clock(),end=new Date(start.getTime()+Math.max(1,p.minutes)*MIN);
  await run('UPDATE print_slots SET starts_at=?,ends_at=?,updated=? WHERE project_id=?',start.toISOString(),end.toISOString(),stamp(),p.id);
  await applyReflow(u.id);
  await tellFamily(p.family_id,`Olá, {nome}! A impressão do pedido ${number(p.id)} "${p.name}" começou agora. Previsão de término: ${when(end)}. Acompanhe a impressora pelo portal: ${origin}/?agenda=1`,u.id);
 }
 // Self-service bookings are charged by the real consumption: the member's own estimate is not a quote from the club.
 async function settle(p,minutes,grams){
  const s=await slotOf(p.id);if(!s?.self_service)return null;
  const r=await requote(p,minutes,grams,p.material_rate,p.material);return {used:r.included,charge:r.charge};
 }
 async function onFinished(p,u){
  const s=await slotOf(p.id);if(!s)return;const cfg=await settings(),done=await one('SELECT * FROM projects WHERE id=?',p.id),got=await received(p.id);
  await run('UPDATE print_slots SET ends_at=?,updated=? WHERE project_id=?',new Date(Math.max(clock().getTime(),Date.parse(s.starts_at)+MIN)).toISOString(),stamp(),p.id);
  if(got>0)await run('UPDATE projects SET paid=? WHERE id=?',got>=done.charge?1:0,p.id);
  const due=Math.max(0,done.charge-got),pay=due>0?`Valor a pagar: ${money(due)}${got?` (já recebemos ${money(got)})`:''}. O link do PIX chega em seguida.`:done.charge>0?'Está tudo pago. Obrigado!':'Não há valor adicional a pagar.';
  await tellFamily(p.family_id,`Olá, {nome}! A peça do pedido ${number(p.id)} "${p.name}" está pronta. 🎉\nRetire na ${cfg.pickupPlace}, de ${cfg.open} às ${cfg.close}.\nConsumo real: ${span(done.actual_minutes)} de impressão e ${done.actual_grams} g de filamento.\n${pay}\nDetalhes: ${link(p.id)}`,u.id);
  if(got>done.charge)await tellTeam(`Clube Maker 3D: o pedido ${number(p.id)} "${p.name}" terminou custando ${money(done.charge)}, mas a família já pagou ${money(got)}. Combine a devolução de ${money(got-done.charge)}.`,u.id);
 }
 async function release(p,u,text){
  const s=await slotOf(p.id);if(!s)return;const got=await received(p.id);
  await run('DELETE FROM print_slots WHERE project_id=?',p.id);
  if(canOperate(u))await tellFamily(p.family_id,`Olá, {nome}! ${text} Veja os detalhes no portal: ${link(p.id)}`,u.id);
  else await tellTeam(`Clube Maker 3D: a família cancelou o pedido ${number(p.id)} "${p.name}" (${when(s.starts_at)}). O horário voltou a ficar livre.`,u.id);
  if(got>0)await tellTeam(`Clube Maker 3D: o pedido ${number(p.id)} "${p.name}" foi encerrado com ${money(got)} já recebidos. Combine a devolução com a família.`,u.id);
 }
 const onFailed=(p,u,reason)=>release(p,u,`A impressão do pedido ${number(p.id)} "${p.name}" foi interrompida: ${reason}. Não haverá cobrança e as horas voltaram para a cota. A equipe vai preparar uma nova tentativa.`);
 const onCancelled=(p,u)=>release(p,u,`O pedido ${number(p.id)} "${p.name}" foi cancelado pela equipe, sem cobrança. As horas reservadas voltaram para a cota.`);
 // ---- views ----
 const detail=(r,u)=>({id:r.project_id,start:r.starts_at,end:r.ends_at,name:r.name,participant:r.participant,...(isTeam(u)?{family:r.family_name}:{}),status:r.status,validated:Boolean(r.validated_at),selfService:Boolean(r.self_service),minutes:r.minutes,grams:r.grams,material:r.material,quantity:r.quantity,filaments:JSON.parse(r.filaments||'[]').map(({rate,...f})=>f),estMinutes:r.est_minutes,estGrams:r.est_grams,included:r.included,charge:r.charge,paid:Boolean(r.paid),chargeError:isTeam(u)?r.charge_error:null,own:r.family_id===u.family_id});
 const slotSQL='SELECT s.*,p.family_id,p.name,p.participant,p.status,p.minutes,p.grams,p.material,p.quantity,p.included,p.charge,p.paid,f.name family_name FROM print_slots s JOIN projects p ON p.id=s.project_id JOIN families f ON f.id=p.family_id';
 async function view(u,url){
  const cfg=await settings(),team=isTeam(u),day=url.searchParams.get('from'),days=Math.min(31,Math.max(1,Number(url.searchParams.get('days'))||7));
  const from=/^\d{4}-\d{2}-\d{2}$/.test(day||'')?fromLocal(day):fromLocal(localDay(clock())),to=new Date(from.getTime()+days*1440*MIN);
  const d=await db.snapshot({
   range:{sql:slotSQL+" WHERE p.status IN ('approval','queued','printing','ready','completed') AND s.ends_at>? AND s.starts_at<? ORDER BY s.starts_at",params:[from.toISOString(),to.toISOString()]},
   open:{sql:slotSQL+" WHERE p.status IN ('approval','queued','printing','ready')"+(team?'':' AND p.family_id=?')+' ORDER BY s.starts_at',params:team?[]:[u.family_id??-1]},
   blocks:{sql:'SELECT id,starts_at,ends_at,reason FROM schedule_blocks WHERE ends_at>? AND starts_at<? ORDER BY starts_at',params:[from.toISOString(),to.toISOString()]}
  });
  const visible=r=>team||(u.family_id&&r.family_id===u.family_id),nowMs=clock().getTime();
  // A late queued slot of another family is not shown as busy: its time is already gone.
  const slots=d.range.filter(r=>visible(r)||['printing','ready','completed'].includes(r.status)||Date.parse(r.ends_at)>nowMs).map(r=>visible(r)?detail(r,u):{start:r.starts_at,end:r.ends_at,busy:true});
  const {teamWhatsapp,...shared}=cfg;
  return {now:stamp(),from:from.toISOString(),days,settings:isAdmin(u)?cfg:shared,slots,bookings:d.open.map(r=>detail(r,u)),blocks:d.blocks.map(b=>({...(team?{id:b.id}:{}),start:b.starts_at,end:b.ends_at,reason:b.reason})),canBook:Boolean(u.family_id)&&['guardian','learner','admin'].includes(u.role),canManage:canOperate(u),canConfigure:isAdmin(u)};
 }
 async function own(id,u){const p=await one('SELECT * FROM projects WHERE id=?',id);if(!p||(!isTeam(u)&&p.family_id!==u.family_id))fail('Agendamento não encontrado.',404);const s=await slotOf(id);if(!s)fail('Este pedido não tem horário na agenda.',404);return {p,s};}
 async function projectSlot(id,u){const s=await slotOf(id);if(!s)return null;return {start:s.starts_at,end:s.ends_at,validated:Boolean(s.validated_at),selfService:Boolean(s.self_service),filaments:JSON.parse(s.filaments||'[]').map(({rate,...f})=>f),estMinutes:s.est_minutes,estGrams:s.est_grams,chargeError:isTeam(u)?s.charge_error:null};}
 // ---- member and team actions ----
 async function book(u,b){
  if(!u.family_id||!['guardian','learner','admin'].includes(u.role))fail('Agendamentos são feitos pela conta da família.',403);
  const cfg=await settings(),c=await config(),f=readFilaments(b,c),minutes=integer(b.minutes,'Tempo de impressão',1,10000),start=parseStart(b.startsAt);
  const active=await all("SELECT s.project_id FROM print_slots s JOIN projects p ON p.id=s.project_id WHERE p.family_id=? AND p.status IN ('approval','queued')",u.family_id);
  if(active.length>=cfg.maxActive)fail(`Sua família já tem ${active.length} agendamentos aguardando a impressora. Conclua ou cancele um deles para agendar outro.`);
  await checkStart(cfg,start,minutes);
  const name=str(b.name,'Nome da peça',100),description=typeof b.description==='string'&&b.description.trim()?str(b.description,'Descrição',3000):'Agendamento feito pelo portal.',kind=b.hasFile===true?'file':'idea';
  const id=Number((await run('INSERT INTO projects(family_id,name,description,participant,kind,size,color,quantity,status,created,updated,minutes,grams,material,material_rate,extra_rate,quote_note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',u.family_id,name,description,str(b.participant,'Participante',80),kind,'Conforme o arquivo',f.color,integer(b.quantity,'Quantidade',1,50),'approval',stamp(),stamp(),minutes,f.grams,f.material,f.rate,c.extra,`Agendamento feito por ${u.name}. Tempo e peso informados pela família; a equipe confere antes de imprimir e registra o consumo real ao concluir.`)).lastInsertRowid);
  await run('INSERT INTO print_slots(project_id,starts_at,ends_at,created_by,self_service,filaments,est_minutes,est_grams,created,updated) VALUES(?,?,?,?,1,?,?,?,?,?)',id,start.toISOString(),new Date(start.getTime()+minutes*MIN).toISOString(),u.id,JSON.stringify(f.rows),minutes,f.grams,stamp(),stamp());
  const p=await one('SELECT * FROM projects WHERE id=?',id),summary=`${number(id)} "${name}" para ${when(start)} (${span(minutes)}, ${f.grams} g de ${f.material})`;
  if(guardianLike(u)){
   const q=await reserveNow(p);await event(id,`Agendamento registrado para ${when(start)}. ${q.included} minutos reservados da cota; valor previsto ${money(q.total)}. Aguardando a validação da equipe.`);
   await tellTeam(`Clube Maker 3D: novo agendamento ${summary}, de ${u.name}. Valide no portal: ${link(id)}`,u.id);
  }else{
   await event(id,`Agendamento registrado por ${u.name} para ${when(start)}. Aguardando a aprovação do responsável.`);
   await tellFamily(u.family_id,`Olá, {nome}! ${u.name} agendou a impressão ${summary}. O horário fica reservado enquanto você confere e aprova o valor no portal: ${link(id)}`,null);
  }
  return {id};
 }
 async function update(u,id,b){
  const {p,s}=await own(id,u),team=canOperate(u),cfg=await settings(),c=await config();
  if(!team&&isTeam(u)&&p.family_id!==u.family_id)fail('Acesso operacional necessário.',403);
  if(!['approval','queued'].includes(p.status))fail('Este agendamento não pode mais ser alterado.');
  if(!team&&s.validated_at)fail('A equipe já validou este agendamento. Para mudar, converse com a equipe pelo pedido.');
  const note=team?str(b.note,'Motivo da alteração',500):'';
  const f=b.filaments?readFilaments(b,c):null,minutes=b.minutes===undefined?p.minutes:integer(b.minutes,'Tempo de impressão',1,10000),start=b.startsAt?parseStart(b.startsAt):new Date(s.starts_at);
  const grams=f?f.grams:p.grams,rate=f?f.rate:p.material_rate,material=f?f.material:p.material,movedTime=start.getTime()!==Date.parse(s.starts_at);
  if(movedTime||minutes!==p.minutes)await checkStart(cfg,start,minutes,{team:team||!movedTime,exclude:id});
  await run('UPDATE print_slots SET starts_at=?,ends_at=?,filaments=?,est_minutes=?,est_grams=?,charge_error=NULL,updated=? WHERE project_id=?',start.toISOString(),new Date(start.getTime()+minutes*MIN).toISOString(),f?JSON.stringify(f.rows):s.filaments,minutes,grams,stamp(),id);
  let charge=p.charge,status=p.status;
  if(p.status==='queued'&&u.role==='learner'){
   // A learner cannot change an approved cost: the booking goes back to the guardian.
   await run('DELETE FROM benefit_allocations WHERE project_id=?',id);await run("UPDATE projects SET status='approval',included=0,charge=0,minutes=?,grams=?,material_rate=?,material=?,updated=? WHERE id=?",minutes,grams,rate,material,stamp(),id);status='approval';
  }else if(p.status==='queued')charge=(await requote(p,minutes,grams,rate,material)).charge;
  else await run('UPDATE projects SET minutes=?,grams=?,material_rate=?,material=?,updated=? WHERE id=?',minutes,grams,rate,material,stamp(),id);
  if(f)await run('UPDATE projects SET color=? WHERE id=?',f.color,id);
  const changes=[movedTime?`horário: ${when(s.starts_at)} → ${when(start)}`:'',minutes!==p.minutes?`tempo: ${span(p.minutes)} → ${span(minutes)}`:'',grams!==p.grams?`filamento: ${p.grams} g → ${grams} g`:'',status==='queued'&&charge!==p.charge?`valor previsto: ${money(p.charge)} → ${money(charge)}`:''].filter(Boolean);
  await event(id,`Agendamento alterado por ${team?'equipe':u.name}${changes.length?': '+changes.join('; '):''}.${note?' Motivo: '+note:''}`);
  if(team)await tellFamily(p.family_id,`Olá, {nome}! A equipe ajustou o agendamento ${number(id)} "${p.name}".\n${changes.length?changes.map(c=>'• '+c).join('\n'):'Os dados foram conferidos.'}\nMotivo: ${note}\nAgora: ${when(start)}, ${span(minutes)}. ${status==='queued'?costLine({charge}):''}\nDetalhes: ${link(id)}`,u.id);
  else{if(status==='approval'&&p.status==='queued')await tellFamily(p.family_id,`Olá, {nome}! ${u.name} alterou o agendamento ${number(id)} "${p.name}". Confira e aprove de novo no portal: ${link(id)}`,null);else await tellTeam(`Clube Maker 3D: a família alterou o agendamento ${number(id)} "${p.name}"${changes.length?' ('+changes.join('; ')+')':''}. ${link(id)}`,u.id);}
  return {ok:true};
 }
 async function validate(u,id){
  if(!canOperate(u))fail('Acesso operacional necessário.',403);const {p,s}=await own(id,u);
  if(p.status!=='queued')fail(p.status==='approval'?'O responsável da família ainda precisa aprovar este agendamento.':'Este agendamento não está aguardando validação.');
  if(s.validated_at)fail('Este agendamento já foi validado.',409);
  await run('UPDATE print_slots SET validated_by=?,validated_at=?,updated=? WHERE project_id=?',u.id,stamp(),stamp(),id);await event(id,'Agendamento validado pela equipe.');
  await tellFamily(p.family_id,`Olá, {nome}! O agendamento ${number(id)} "${p.name}" foi confirmado pela equipe. ✅\nQuando: ${when(s.starts_at)} (${span(p.minutes)}).\n${costLine(p)}\nA gente avisa quando começar e quando a peça estiver pronta. Detalhes: ${link(id)}`,u.id);
  return {ok:true};
 }
 async function retryCharge(u,id){if(!canOperate(u)&&!isAdmin(u))fail('Acesso operacional necessário.',403);const {p}=await own(id,u),got=await received(id);if(p.paid||p.charge<=got)fail('Este pedido não tem valor em aberto.');await run('UPDATE print_slots SET charge_error=NULL,charged_cents=?,updated=? WHERE project_id=?',got,stamp(),id);return {ok:true};}
 async function route(req,res,path,method,u){
  if(!path.startsWith('/api/schedule'))return false;
  const url=new URL(req.url,'http://localhost');
  if(path==='/api/schedule'&&method==='GET'){json(res,await view(u,url));return true;}
  if(path==='/api/schedule/suggest'&&method==='GET'){
   const cfg=await settings(),minutes=Math.min(10000,Math.max(1,Number(url.searchParams.get('minutes'))||60)),exclude=Number(url.searchParams.get('exclude'))||null;
   json(res,{suggestions:suggestions(cfg,await intervals(exclude),new Date(clock().getTime()+cfg.lead*MIN),minutes).map(d=>d.toISOString())});return true;
  }
  if(method!=='POST')return false;
  const b=await body(req);
  if(path==='/api/schedule/quote'){const p=b.projectId?(await own(Number(b.projectId),u)).p:null;json(res,await estimate(u,b,p));return true;}
  if(path==='/api/schedule/analyze'){
   const name=str(b.name,'Arquivo',200);if(typeof b.data!=='string'||!b.data||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data))fail('Arquivo inválido.');
   const info=analyzePrintFile(name,Buffer.from(b.data,'base64')),materials=(await config()).materials.filter(m=>m.active);
   json(res,info.sliced?{...info,filaments:info.filaments.map(f=>({...f,material:(materials.find(m=>m.name.toLowerCase()===f.type.toLowerCase())||materials.find(m=>f.type&&(f.type.toLowerCase().startsWith(m.name.toLowerCase())||m.name.toLowerCase().startsWith(f.type.toLowerCase()))))?.name||null}))}:info);return true;
  }
  if(path==='/api/schedule/bookings'){json(res,await book(u,b));return true;}
  const action=path.match(/^\/api\/schedule\/bookings\/(\d+)\/(update|validate|charge)$/);
  if(action){const id=Number(action[1]);json(res,action[2]==='update'?await update(u,id,b):action[2]==='validate'?await validate(u,id):await retryCharge(u,id));return true;}
  if(path==='/api/schedule/blocks'){
   if(!canOperate(u))fail('Acesso operacional necessário.',403);const start=parseStart(b.startsAt),end=parseStart(b.endsAt);
   if(end<=start||end.getTime()-start.getTime()>60*1440*MIN)fail('Informe um período válido de até 60 dias.');if(end.getTime()<clock().getTime())fail('O bloqueio precisa terminar no futuro.');
   if((await intervals()).some(i=>i.status==='printing'&&start.getTime()<i.end&&end.getTime()>i.start))fail('Há uma impressão em andamento neste período.',409);
   await run('INSERT INTO schedule_blocks(id,starts_at,ends_at,reason,created_by,created) VALUES(?,?,?,?,?,?)',randomUUID(),start.toISOString(),end.toISOString(),str(b.reason,'Motivo',120),u.id,stamp());
   json(res,{ok:true,moved:await applyReflow(u.id)});return true;
  }
  const block=path.match(/^\/api\/schedule\/blocks\/([a-f0-9-]+)\/remove$/);
  if(block){if(!canOperate(u))fail('Acesso operacional necessário.',403);await run('DELETE FROM schedule_blocks WHERE id=?',block[1]);json(res,{ok:true});return true;}
  if(path==='/api/schedule/settings'){
   if(!isAdmin(u))fail('Ação exclusiva da administração.',403);const row=await one('SELECT value FROM schedule_settings WHERE id=1');let kept={};try{kept=row?JSON.parse(row.value):{};}catch{}
   // The Home Assistant connection lives in the same row and is kept when the calendar rules change.
   const value=JSON.stringify({...cleanSettings(b,fail),...(kept.homeassistant?{homeassistant:kept.homeassistant}:{})});
   await run('INSERT INTO schedule_settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',value);await run('INSERT INTO audit_log(user_id,action,target,created) VALUES(?,?,?,?)',u.id,'schedule.settings','1',stamp());json(res,{ok:true});return true;
  }
  return false;
 }
 // ---- background work: charges, overruns and pickup reminders. Runs outside any request transaction. ----
 async function primary(fid){return db.withRequest(async()=>(await one("SELECT u.id,u.name,u.email,c.whatsapp,a.document,a.billing_enabled FROM family_automation a JOIN users u ON u.id=a.primary_guardian_id AND u.family_id=a.family_id LEFT JOIN guardian_contacts c ON c.user_id=u.id WHERE a.family_id=?",fid))||(await one("SELECT u.id,u.name,u.email,c.whatsapp,'' document,1 billing_enabled FROM users u LEFT JOIN guardian_contacts c ON c.user_id=u.id WHERE u.family_id=? AND u.role IN ('guardian','admin') ORDER BY u.id LIMIT 1",fid))||null);}
 async function chargeFailed(p,message){await db.transaction(()=>run('UPDATE print_slots SET charge_error=?,updated=? WHERE project_id=?',message,stamp(),p.id));await db.transaction(()=>tellTeam(`Clube Maker 3D: não consegui emitir a cobrança do pedido ${number(p.id)} "${p.name}" (${money(p.charge)}). ${message} Resolva e use "Emitir cobrança" no pedido: ${link(p.id)}`));}
 async function charges(){
  const cfg=await db.withRequest(()=>settings());
  const rows=await db.withRequest(()=>all("SELECT p.*,s.charged_cents,s.validated_at FROM print_slots s JOIN projects p ON p.id=s.project_id WHERE p.charge>0 AND s.charge_error IS NULL AND p.status IN ('queued','printing','ready','completed') ORDER BY p.id"));
  for(const p of rows){try{
   if(['queued','printing'].includes(p.status)&&!(cfg.chargeWhen==='validation'&&p.validated_at))continue;
   const state=await db.withRequest(async()=>({got:await received(p.id),pending:await one("SELECT * FROM billing_contracts WHERE project_id=? AND status IN ('creating','pending','needs_review')",p.id),count:Number((await one('SELECT COUNT(*) n FROM billing_contracts WHERE project_id=?',p.id)).n)})),due=p.charge-state.got;
   let g=null;const actor=async()=>{g=g||await primary(p.family_id);return g?{id:g.id,name:g.name,email:g.email,role:'guardian',family_id:p.family_id}:null;};
   if(state.pending){
    const c=state.pending;
    if(c.status==='pending'&&c.amount_cents!==due&&c.request_key.startsWith('agenda:')){
     // The cost changed after the PIX was issued: the old charge is cancelled and a new one follows.
     const who=await actor();if(!who)continue;
     try{await billing.cancel(c.id,who);await db.transaction(()=>run('UPDATE print_slots SET charged_cents=?,updated=? WHERE project_id=?',state.got,stamp(),p.id));}catch{await chargeFailed(p,'Não foi possível cancelar a cobrança anterior, de outro valor.');}
    }else if(p.charged_cents<p.charge&&c.amount_cents===due)await db.transaction(()=>run('UPDATE print_slots SET charged_cents=?,updated=? WHERE project_id=?',p.charge,stamp(),p.id));
    continue;
   }
   if(due<=0){if(!p.paid)await db.transaction(()=>run('UPDATE projects SET paid=1 WHERE id=?',p.id));continue;}
   if(p.charged_cents>=p.charge)continue;
   if(!billing.automatic){
    // Without the payment gateway there is no link: the family is told the amount and the team registers the receipt.
    await db.transaction(async()=>{await run('UPDATE print_slots SET charged_cents=?,updated=? WHERE project_id=?',p.charge,stamp(),p.id);await tellFamily(p.family_id,`Olá, {nome}! O pedido ${number(p.id)} "${p.name}" tem ${money(due)} a pagar (horas além da cota e filamento). Pague por PIX para a equipe ou na retirada. Detalhes: ${link(p.id)}`);});continue;
   }
   const who=await actor();if(!who){await chargeFailed(p,'A família não tem responsável principal.');continue;}
   if(!Number(g.billing_enabled)){await chargeFailed(p,'A cobrança automática está desativada para esta família.');continue;}
   try{await billing.create({familyId:p.family_id,projectId:p.id,purpose:'project',method:'pix_cash',requestKey:`agenda:${p.id}:${state.count+1}`,customer:{name:g.name,email:g.email,document:g.document,phone:g.whatsapp||''}},who);}
   catch(e){await chargeFailed(p,e.status&&e.status<500?e.message:'A emissão falhou. Confira a tela Cobranças antes de tentar de novo.');continue;}
   await db.transaction(()=>run('UPDATE print_slots SET charged_cents=?,updated=? WHERE project_id=?',p.charge,stamp(),p.id));
  }catch{console.error('Falha ao processar cobrança da agenda.');}}
 }
 async function overruns(){
  const s=await db.withRequest(()=>one("SELECT s.project_id,s.ends_at FROM print_slots s JOIN projects p ON p.id=s.project_id WHERE p.status='printing'"));
  if(s&&Date.parse(s.ends_at)<clock().getTime())await db.transaction(async()=>{await run('UPDATE print_slots SET ends_at=?,updated=? WHERE project_id=?',new Date(clock().getTime()+10*MIN).toISOString(),stamp(),s.project_id);await applyReflow();});
 }
 async function reminders(){
  const cfg=await db.withRequest(()=>settings()),hour=local(clock()).getUTCHours();if(hour<9||hour>=18)return;
  const rows=await db.withRequest(()=>all("SELECT p.id,p.name,p.family_id FROM print_slots s JOIN projects p ON p.id=s.project_id WHERE p.status='ready' AND s.pickup_reminded_at IS NULL AND p.updated<?",new Date(clock().getTime()-cfg.pickupDays*1440*MIN).toISOString()));
  for(const p of rows)await db.transaction(async()=>{await run('UPDATE print_slots SET pickup_reminded_at=? WHERE project_id=?',stamp(),p.id);await tellFamily(p.family_id,`Olá, {nome}! A peça do pedido ${number(p.id)} "${p.name}" continua esperando por você na ${cfg.pickupPlace}. Passe para retirar de ${cfg.open} às ${cfg.close}.`);});
 }
 async function tick(){if(running)return;running=true;try{for(const job of [overruns,charges,reminders]){try{await job();}catch{console.error('Falha no ciclo da agenda.');}}}finally{running=false;}}
 // Payment confirmed by the gateway (or registered by hand in Cobranças): tell the family and the team.
 async function onPaid(e){
  const c=await db.withRequest(()=>one('SELECT b.*,f.name family_name,p.name project_name FROM billing_contracts b JOIN families f ON f.id=b.family_id LEFT JOIN projects p ON p.id=b.project_id WHERE b.id=?',e.externalReference));if(!c)return;
  const what=c.project_id?`do pedido ${number(c.project_id)} "${c.project_name}"`:(c.plan==='annual'?'da anuidade':'da mensalidade');
  await db.transaction(async()=>{
   await tellFamily(c.family_id,`Olá, {nome}! Recebemos o pagamento ${what}: ${money(e.amountCents)}. Obrigado! 💚\nEquipe Clube Maker 3D`);
   await tellTeam(`Clube Maker 3D: pagamento recebido de ${c.family_name}, ${what}: ${money(e.amountCents)}. Baixa e lançamento no caixa feitos automaticamente.`);
  });
 }
 async function onManualPaid(p,u){await tellFamily(p.family_id,`Olá, {nome}! Recebemos o pagamento do pedido ${number(p.id)} "${p.name}": ${money(p.charge)}. Obrigado! 💚\nEquipe Clube Maker 3D`,u.id);}
 // Events reported by the printer bridge.
 async function onPrinter(kind,info={}){
  const p=await db.withRequest(()=>one("SELECT id,name,family_id FROM projects WHERE status='printing'"));
  await db.transaction(async()=>{
   if(kind==='finished'){
    await tellTeam(`Clube Maker 3D: a impressora terminou${p?` o pedido ${number(p.id)} "${p.name}"`:' um trabalho'}${info.minutes?` em ${span(info.minutes)}`:''}. ${p?`Registre o consumo real para avisar a família e gerar a cobrança: ${link(p.id)}`:'Não há pedido em impressão no portal.'}`);
    if(p){await event(p.id,`A impressora avisou que terminou${info.minutes?` (${span(info.minutes)} medidos)`:''}. Aguardando a conferência da equipe.`);await tellFamily(p.family_id,`Olá, {nome}! A impressora terminou a peça do pedido ${number(p.id)} "${p.name}". A equipe vai conferir e avisa quando estiver liberada para retirada.`);}
   }else if(kind==='failed')await tellTeam(`Clube Maker 3D: a impressora parou com erro${p?` durante o pedido ${number(p.id)} "${p.name}"`:''}. Confira a máquina${p?` e registre no portal: ${link(p.id)}`:'.'}`);
  });
 }
 return {route,settings,backfill,ensureSlot,onApproved,beforeStart,onStarted,settle,onFinished,onFailed,onCancelled,projectSlot,tick,onPaid,onManualPaid,onPrinter,printingFamily:async()=>(await one("SELECT family_id FROM projects WHERE status='printing'"))?.family_id??null};
}
