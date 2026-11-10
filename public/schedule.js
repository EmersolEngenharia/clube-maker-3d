// Agenda da impressora: calendar with free and busy times, self-service booking, team validation and live printer status.
const schedDeep={pedido:new URLSearchParams(location.search).get('pedido'),agenda:new URLSearchParams(location.search).get('agenda')};
const schedPad=n=>String(n).padStart(2,'0');
const schedDay=d=>`${d.getFullYear()}-${schedPad(d.getMonth()+1)}-${schedPad(d.getDate())}`;
const schedInput=ms=>{const d=new Date(ms);return `${schedDay(d)}T${schedPad(d.getHours())}:${schedPad(d.getMinutes())}`;};
const schedWhen=v=>new Date(v).toLocaleString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const schedTime=v=>new Date(v).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const schedSpan=m=>{m=Math.round(m);const h=Math.floor(m/60),r=m%60;return h?(r?`${h} h ${r} min`:`${h} h`):`${r} min`;};
const schedDays=()=>window.innerWidth<760?3:7;
const printerLabels={offline:'Sem conexão com a impressora',idle:'Livre',printing:'Imprimindo agora',paused:'Impressão em pausa',finished:'Terminou · peça na mesa',failed:'Parada · a equipe vai conferir'};
let schedTimer=null,schedTicks=0,schedPreview=null,schedLoading=false;
// The image is swapped only after the new frame loaded, so a slow or missing frame never shows as broken.
function schedFrame(){const img=$('#printer-live');if(!img||schedLoading)return;schedLoading=true;const next=new Image();next.onload=()=>{schedLoading=false;img.src=next.src;img.closest('.printer-frame')?.classList.add('ready');};next.onerror=()=>{schedLoading=false;};next.src='/api/printer/snapshot?t='+Date.now();}
async function loadSchedule(){
 const from=state.scheduleFrom||schedDay(new Date()),[s,p]=await Promise.all([api(`/schedule?from=${from}&days=${schedDays()}`),api('/printer')]);
 state.schedule=s;state.printer=p;
 if(!schedTimer)schedTimer=setInterval(schedLive,5000);
}
// Every 5 s the camera frame is swapped; every 15 s the printer numbers are read again. Stops when the page is left.
async function schedLive(){
 if(state.page!=='schedule'){clearInterval(schedTimer);schedTimer=null;return;}
 if(document.hidden)return;
 schedFrame();
 if(++schedTicks%3===0){try{state.printer=await api('/printer');const card=$('#printer-card');if(card)card.outerHTML=printerCard();}catch{}}
}
function printerCard(){
 const p=state.printer;if(!p||(!p.configured&&!teamUser()))return '<div id="printer-card" hidden></div>';
 const setup=state.schedule?.canConfigure?btn(icon('settings')+(p.configured?' Conexão':' Conectar a impressora'),'printer-ha','secondary small'):'';
 if(!p.configured)return `<section id="printer-card" class="card printer-card"><div class="row spread"><div class="eyebrow">IMPRESSORA AO VIVO</div>${setup}</div><p class="muted">A impressora ainda não está conectada ao portal.${setup?' Conecte pelo Home Assistant da Emersol.':''}</p></section>`;
 const working=['printing','paused'].includes(p.state),orphan=working&&state.schedule?.canManage&&!state.schedule.bookings.some(b=>b.status==='printing'),candidates=orphan?state.schedule.bookings.filter(b=>b.status==='queued'&&b.validated):[];
 // The printer is busy but no order is printing in the portal: the team says which one it is.
 const link=orphan?`<div class="notice section"><div><h3>A impressora começou${p.job?' “'+esc(p.job)+'”':''}, sem pedido ligado</h3><p>${candidates.length?'Se for de uma família, escolha o pedido. Se for do clube, pode ignorar.':'Nenhum agendamento validado esperando. Se for do clube, pode ignorar.'}</p><div class="row">${candidates.map(b=>btn(`#${String(b.id).padStart(3,'0')} ${esc(b.name)}${b.family?' · '+esc(b.family):''}`,'booking-link','secondary small',`data-id="${b.id}"`)).join('')}</div></div></div>`:'';
 return `<section id="printer-card" class="card printer-card ${p.state}"><div class="row spread"><div><div class="eyebrow">IMPRESSORA AO VIVO</div><h2><span class="printer-dot"></span>${printerLabels[p.state]}</h2></div>${setup||icon('printer')}</div>${working&&p.percent!=null?`<progress max="100" value="${p.percent}" aria-label="Progresso da impressão"></progress><p class="printer-numbers"><strong>${Math.round(p.percent)}%</strong>${p.remainingMinutes!=null?` · faltam cerca de ${schedSpan(p.remainingMinutes)}`:''}${p.totalLayers?` · camada ${p.layer||0} de ${p.totalLayers}`:''}</p>`:''}${p.camera?`<div class="printer-frame"><img id="printer-live" class="printer-live" alt="Imagem ao vivo da impressora" width="960" height="540"><span class="printer-frame-wait">Abrindo a câmera…</span></div><p class="field-help">${working?'Imagem ao vivo, atualizada a cada 5 segundos. Só a sua família e a equipe veem a sua peça.':'Câmera da mesa, visível só para a equipe.'}</p>${(setTimeout(schedFrame,0),'')}`:working&&!teamUser()?'<p class="field-help">A imagem ao vivo aparece quando a peça na impressora é da sua família.</p>':''}${teamUser()&&p.online?`<p class="field-help">${[p.job?'Arquivo: '+esc(p.job):'',p.nozzle!=null?`bico ${Math.round(p.nozzle)} °C`:'',p.bed!=null?`mesa ${Math.round(p.bed)} °C`:'',p.lastMinutes?`último trabalho: ${schedSpan(p.lastMinutes)} medidos`:''].filter(Boolean).join(' · ')}</p>`:''}${!p.online?`<p class="field-help">Última leitura: ${schedWhen(p.updated)}.</p>`:''}${link}</section>`;
}
function calendarSvg(){
 const s=state.schedule,cfg=s.settings,days=s.days,col=132,left=46,top=34,hour=20,H=top+24*hour,W=left+days*col,start=Date.parse(s.from),now=Date.parse(s.now),DAY=86400000;
 const hm=t=>{const [h,m]=t.split(':').map(Number);return h+m/60;},y=ms=>top+ms/3600000*hour;
 let out=`<svg class="calendar" viewBox="0 0 ${W} ${H}" role="img" aria-label="Agenda da impressora: horários livres e ocupados">`;
 for(let i=0;i<days;i++){
  const d0=start+i*DAY,x=left+i*col,date=new Date(d0+DAY/2),open=cfg.days.includes(date.getDay());
  out+=`<rect class="cal-col" x="${x}" y="${top}" width="${col}" height="${24*hour}"/>`;
  if(open)out+=`<rect class="cal-open" x="${x}" y="${y(hm(cfg.open)*3600000)}" width="${col}" height="${(hm(cfg.close)-hm(cfg.open))*hour}"/>`;
  if(now>d0)out+=`<rect class="cal-past" x="${x}" y="${top}" width="${col}" height="${Math.min(24*hour,(now-d0)/3600000*hour)}"/>`;
  out+=`<text class="cal-day ${schedDay(date)===schedDay(new Date(now))?'today':''}" x="${x+col/2}" y="20" text-anchor="middle">${date.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})}</text>`;
  if(s.canBook)out+=`<rect class="cal-hit" data-cal-day="${d0}" x="${x}" y="${top}" width="${col}" height="${24*hour}"/>`;
 }
 for(let h=0;h<=24;h+=2)out+=`<line class="cal-line" x1="${left}" x2="${W}" y1="${top+h*hour}" y2="${top+h*hour}"/>${h<24?`<text class="cal-hour" x="${left-6}" y="${top+h*hour+4}" text-anchor="end">${schedPad(h)}h</text>`:''}`;
 const items=[...s.blocks.map(b=>({...b,cls:'cal-block',label:b.reason})),...s.slots.map(v=>v.busy?{...v,cls:'cal-busy',label:'Ocupado'}:{...v,cls:(v.own?'cal-own':'cal-team')+(v.status==='printing'?' cal-printing':['ready','completed'].includes(v.status)?' cal-done':!v.validated?' cal-pending':''),label:v.name})];
 for(const it of items){const a=Date.parse(it.start),b=Date.parse(it.end);
  for(let i=0;i<days;i++){const d0=start+i*DAY,from=Math.max(a,d0),to=Math.min(b,d0+DAY);if(to<=from)continue;
   const x=left+i*col+3,yy=y(from-d0),h=Math.max(4,(to-from)/3600000*hour-1),text=h>=13?`<text class="cal-text" x="${x+5}" y="${yy+11}">${esc(String(it.label||'').slice(0,17))}</text>`:'',title=`<title>${esc(it.id?`${it.label} · ${schedWhen(it.start)} a ${schedTime(it.end)}`:`${it.label} · ${schedWhen(it.start)} a ${schedTime(it.end)}`)}</title>`;
   out+=it.id?`<g class="cal-slot" data-cal-project="${it.id}" tabindex="0" role="button">${title}<rect class="${it.cls}" x="${x}" y="${yy}" width="${col-6}" height="${h}" rx="4"/>${text}</g>`:`<g>${title}<rect class="${it.cls}" x="${x}" y="${yy}" width="${col-6}" height="${h}" rx="4"/>${text}</g>`;
  }
 }
 if(now>=start&&now<start+days*DAY){const i=Math.floor((now-start)/DAY);out+=`<line class="cal-now" x1="${left+i*col}" x2="${left+(i+1)*col}" y1="${y(now-start-i*DAY)}" y2="${y(now-start-i*DAY)}"/>`;}
 return out+'</svg>';
}
const bookingState=b=>b.status==='approval'?['approval','Aguardando o responsável']:b.status==='queued'&&!b.validated?['question','Aguardando a equipe validar']:b.status==='queued'?['queued','Confirmado']:[b.status,labels[b.status]];
function bookingActions(b){
 const manage=operatorUser(),open=['approval','queued'].includes(b.status);let a='';
 if(manage&&b.status==='queued'&&!b.validated)a+=btn('Validar','booking-validate','small',`data-id="${b.id}"`);
 if(open&&(manage||(b.own&&!b.validated)))a+=btn(manage?'Editar':'Mudar horário ou dados','booking-edit','secondary small',`data-id="${b.id}"`);
 if(manage&&b.chargeError)a+=btn('Emitir cobrança','booking-charge','secondary small',`data-id="${b.id}"`);
 return a+`<button class="btn secondary small" data-project="${b.id}">Abrir pedido</button>`;
}
function bookingRow(b){const [cls,text]=bookingState(b);
 return `<div class="booking-row"><div><h3>${esc(b.name)} <span class="badge ${cls}">${esc(text)}</span></h3><p>${icon('calendar')} ${schedWhen(b.start)} até ${schedTime(b.end)} · ${schedSpan(b.minutes)}</p><p class="muted">${b.family?esc(b.family)+' · ':''}${esc(b.participant)} · ${b.filaments.length?b.filaments.map(f=>`${f.grams} g de ${esc(f.material)} ${esc(f.color)}`).join(' + '):`${b.grams} g de ${esc(b.material)}`} · ${b.charge>0?`${money(b.charge)} ${b.paid?'pago':'previsto'}`:'dentro da cota'}</p>${b.chargeError?`<p class="error-inline">Cobrança não emitida: ${esc(b.chargeError)}</p>`:''}</div><div class="row">${bookingActions(b)}</div></div>`;
}
function schedulePage(){
 const s=state.schedule;if(!s)return '';
 const team=teamUser(),pending=s.bookings.filter(b=>b.status==='queued'&&!b.validated),rest=s.bookings.filter(b=>!pending.includes(b)||!team),first=new Date(s.from),last=new Date(Date.parse(s.from)+(s.days-1)*86400000),cfg=s.settings;
 const dayNames=['dom','seg','ter','qua','qui','sex','sáb'];
 return `${header('CADA CRIAÇÃO TEM SUA HORA',team?'Agenda da impressora':'Agenda da impressora','Veja os horários livres, reserve o seu e acompanhe a impressão ao vivo.',(s.canBook?btn(icon('plus')+' Agendar impressão','booking-new'):'')+(s.canManage?btn('Bloquear período','schedule-block','secondary'):'')+(s.canConfigure?btn(icon('settings')+' Regras da agenda','schedule-settings','secondary'):''))}
 ${printerCard()}
 ${team&&pending.length?`<section class="card section attention"><h2>${pending.length} agendamento(s) para validar</h2><p class="muted">Confira o arquivo, o tempo e o peso. Se algo estiver errado, edite: a família é avisada pelo WhatsApp.</p>${pending.map(bookingRow).join('')}</section>`:''}
 <section class="card section"><div class="row spread calendar-head"><h2>${first.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} a ${last.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</h2><div class="row">${btn(icon('back'),'schedule-prev','secondary small','aria-label="Dias anteriores"')}${btn('Hoje','schedule-today','secondary small')}${btn(icon('arrow'),'schedule-next','secondary small','aria-label="Próximos dias"')}</div></div>
 <div class="calendar-wrap">${calendarSvg()}</div>
 <div class="calendar-legend"><span class="lg open">Equipe presente (${esc(cfg.open)}–${esc(cfg.close)}, ${cfg.days.map(d=>dayNames[d]).join(', ')})</span><span class="lg busy">Ocupado</span><span class="lg own">${team?'Da minha família':'Seu agendamento'}</span>${team?'<span class="lg team">Outras famílias</span>':''}<span class="lg pending">Aguardando validação</span><span class="lg block">Manutenção / fechado</span></div>
 <p class="field-help">${s.canBook?'Toque em um espaço livre para agendar ali. ':''}A impressão começa com a equipe presente e pode terminar depois do horário. De outras famílias aparece só "Ocupado".</p></section>
 <section class="card section"><h2>${team?'Agendamentos em andamento':'Meus agendamentos'}</h2>${(team?rest.filter(b=>!pending.includes(b)):rest).length?(team?rest.filter(b=>!pending.includes(b)):rest).map(bookingRow).join(''):empty('Nenhum agendamento por aqui',s.canBook?'Escolha um horário livre e reserve a impressora para a sua criação.':'Os agendamentos das famílias aparecem aqui.',s.canBook?btn(icon('plus')+' Agendar impressão','booking-new'):'')}</section>
 ${s.canManage&&s.blocks.length?`<section class="card section"><h2>Períodos bloqueados</h2>${s.blocks.map(b=>`<div class="booking-row"><div><h3>${esc(b.reason)}</h3><p>${schedWhen(b.start)} até ${schedWhen(b.end)}</p></div>${btn('Remover','schedule-block-remove','secondary small',`data-id="${b.id}"`)}</div>`).join('')}</section>`:''}
 <section class="card section"><h2>Como funciona</h2><ol class="rule-list"><li><strong>Você agenda</strong>Informe tempo e peso (ou envie o arquivo fatiado, que preenche sozinho) e escolha um horário livre.</li><li><strong>Conta na cota</strong>As horas saem da franquia da família. O que passar da cota e o filamento formam o valor previsto.</li><li><strong>A equipe valida</strong>Se precisar ajustar horário, tempo ou peso, você recebe um aviso no WhatsApp.</li><li><strong>Imprimiu, avisou</strong>Ao concluir, a equipe registra o consumo real. O responsável recebe o aviso de retirada e o link do PIX; o pagamento dá baixa sozinho.</li></ol></section>`;
}
// ---- booking form ----
function filamentRow(f,i){const mats=state.data.config.materials.filter(m=>m.active),colors=[...new Set(mats.flatMap(m=>m.colors))];
 return `<div class="filament-row" data-filament><label>Material<select data-key="material">${mats.map(m=>`<option ${m.name===f.material?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label><label>Cor<select data-key="color">${[...colors,'Quero ajuda'].map(c=>`<option ${c===f.color?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label>Peso (g)<input data-key="grams" type="number" min="0.1" max="10000" step="0.01" required value="${f.grams??''}"></label>${i?`<button type="button" class="btn secondary small" data-action="booking-filament-remove" aria-label="Remover filamento">${icon('close')}</button>`:'<span></span>'}</div>`;}
function bookingFields(v){
 return `<div class="form-grid"><label>Horas de impressão<input name="hours" type="number" min="0" max="160" step="1" required value="${Math.floor((v.minutes||0)/60)}"></label><label>Minutos<input name="mins" type="number" min="0" max="59" step="1" required value="${(v.minutes||0)%60}"></label></div>
 <div><strong class="field-title">Filamentos</strong><div class="filaments">${v.filaments.map(filamentRow).join('')}</div>${btn(icon('plus')+' Outro filamento','booking-filament-add','secondary small')}<p class="field-help">Peso total com suportes e purgas, como mostra o fatiador.</p></div>
 <label>Início<input name="startsAt" type="datetime-local" step="300" required value="${v.startsAt?schedInput(v.startsAt):''}"></label>
 <div class="booking-suggestions" aria-live="polite"></div><div class="booking-quote" aria-live="polite"></div>`;
}
function bookingDialog(preset={}){
 const people=[...new Set([...state.data.participants.filter(p=>p.active!==0).map(p=>p.name),state.user.name])],mat=state.data.config.materials.find(m=>m.active);
 modal('Agendar impressão',`<form id="booking-form" class="stack"><label>Arquivo fatiado (opcional)<input name="printFile" type="file" accept=".3mf,.gcode,.stl"><span class="field-help">Um .3mf ou .gcode fatiado preenche o tempo e o peso sozinho. Não tem? Preencha à mão; a equipe confere.</span></label>
 <div class="form-grid"><label>Nome da peça<input name="name" required maxlength="100" placeholder="Ex.: Suporte de celular"></label><label>Para quem é?<select name="participant">${people.map(n=>`<option>${esc(n)}</option>`).join('')}</select></label></div>
 <div class="form-grid"><label>Quantidade de peças<input name="quantity" type="number" min="1" max="50" value="1" required></label><label>Link do modelo ou observações<input name="description" maxlength="3000" placeholder="Opcional"></label></div>
 ${bookingFields({minutes:preset.minutes||60,filaments:[{material:mat?.name,color:mat?.colors[0],grams:''}],startsAt:preset.startsAt})}
 <p class="field-help">${state.user.role==='learner'?'O horário fica reservado e o responsável aprova o valor no portal.':'As horas entram na cota da família agora. A equipe valida e pode ajustar; ao concluir vale o consumo real.'} Fotos e outros arquivos podem ser enviados depois, na página do pedido.</p>
 <button class="btn" type="submit">Reservar este horário ${icon('arrow')}</button></form>`);
 schedulePreview($('#booking-form'),true);
}
function bookingEditDialog(id){
 const b=state.schedule?.bookings.find(x=>x.id===id)||(state.project?.id===id&&state.project.slot?{id,minutes:state.project.minutes,filaments:state.project.slot.filaments,start:state.project.slot.start,grams:state.project.grams,material:state.project.material}:null);if(!b)return;
 const mat=state.data.config.materials.find(m=>m.active),rows=b.filaments?.length?b.filaments:[{material:b.material||mat?.name,color:mat?.colors[0],grams:b.grams}];
 modal(operatorUser()?'Editar agendamento':'Mudar agendamento',`<form id="booking-edit-form" data-id="${id}" class="stack">${bookingFields({minutes:b.minutes,filaments:rows,startsAt:Date.parse(b.start)})}${operatorUser()?'<label>Motivo da alteração (a família recebe no WhatsApp)<textarea name="note" required maxlength="500" placeholder="Ex.: o fatiamento deu 3 h 20 e 85 g; movi para as 14 h."></textarea></label>':''}<button class="btn" type="submit">Salvar alteração</button></form>`);
 schedulePreview($('#booking-edit-form'),true);
}
function readBooking(form){
 const e=form.elements,minutes=Number(e.hours.value)*60+Number(e.mins.value),filaments=[...form.querySelectorAll('[data-filament]')].map(r=>({material:$('[data-key=material]',r).value,color:$('[data-key=color]',r).value,grams:Number($('[data-key=grams]',r).value)}));
 return {minutes,filaments,startsAt:e.startsAt.value?new Date(e.startsAt.value).toISOString():null,...(form.dataset.id?{projectId:Number(form.dataset.id)}:{})};
}
// Cost and free times follow the form as it is filled in.
function schedulePreview(form,now=false){
 clearTimeout(schedPreview);
 schedPreview=setTimeout(async()=>{
  if(!form.isConnected)return;const v=readBooking(form),quoteBox=$('.booking-quote',form),sugBox=$('.booking-suggestions',form);
  if(v.minutes>0){try{const r=await api(`/schedule/suggest?minutes=${v.minutes}${v.projectId?'&exclude='+v.projectId:''}`);sugBox.innerHTML=r.suggestions.length?`<strong class="field-title">Próximos horários livres para ${schedSpan(v.minutes)}</strong><div class="filters">${r.suggestions.map(t=>`<button type="button" data-action="booking-pick" data-value="${t}" class="${v.startsAt===t?'selected':''}">${schedWhen(t)}</button>`).join('')}</div>`:'<p class="field-help">Não há horário livre para essa duração na agenda aberta. Fale com a equipe.</p>';}catch{}}
  if(v.minutes>0&&v.filaments.every(f=>f.grams>0)){try{const q=await api('/schedule/quote',v);quoteBox.innerHTML=`<div class="summary"><div><span>Tempo de impressão</span><strong>${schedSpan(q.minutes)}</strong></div><div><span>Sai da cota da família</span><strong>${schedSpan(q.included)} de ${schedSpan(q.available)} livres</strong></div><div><span>Horas além da cota</span><strong>${q.extra?`${schedSpan(q.extra)} · ${money(q.extraCost)}`:'nenhuma'}</strong></div><div><span>Filamento (${q.grams} g)</span><strong>${money(q.materialCost)}</strong></div><div class="total"><span>Valor previsto</span><strong>${money(q.total)}</strong></div></div>`;}catch(err){quoteBox.innerHTML=`<p class="field-help">${esc(err.message)}</p>`;}}
 },now?0:450);
}
async function scheduleReload(message){close();if(state.page==='project'&&state.project)await openProject(state.project.id);else{await loadSchedule();render();}if(message)toast(message);}
async function scheduleAction(action,target){
 const id=Number(target.dataset.id);
 switch(action){
  case'booking-new':bookingDialog();return true;
  case'printer-ha':{const v=await api('/printer/homeassistant');printerHaDialog(v);return true;}
  case'printer-ha-remove':if(!confirm('Desconectar a impressora do portal?'))return true;await api('/printer/homeassistant/remove',{});await scheduleReload('Impressora desconectada.');return true;
  case'schedule-open':state.page='schedule';await refresh({navigate:true});return true;
  case'booking-edit':bookingEditDialog(id);return true;
  case'booking-filament-add':{const form=target.closest('form'),box=$('.filaments',form);if(box.children.length>=4)throw new Error('Até quatro filamentos por impressão.');const mat=state.data.config.materials.find(m=>m.active);box.insertAdjacentHTML('beforeend',filamentRow({material:mat?.name,color:mat?.colors[0],grams:''},box.children.length));return true;}
  case'booking-filament-remove':{const form=target.closest('form');target.closest('[data-filament]').remove();schedulePreview(form);return true;}
  case'booking-pick':{const form=target.closest('form');form.elements.startsAt.value=schedInput(Date.parse(target.dataset.value));form.querySelectorAll('[data-action=booking-pick]').forEach(b=>b.classList.toggle('selected',b===target));return true;}
  case'booking-validate':if(!confirm('Validar este agendamento? A família recebe a confirmação no WhatsApp.'))return true;await api(`/schedule/bookings/${id}/validate`,{});await scheduleReload('Agendamento validado. A família foi avisada.');return true;
  case'booking-link':if(!confirm('Ligar a impressão em andamento a este pedido? A família recebe o aviso de início.'))return true;await api(`/schedule/bookings/${id}/link`,{});await scheduleReload('Pedido ligado à impressão.');return true;
  case'booking-charge':await api(`/schedule/bookings/${id}/charge`,{});await scheduleReload('A cobrança será emitida em instantes.');return true;
  case'schedule-prev':case'schedule-next':{const d=new Date(state.schedule.from);d.setDate(d.getDate()+(action==='schedule-next'?1:-1)*state.schedule.days);state.scheduleFrom=schedDay(d);await loadSchedule();render();return true;}
  case'schedule-today':state.scheduleFrom=null;await loadSchedule();render();return true;
  case'schedule-block':modal('Bloquear período',`<form id="schedule-block-form" class="stack"><p>Use para manutenção, feriados ou quando a impressora estiver reservada. Agendamentos que caírem no período são empurrados e as famílias avisadas.</p><div class="form-grid"><label>Início<input name="startsAt" type="datetime-local" required></label><label>Fim<input name="endsAt" type="datetime-local" required></label></div><label>Motivo (aparece para todos)<input name="reason" required maxlength="120" placeholder="Ex.: Manutenção"></label><button class="btn" type="submit">Bloquear</button></form>`);return true;
  case'schedule-block-remove':await api(`/schedule/blocks/${target.dataset.id}/remove`,{});await scheduleReload('Período liberado.');return true;
  case'schedule-settings':{const c=state.schedule.settings,names=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];modal('Regras da agenda',`<form id="schedule-settings-form" class="stack"><div class="form-grid"><label>Equipe presente a partir de<input name="open" type="time" required value="${esc(c.open)}"></label><label>Até<input name="close" type="time" required value="${esc(c.close)}"></label></div><div><strong class="field-title">Dias de funcionamento</strong><div class="row wrap">${names.map((n,i)=>`<label class="check"><input type="checkbox" name="day" value="${i}" ${c.days.includes(i)?'checked':''}>${n}</label>`).join('')}</div></div><div class="form-grid"><label>Intervalo entre impressões (min)<input name="buffer" type="number" min="0" max="240" required value="${c.buffer}"></label><label>Antecedência mínima (min)<input name="lead" type="number" min="0" max="10080" required value="${c.lead}"></label><label>Agenda aberta (dias)<input name="horizon" type="number" min="1" max="180" required value="${c.horizon}"></label><label>Duração máxima por agendamento (min)<input name="maxMinutes" type="number" min="10" max="10000" required value="${c.maxMinutes}"></label><label>Agendamentos abertos por família<input name="maxActive" type="number" min="1" max="20" required value="${c.maxActive}"></label><label>Lembrete de retirada após (dias)<input name="pickupDays" type="number" min="1" max="30" required value="${c.pickupDays}"></label><label>Avisar estoque baixo abaixo de (g por cor)<input name="lowStockGrams" type="number" min="0" max="100000" required value="${c.lowStockGrams??200}"></label></div><label>Quando enviar o link do PIX<select name="chargeWhen"><option value="finish" ${c.chargeWhen==='finish'?'selected':''}>Ao concluir a impressão, pelo consumo real</option><option value="validation" ${c.chargeWhen==='validation'?'selected':''}>Ao validar o agendamento (pré-pago); a diferença é cobrada ao concluir</option></select></label><label>Local de retirada (aparece nas mensagens)<input name="pickupPlace" maxlength="120" required value="${esc(c.pickupPlace)}"></label><label>WhatsApp da equipe para avisos (separe por vírgula)<input name="teamWhatsapp" maxlength="200" placeholder="(64) 99999-9999" value="${esc((c.teamWhatsapp||[]).join(', '))}"><span class="field-help">Recebem novos agendamentos, pagamentos e avisos da impressora.</span></label><button class="btn" type="submit">Salvar regras</button></form>`);return true;}
 }
 return false;
}
function printerHaDialog(v,list=null){
 const fixed=v.source==='servidor',when=t=>t?new Date(t).toLocaleString('pt-BR'):'';
 modal('Conectar a impressora',`${v.configured?`<div class="notice"><div><h3>${v.printer?`${esc(v.printer.name)}${v.printer.model?' · '+esc(v.printer.model):''}`:'Conectado ao Home Assistant'}</h3><p>${esc(v.url)}${v.printer&&!v.printer.camera?' · sem câmera':''}</p><p class="field-help">${v.lastError?'⚠️ '+esc(v.lastError):v.lastOk?'Última leitura: '+when(v.lastOk):'Aguardando a primeira leitura…'}</p></div></div>`:''}
 <form id="printer-ha-form" class="stack">${fixed?'<p>A conexão está definida no servidor. Use o botão para procurar a impressora de novo.</p>':`<ol class="rule-list"><li><strong>No Home Assistant</strong>Instale a integração <b>Bambu Lab</b> (HACS → ha-bambulab), adicione a X2D com o código de acesso da tela da impressora e confira se a câmera aparece.</li><li><strong>Token</strong>Perfil do usuário administrador → Segurança → Tokens de acesso de longa duração → Criar token.</li><li><strong>Endereço</strong>O do Home Assistant no Tailscale, como <code>http://100.x.y.z:8123</code> ou <code>http://homeassistant.seu-tailnet.ts.net:8123</code>.</li></ol>
 <label>Endereço do Home Assistant<input name="url" type="url" required maxlength="200" placeholder="http://100.101.102.103:8123" value="${esc(v.url||'')}"></label>
 <label>Token de longa duração<input name="token" type="password" autocomplete="off" maxlength="2000" ${v.configured?'placeholder="Deixe em branco para manter o atual"':'required'}><span class="field-help">Fica criptografado no servidor e nunca é mostrado de novo.</span></label>`}
 ${list&&list.length>1?`<label>Impressora<select name="deviceId">${list.map(p=>`<option value="${esc(p.deviceId)}">${esc(p.name)}${p.model?' · '+esc(p.model):''}</option>`).join('')}</select></label>`:''}
 <div class="row"><button class="btn" type="submit">${v.configured?'Procurar e salvar':'Procurar a impressora e conectar'}</button>${v.configured&&!fixed?btn('Desconectar','printer-ha-remove','secondary'):''}</div></form>`);
}
async function scheduleSubmit(form){
 if(form.id==='booking-form'){
  const e=form.elements,file=e.printFile.files[0],v=readBooking(form);if(!v.startsAt)throw new Error('Escolha o início.');
  const r=await api('/schedule/bookings',{...v,name:e.name.value,participant:e.participant.value,description:e.description.value,quantity:Number(e.quantity.value),hasFile:Boolean(file)});
  let note='Agendamento registrado!';
  if(file&&/\.(stl|3mf)$/i.test(file.name)){try{await upload(r.id,file);}catch{note='Agendamento registrado. O arquivo não subiu; envie pela página do pedido.';}}
  close();await openProject(r.id);toast(note);return true;
 }
 if(form.id==='booking-edit-form'){const {projectId,...v}=readBooking(form);await api(`/schedule/bookings/${form.dataset.id}/update`,{...v,...(form.elements.note?{note:form.elements.note.value}:{})});await scheduleReload('Agendamento atualizado.');return true;}
 if(form.id==='printer-ha-form'){const e=form.elements,r=await api('/printer/homeassistant',{url:e.url?.value,token:e.token?.value||undefined,deviceId:e.deviceId?.value});toast(`Impressora encontrada: ${r.printer.name}${r.printer.model?' ('+r.printer.model+')':''}.`);if(r.printers.length>1&&!e.deviceId){printerHaDialog(r,r.printers);return true;}close();setTimeout(()=>{if(state.page==='schedule')loadSchedule().then(render).catch(()=>{});},4000);await loadSchedule();render();return true;}
 if(form.id==='schedule-block-form'){const e=form.elements;await api('/schedule/blocks',{startsAt:new Date(e.startsAt.value).toISOString(),endsAt:new Date(e.endsAt.value).toISOString(),reason:e.reason.value});await scheduleReload('Período bloqueado.');return true;}
 if(form.id==='schedule-settings-form'){const e=form.elements,n=k=>Number(e[k].value);await api('/schedule/settings',{open:e.open.value,close:e.close.value,days:[...form.querySelectorAll('[name=day]:checked')].map(c=>Number(c.value)),buffer:n('buffer'),lead:n('lead'),horizon:n('horizon'),maxMinutes:n('maxMinutes'),maxActive:n('maxActive'),pickupDays:n('pickupDays'),lowStockGrams:n('lowStockGrams'),chargeWhen:e.chargeWhen.value,pickupPlace:e.pickupPlace.value,teamWhatsapp:e.teamWhatsapp.value.split(',').map(s=>s.trim()).filter(Boolean)});await scheduleReload('Regras salvas.');return true;}
 return false;
}
// Shown on the order page: when it prints, whether the team validated it and what was booked.
function scheduleProjectCard(p){
 const s=p.slot;if(!s||['cancelled','failed','draft','review','question'].includes(p.status))return '';
 const team=operatorUser(),open=['approval','queued'].includes(p.status),own=p.family_id===state.user.family_id,state_=p.status==='approval'?'Aguardando o responsável aprovar':p.status==='queued'?(s.validated?'Confirmado pela equipe':'Aguardando a validação da equipe'):p.status==='printing'?'Imprimindo agora':'Impresso';
 let actions='';if(team&&p.status==='queued'&&!s.validated)actions+=btn('Validar agendamento','booking-validate','small',`data-id="${p.id}"`);
 if(open&&(team||(own&&!s.validated)))actions+=btn(team?'Editar horário, tempo e peso':'Mudar horário ou dados','booking-edit','secondary small',`data-id="${p.id}"`);
 if(team&&s.chargeError)actions+=btn('Emitir cobrança','booking-charge','secondary small',`data-id="${p.id}"`);
 return `<div class="card schedule-card ${open&&!s.validated?'attention':''}"><span class="eyebrow">AGENDA DA IMPRESSORA · ${esc(state_.toUpperCase())}</span><h2>${schedWhen(s.start)} <small>até ${schedTime(s.end)}</small></h2>${s.filaments.length?`<p>${s.filaments.map(f=>`${f.grams} g de ${esc(f.material)} ${esc(f.color)}`).join(' + ')}</p>`:''}${s.selfService&&['ready','completed'].includes(p.status)&&s.estMinutes?`<p class="muted">Agendado com ${schedSpan(s.estMinutes)} e ${s.estGrams} g; o custo final usa o consumo real.</p>`:''}${s.chargeError?`<p class="error-inline">Cobrança não emitida: ${esc(s.chargeError)}</p>`:''}<div class="row">${actions}<button class="text-btn" data-nav="schedule">Ver a agenda ${icon('arrow')}</button></div></div>`;
}
// Links sent by WhatsApp: /?pedido=12 opens the order, /?agenda=1 opens the calendar.
async function scheduleDeepLink(){
 const {pedido,agenda}=schedDeep;schedDeep.pedido=schedDeep.agenda=null;if(!pedido&&!agenda)return;
 history.replaceState(null,'','/');
 if(pedido&&/^\d+$/.test(pedido)){try{await openProject(Number(pedido));}catch{toast('Não foi possível abrir este pedido.');}}
 else if(agenda){state.page='schedule';await refresh({navigate:true});}
}
document.addEventListener('click',e=>{
 if(typeof state==='undefined'||state.page!=='schedule'||e.target.closest('dialog'))return;
 const slot=e.target.closest('[data-cal-project]');if(slot){openProject(Number(slot.dataset.calProject)).catch(error);return;}
 const hit=e.target.closest('[data-cal-day]');
 if(hit&&state.schedule?.canBook){const r=hit.getBoundingClientRect(),ms=Number(hit.dataset.calDay)+Math.round((e.clientY-r.top)/r.height*96)/4*3600000;if(ms<Date.now())return toast('Escolha um horário no futuro.');bookingDialog({startsAt:ms});}
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches?.('[data-cal-project]'))openProject(Number(e.target.dataset.calProject)).catch(error);});
document.addEventListener('input',e=>{const form=e.target.closest?.('#booking-form,#booking-edit-form');if(form&&e.target.name!=='printFile'&&e.target.name!=='name'&&e.target.name!=='description'&&e.target.name!=='note')schedulePreview(form);});
document.addEventListener('change',async e=>{
 if(e.target.name!=='printFile'||!e.target.files[0])return;const form=e.target.form,file=e.target.files[0];
 try{
  if(!form.elements.name.value)form.elements.name.value=file.name.replace(/(\.gcode)?\.[a-z0-9]+$/i,'').slice(0,100);
  if(!/\.(3mf|gcode)$/i.test(file.name))return;
  const r=await api('/schedule/analyze',{name:file.name,data:await readBase64(file)});
  if(!r.sliced){toast('Este arquivo não traz tempo e peso. Preencha à mão; a equipe confere.');return;}
  form.elements.hours.value=Math.floor(r.minutes/60);form.elements.mins.value=r.minutes%60;
  const mat=state.data.config.materials.find(m=>m.active),rows=(r.filaments.length?r.filaments:[{grams:r.grams}]).slice(0,4).map(f=>({material:f.material||mat?.name,color:mat?.colors[0],grams:f.grams}));
  $('.filaments',form).innerHTML=rows.map(filamentRow).join('');schedulePreview(form,true);
  toast(`Lido do arquivo: ${schedSpan(r.minutes)} e ${r.grams} g. Confira as cores.`);
 }catch(err){error(err);}
});
