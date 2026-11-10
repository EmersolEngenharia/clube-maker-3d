// Regulamento do clube: reading and acceptance for families, draft and publication for the administration.
function termsHtml(text){
 const inline=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');let html='',list=false;
 for(const raw of String(text||'').split('\n')){const line=raw.trim();
  if(line.startsWith('- ')){if(!list){html+='<ul>';list=true;}html+=`<li>${inline(line.slice(2))}</li>`;continue;}
  if(list){html+='</ul>';list=false;}
  if(!line)continue;html+=line.startsWith('## ')?`<h3>${inline(line.slice(3))}</h3>`:`<p>${inline(line)}</p>`;
 }
 return html+(list?'</ul>':'');
}
async function loadTerms(){state.terms=await api('/terms');state.termsAdmin=state.terms.canManage?await api('/terms/admin'):null;}
const termsDate=v=>v?new Date(v).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
// Shown on every page while the family still has to accept the current version.
function termsBanner(){const t=state.user?.terms;if(!t||teamUser()&&!state.user.family_id)return '';
 if(t.mustAccept)return `<div class="notice terms-banner">${icon('help')}<div><h3>Novo regulamento do clube</h3><p>Leia e aceite a versão ${t.version} para continuar agendando e aprovando impressões.</p></div>${btn('Ler e aceitar','terms-open','small')}</div>`;
 if(!t.familyAccepted)return `<div class="notice terms-banner">${icon('help')}<div><h3>Regulamento aguardando o responsável</h3><p>Agendamentos e aprovações voltam a funcionar quando o responsável aceitar a versão ${t.version}.</p></div>${btn('Ler','terms-open','secondary small')}</div>`;
 return '';}
