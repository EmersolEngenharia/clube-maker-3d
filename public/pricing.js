// Calculadora de preço: hora da impressora + material com 20% de reserva (+ trabalho e outros custos, se ligados),
// e lucro de pelo menos 100% sobre o custo. Quanto mais personalizada a peça, maior o lucro.
// Nada é salvo: valores e foto ficam só neste navegador; a imagem do orçamento é gerada aqui mesmo.
const pricingLevels=[
 ['ready','Pronto','Modelo baixado e impresso como está.',100,'cube'],
 ['touch','Toque pessoal','Cor, nome ou recado escolhidos pelo cliente.',150,'pencil'],
 ['adapted','Adaptada','Modelo ajustado: tamanho, encaixe, texto.',200,'settings'],
 ['unique','Exclusiva','Desenhada do zero só para o cliente.',300,'spark']];
const pricingMaterialReserve=20,pricingMinMargin=100;
const pricingNumber=(v,min,max)=>Math.min(max,Math.max(min,Number(String(v??'').replace(',','.'))||0));
const pricingReais=cents=>(cents/100).toFixed(2);
const pricingDecimal=v=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2});
const pricingMaterials=()=>(state.data?.config?.materials||[]).filter(m=>m.active);
function pricingDefaults(){
 const c=state.data?.config||{},m=pricingMaterials()[0];
 return {name:'',quantity:1,printH:1,printM:0,rate:pricingReais(c.extra||600),work:false,workH:0,workM:30,workRate:'15.00',material:m?.name||'',kg:pricingReais(m?.cost||10000),grams:20,extra:false,other:'0.00',level:'ready',margin:100};
}
// A hora da impressora e o preço do filamento vêm das configurações do clube; só a equipe ajusta a hora aqui.
function pricingState(){
 const p=state.pricing??=pricingDefaults(),c=state.data?.config||{},m=pricingMaterials().find(m=>m.name===p.material);
 if(!teamUser())p.rate=pricingReais(c.extra||600);
 if(m)p.kg=pricingReais(m.cost);
 return p;
}
// Cartões abertos: todos no computador; no celular começam fechados e mostram só o subtotal.
function pricingOpen(){return state.pricingOpen??=Object.fromEntries(['piece','time','material','level'].map(k=>[k,matchMedia('(min-width: 761px)').matches]));}
// Todos os valores em centavos, por peça, e depois multiplicados pela quantidade.
function pricingCalc(p){
 const quantity=Math.floor(pricingNumber(p.quantity,1,1000)),printHours=pricingNumber(p.printH,0,500)+pricingNumber(p.printM,0,59)/60,workHours=p.work?pricingNumber(p.workH,0,500)+pricingNumber(p.workM,0,59)/60:0;
 const rate=pricingNumber(p.rate,0,10000),workRate=pricingNumber(p.workRate,0,10000),grams=pricingNumber(p.grams,0,10000),kg=pricingNumber(p.kg,0,100000);
 const print=Math.round(printHours*rate*100),work=Math.round(workHours*workRate*100);
 const materialBase=Math.round(grams*kg/10),materialReserve=Math.round(materialBase*pricingMaterialReserve/100),other=p.extra?Math.round(pricingNumber(p.other,0,100000)*100):0;
 const cost=print+work+materialBase+materialReserve+other,margin=Math.max(pricingMinMargin,pricingNumber(p.margin,0,1000)),exact=Math.round(cost*(1+margin/100));
 // Arredonda para cima até o próximo valor terminado em ,90 (ex.: R$ 23,40 → R$ 23,90).
 const price=cost?Math.ceil((exact+10)/100)*100-10:0,profit=price-cost;
 return {quantity,printHours,workHours,rate,workRate,grams,kg,print,work,time:print+work,materialBase,materialReserve,material:materialBase+materialReserve,other,cost,margin,exact,price,profit};
}
const pricingPercent=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:0})+'%';
const pricingTime=h=>{const m=Math.round(h*60);return m?`${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}`:'0h';};
const pricingLevel=p=>pricingLevels.find(l=>l[0]===p.level)||pricingLevels[0];
// Subtotais no título de cada cartão, visíveis mesmo com o cartão fechado.
function pricingSums(p,r){return {piece:`${r.quantity} ${r.quantity>1?'peças':'peça'}`,time:`${pricingTime(r.printHours+r.workHours)} · ${money(r.time)}`,material:`${pricingDecimal(r.grams)} g · ${money(r.material+r.other)}`,level:`lucro ${pricingPercent(r.margin)}`};}
// A "conta desenhada": cada custo vira um bloco, somados até o preço.
function pricingStripHtml(){
 const p=pricingState(),r=pricingCalc(p);
 const tile=(ic,label,value,sub,cls='')=>`<div class="pricing-tile ${cls}">${icon(ic)}<small>${label}</small><strong>${money(value)}</strong>${sub?`<em>${sub}</em>`:''}</div>`,op=s=>`<span class="pricing-op" aria-hidden="true">${s}</span>`;
 const costs=[tile('printer','Impressora',r.print,pricingTime(r.printHours)),tile('spool','Material',r.material,`puro ${money(r.materialBase)} + ${pricingMaterialReserve}%`)];
 if(p.work)costs.push(tile('hand','Trabalho',r.work,pricingTime(r.workHours)));
 if(p.extra)costs.push(tile('box','Outros',r.other,''));
 return `<div class="pricing-equation">${costs.join(op('+'))}${op('=')}${tile('wallet','Custo',r.cost,'','cost')}${op('+')}${tile('spark','Lucro',r.profit,pricingPercent(r.margin),'profit')}${op('=')}${tile('tag','Preço',r.price,'por peça','price')}</div>
 <p class="pricing-note">${icon('shield')}<span>Nunca venda abaixo de <b>${money(r.cost)}</b>. Preço arredondado para terminar em ,90.</span></p>`;
}
function pricingPhotoHtml(){
 const photo=state.pricingPhoto;
 return `<label class="quote-photo ${photo?'has-photo':''}" title="Anexar foto da peça">${photo?`<img src="${photo}" alt="Foto da peça">`:`${icon('image')}<span><b>Foto da peça</b><small>Toque para anexar ou cole a imagem (Ctrl+V)</small></span>`}<input type="file" name="pricing-photo" accept="image/*" hidden></label>${photo?`<button type="button" class="quote-remove" data-action="pricing-photo-remove" aria-label="Remover foto">${icon('close')}</button>`:''}`;
}
function pricingResultHtml(){
 const p=pricingState(),r=pricingCalc(p),level=pricingLevel(p);
 return `<div class="quote"><div class="quote-top"><img src="/brand-icon.svg" alt="" width="40" height="40"><div><b>Clube Maker 3D</b><small>EMERSOL · ORÇAMENTO</small></div></div>
 <div class="quote-media">${pricingPhotoHtml()}</div>
 <div class="quote-body"><h3>${esc(p.name||'Sua peça')}</h3><span class="quote-chip">${icon(level[4])} ${esc(level[1])}</span>
 <div class="quote-price">${money(r.price)}<small>por peça</small></div>
 ${r.quantity>1?`<div class="quote-total">${r.quantity} peças · total <b>${money(r.price*r.quantity)}</b></div>`:''}</div></div>
 <div class="quote-actions">${btn(icon('share')+' Compartilhar','pricing-share','')}${btn(icon('download')+' Imagem','pricing-download','secondary small')}${btn(icon('file')+' Texto','pricing-copy','secondary small')}${btn('Recomeçar','pricing-reset','secondary small')}</div>`;
}
function pricingStickyHtml(){const r=pricingCalc(pricingState());return `<strong>${money(r.price)}</strong><span>custo ${money(r.cost)} · material puro ${money(r.materialBase)}</span>`;}
function pricingPage(){
 const p=pricingState(),r=pricingCalc(p),open=pricingOpen(),sums=pricingSums(p,r),materials=pricingMaterials(),team=teamUser();
 const field=(label,name,unit,attrs,cls='')=>`<label class="${cls}">${label}<span class="pricing-unit"><input name="${name}" type="number" inputmode="decimal" value="${esc(p[name])}" ${attrs}><em>${unit}</em></span></label>`;
 const toggle=(name,label,ic)=>`<label class="pricing-switch">${icon(ic)}<span>${label}</span><input type="checkbox" name="${name}" role="switch" ${p[name]?'checked':''}><i aria-hidden="true"></i></label>`;
 const card=(key,ic,title,body)=>`<details class="pricing-step" data-step="${key}" ${open[key]?'open':''}><summary><span class="pricing-n">${icon(ic)}</span><strong>${title}</strong><span class="pricing-sum" data-sum="${key}">${sums[key]}</span></summary><div class="pricing-body">${body}</div></details>`;
 const rate=team?field('Impressora','rate','R$/h','min="0" step="0.01"'):`<div class="pricing-fixed" title="Valor definido pelo clube">${icon('lock')}<span>Impressora</span><b>${money(Math.round(r.rate*100))}/h</b></div>`;
 return `<div class="pricing-head">${header('QUANTO VALE O QUE VOCÊ CRIA?','Calculadora de preço','')}</div>
 <div class="pricing-sticky" aria-hidden="true">${pricingStickyHtml()}</div>
 <div class="grid two pricing"><div class="pricing-left"><form id="pricing-form" class="pricing-form" autocomplete="off">
 ${card('piece','cube','A peça',`<div class="pricing-grid two-one"><label>Nome<input name="name" maxlength="80" value="${esc(p.name)}" placeholder="Ex.: chaveiro com nome"></label>${field('Quantidade','quantity','un.','min="1" max="1000" step="1"')}</div>`)}
 ${card('time','clock','Tempo',`<div class="pricing-grid three">${field('Impressão','printH','h','min="0" max="500" step="any" title="Veja no MakerWorld (ex.: 1,2 h) ou no fatiador"')}${field('&nbsp;','printM','min','min="0" max="59" step="1"')}${rate}</div>
 ${toggle('work','Incluir meu trabalho','hand')}<div class="pricing-grid three" data-when="work" ${p.work?'':'hidden'}>${field('Trabalho','workH','h','min="0" max="500" step="any" title="Modelar, lixar, pintar, montar"')}${field('&nbsp;','workM','min','min="0" max="59" step="1"')}${field('Sua hora','workRate','R$/h','min="0" step="0.01"')}</div>`)}
 ${card('material','spool','Material',`<div class="pricing-grid two-one"><label>Filamento<select name="material">${materials.length?materials.map(m=>`<option value="${esc(m.name)}" ${m.name===p.material?'selected':''}>${esc(m.name)} · ${money(m.cost)}/kg</option>`).join(''):`<option value="">Filamento padrão · ${money(Math.round(r.kg*100))}/kg</option>`}</select></label>${field('Peso','grams','g','min="0" max="10000" step="any" title="No MakerWorld aparece junto do material (ex.: PLA | 32 g)"')}</div>
 ${toggle('extra','Outros custos','box')}<div class="pricing-grid two-one" data-when="extra" ${p.extra?'':'hidden'}>${field('Embalagem, argola, ímã…','other','R$','min="0" step="0.01"')}</div>`)}
 ${card('level','spark','Personalização',`<div class="pricing-levels">${pricingLevels.map(([v,l,d,m,ic])=>`<label class="pricing-level" title="${d}"><input type="radio" name="level" value="${v}" data-margin="${m}" ${p.level===v?'checked':''}>${icon(ic)}<strong>${l}</strong><small>lucro ${m}%</small></label>`).join('')}</div>`)}
 </form><div class="card pricing-strip" id="pricing-strip" aria-live="polite">${pricingStripHtml()}</div></div>
 <aside><div class="card pricing-result" id="pricing-result">${pricingResultHtml()}</div></aside></div>`;
}
function pricingRefresh(){
 const p=pricingState(),sums=pricingSums(p,pricingCalc(p));
 for(const el of document.querySelectorAll('[data-sum]'))el.innerHTML=sums[el.dataset.sum];
 for(const el of document.querySelectorAll('#pricing-form [data-when]'))el.hidden=!p[el.dataset.when];
 $('#pricing-strip').innerHTML=pricingStripHtml();$('#pricing-result').innerHTML=pricingResultHtml();$('.pricing-sticky').innerHTML=pricingStickyHtml();
}
function pricingCopyText(){
 const p=pricingState(),r=pricingCalc(p);
 return [`Orçamento · Clube Maker 3D Emersol`,p.name?`Peça: ${p.name}`:'',`Quantidade: ${r.quantity}`,`Valor por peça: ${money(r.price)}`,r.quantity>1?`Total: ${money(r.price*r.quantity)}`:'','maker3d.emersol.ai'].filter(Boolean).join('\n');
}
// Foto anexada, colada ou arrastada: fica só na memória do navegador (URL temporária).
function pricingSetPhoto(file){
 if(!file?.type?.startsWith('image/'))return toast('Escolha um arquivo de imagem.');
 if(state.pricingPhoto)URL.revokeObjectURL(state.pricingPhoto);
 state.pricingPhoto=URL.createObjectURL(file);pricingRefresh();
}
const pricingLoadImage=src=>new Promise((ok,fail)=>{const img=new Image();img.onload=()=>ok(img);img.onerror=fail;img.src=src;});
function pricingRound(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function pricingFit(ctx,text,max){if(ctx.measureText(text).width<=max)return text;while(text&&ctx.measureText(text+'…').width>max)text=text.slice(0,-1);return text+'…';}
// Imagem do orçamento (1080×1350, formato de post), sempre com a logo do clube.
async function pricingImage(){
 const p=pricingState(),r=pricingCalc(p),level=pricingLevel(p),W=1080,H=1350,c=document.createElement('canvas'),ctx=c.getContext('2d');
 const font=getComputedStyle(document.body).fontFamily||'sans-serif',f=(w,s)=>`${w} ${s}px ${font}`;
 c.width=W;c.height=H;
 const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#1d3560');bg.addColorStop(1,'#101c33');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 const logo=await pricingLoadImage('/brand-icon.svg');
 ctx.drawImage(logo,60,48,120,120);
 ctx.fillStyle='#fff';ctx.font=f(800,52);ctx.fillText('Clube Maker 3D',196,112);
 ctx.fillStyle='#13c4d0';ctx.font=f(700,28);ctx.fillText('EMERSOL · ORÇAMENTO',198,152);
 const box=[60,210,W-120,640];pricingRound(ctx,...box,36);ctx.save();ctx.clip();
 if(state.pricingPhoto){const img=await pricingLoadImage(state.pricingPhoto),s=Math.max(box[2]/img.width,box[3]/img.height);ctx.fillStyle='#0b1426';ctx.fillRect(...box);ctx.drawImage(img,box[0]+(box[2]-img.width*s)/2,box[1]+(box[3]-img.height*s)/2,img.width*s,img.height*s);}
 else{ctx.fillStyle='#ffffff10';ctx.fillRect(...box);ctx.globalAlpha=.9;ctx.drawImage(logo,W/2-170,box[1]+120,340,340);ctx.globalAlpha=1;}
 ctx.restore();
 ctx.fillStyle='#fff';ctx.font=f(800,60);ctx.fillText(pricingFit(ctx,p.name||'Sua peça em 3D',W-120),60,950);
 ctx.font=f(700,30);const chip=`${level[1]} · feito em impressão 3D`,cw=ctx.measureText(chip).width+48;pricingRound(ctx,60,980,cw,56,28);ctx.fillStyle='#ff6328';ctx.fill();ctx.fillStyle='#fff';ctx.fillText(chip,84,1018);
 ctx.fillStyle='#13c4d0';ctx.font=f(800,150);ctx.fillText(money(r.price),56,1200);
 ctx.fillStyle='#c9d6ea';ctx.font=f(600,34);ctx.fillText(r.quantity>1?`por peça · ${r.quantity} peças = ${money(r.price*r.quantity)}`:'por peça',62,1252);
 ctx.fillStyle='#ffcf54';ctx.fillRect(0,H-14,W,14);
 ctx.fillStyle='#8ea3c2';ctx.font=f(600,26);ctx.textAlign='right';ctx.fillText(`maker3d.emersol.ai · ${new Date().toLocaleDateString('pt-BR')}`,W-60,H-44);
 return new Promise(ok=>c.toBlob(ok,'image/png'));
}
const pricingFileName=()=>`orcamento-${(pricingState().name||'peca').normalize('NFD').replace(/[^\w]+/g,'-').replace(/^-|-$/g,'').toLowerCase()||'peca'}.png`;
function pricingDownload(blob){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=pricingFileName();document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
async function pricingAction(action){
 if(action==='pricing-reset'){state.pricing=pricingDefaults();if(state.pricingPhoto)URL.revokeObjectURL(state.pricingPhoto);state.pricingPhoto=null;render();return true;}
 if(action==='pricing-photo-remove'){URL.revokeObjectURL(state.pricingPhoto);state.pricingPhoto=null;pricingRefresh();return true;}
 if(action==='pricing-copy'){const text=pricingCopyText();try{await navigator.clipboard.writeText(text);toast('Orçamento copiado. Cole na conversa com o cliente.');}catch{modal('Copie o orçamento',`<textarea readonly rows="6">${esc(text)}</textarea>`);}return true;}
 if(action==='pricing-download'){pricingDownload(await pricingImage());toast('Imagem do orçamento baixada.');return true;}
 if(action==='pricing-share'){
  const blob=await pricingImage(),file=new File([blob],pricingFileName(),{type:'image/png'});
  if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Orçamento · Clube Maker 3D Emersol',text:pricingCopyText()});}catch(e){if(e.name!=='AbortError')pricingDownload(blob);}}
  else{pricingDownload(blob);toast('Imagem baixada. Envie para o cliente junto com a conversa.');}
  return true;
 }
 return false;
}
document.addEventListener('input',e=>{
 const form=e.target.closest('#pricing-form');if(!form)return;const p=pricingState(),el=e.target;
 if(el.name==='level')p.margin=Number(el.dataset.margin);
 if(el.name)p[el.name]=el.type==='checkbox'?el.checked:el.value;
 pricingRefresh();
});
document.addEventListener('change',e=>{if(e.target.name==='pricing-photo'&&e.target.files[0])pricingSetPhoto(e.target.files[0]);});
document.addEventListener('paste',e=>{if(state.page!=='pricing')return;const file=[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('image/'));if(file){e.preventDefault();pricingSetPhoto(file);}});
document.addEventListener('dragover',e=>{if(e.target.closest?.('.quote-photo'))e.preventDefault();});
document.addEventListener('drop',e=>{if(!e.target.closest?.('.quote-photo'))return;e.preventDefault();pricingSetPhoto(e.dataTransfer.files[0]);});
// Lembra quais cartões ficaram abertos ao voltar para a calculadora ("toggle" não borbulha).
document.addEventListener('toggle',e=>{const el=e.target;if(el.matches?.('.pricing-step'))pricingOpen()[el.dataset.step]=el.open;},true);
document.addEventListener('submit',e=>{if(e.target.id==='pricing-form'){e.preventDefault();e.stopImmediatePropagation();}},true);