function termsPage(){
 const t=state.terms;if(!t)return '';const a=state.termsAdmin,guardian=state.user.terms?.mustAccept;
 const reader=t.current?`<article class="card terms-text"><div class="eyebrow">VERSÃO ${t.current.version} · PUBLICADA EM ${esc(termsDate(t.current.publishedAt).toUpperCase())}</div><h2>${esc(t.current.title)}</h2>${termsHtml(t.current.body)}</article>`:`<div class="card">${empty('O regulamento ainda não foi publicado',a?'Revise o rascunho abaixo e publique quando estiver pronto.':'A equipe vai publicar o regulamento do clube em breve.')}</div>`;
 const accept=t.current&&guardian?`<form id="terms-accept-form" class="card stack terms-accept" data-version="${t.current.version}"><label class="check"><input type="checkbox" name="confirmed" required>Li o regulamento e aceito em nome da minha família, inclusive pelos dependentes cadastrados.</label><button class="btn" type="submit">Aceitar a versão ${t.current.version}</button></form>`:t.current&&state.user.family_id?`<div class="notice section">${icon('check')}<div><h3>${t.familyAccepted?'Regulamento aceito pela sua família':'Aguardando o aceite do responsável'}</h3><p>${t.familyAccepted?'Obrigado! Se o regulamento mudar, avisamos pelo WhatsApp.':'Somente o responsável da família aceita o regulamento.'}</p></div></div>`:'';
 let admin='';
 if(a){
  const d=a.draft,pending=a.families.filter(f=>!f.acceptedAt);
  admin=`<section class="card section stack"><div class="row spread"><h2>${d?`Rascunho da versão ${d.version}`:'Nova versão'}</h2>${d?`<small class="muted">Salvo em ${esc(termsDate(d.updated))}</small>`:''}</div><p class="muted">Use <code>## </code> no início da linha para títulos e <code>- </code> para itens. Ao publicar, todas as famílias precisam aceitar de novo e recebem aviso pelo WhatsApp.</p>
  <form id="terms-draft-form" class="stack"><label>Título<input name="title" required maxlength="150" value="${esc(d?.title||a.current?.title||'Regulamento do Clube Maker 3D Emersol')}"></label><label>Texto<textarea name="body" rows="18" required maxlength="40000">${esc(d?.body||a.current?.body||'')}</textarea></label><div class="row"><button class="btn secondary" type="submit">Salvar rascunho</button>${d?btn('Ver como fica','terms-preview','secondary')+btn(`Publicar a versão ${d.version}`,'terms-publish'):''}</div></form></section>
  ${a.current?`<section class="card section"><h2>Aceites da versão ${a.current.version}</h2><p class="muted">${a.families.length-pending.length} de ${a.families.length} famílias aceitaram.</p><div class="table-wrap"><table><thead><tr><th>Família</th><th>Aceite</th></tr></thead><tbody>${a.families.map(f=>`<tr><td>${esc(f.name)}</td><td>${f.acceptedAt?`${esc(f.acceptedBy)} · ${esc(termsDate(f.acceptedAt))}`:'<span class="badge question">Pendente</span>'}</td></tr>`).join('')}</tbody></table></div></section>`:''}
  ${a.versions.length?`<section class="card section"><h2>Versões publicadas</h2>${a.versions.map(v=>`<div class="booking-row"><div><h3>Versão ${v.version} · ${esc(v.title)}</h3><p class="muted">${esc(termsDate(v.published_at))}${v.published_by?' por '+esc(v.published_by):''} · ${v.accepted} aceite(s)</p></div></div>`).join('')}</section>`:''}`;
 }
 return `${header('COMBINADOS DO CLUBE','Regulamento','As regras que valem para todas as famílias, aceitas pelo responsável.')}${accept&&guardian?accept:''}${reader}${accept&&!guardian?accept:''}${guardian&&t.current?`<form id="terms-accept-form-bottom" class="card stack terms-accept section" data-version="${t.current.version}"><label class="check"><input type="checkbox" name="confirmed" required>Li o regulamento e aceito em nome da minha família.</label><button class="btn" type="submit">Aceitar a versão ${t.current.version}</button></form>`:''}${admin}`;
}
async function termsAction(action){
 switch(action){
  case'terms-open':close();state.page='terms';await refresh({navigate:true});window.scrollTo({top:0,behavior:'instant'});return true;
  case'terms-preview':{const f=$('#terms-draft-form');modal(esc(f.elements.title.value),`<article class="terms-text">${termsHtml(f.elements.body.value)}</article>`);return true;}
  case'terms-publish':{const v=state.termsAdmin.draft.version;if(!confirm(`Publicar a versão ${v}? Todas as famílias vão receber aviso no WhatsApp e precisarão aceitar antes de agendar ou aprovar impressões.`))return true;await api('/terms/draft',{title:$('#terms-draft-form').elements.title.value,body:$('#terms-draft-form').elements.body.value});const r=await api('/terms/publish',{confirmed:true});await termsReload();toast(`Versão ${r.version} publicada. ${r.notified} família(s) avisada(s).`);return true;}
 }
 return false;
}
async function termsReload(){const s=await api('/session');state.user=s.user;await loadTerms();render();}
async function termsSubmit(form){
 if(form.id==='terms-accept-form'||form.id==='terms-accept-form-bottom'){await api('/terms/accept',{version:Number(form.dataset.version),confirmed:form.elements.confirmed.checked});await termsReload();window.scrollTo({top:0,behavior:'instant'});toast('Regulamento aceito. Obrigado!');return true;}
 if(form.id==='terms-draft-form'){await api('/terms/draft',{title:form.elements.title.value,body:form.elements.body.value});await termsReload();toast('Rascunho salvo.');return true;}
 return false;
}
// /?regulamento=1 (link do WhatsApp) and the first visit of a guardian with a pending version open this page.
async function termsGate(){
 const link=new URLSearchParams(location.search).get('regulamento');if(link)history.replaceState(null,'','/');
 if(link||state.user?.terms?.mustAccept){state.page='terms';await refresh({navigate:true});}
}
