// Calculadora de preço: custo da hora + material com 20% de reserva + outros, e lucro de pelo menos 100% sobre o custo.
// Quanto mais personalizada a peça, maior o lucro sugerido. Nada é salvo: os valores ficam só nesta tela.
const pricingLevels=[
 ['ready','Modelo pronto','Peça baixada e impressa como está.',100],
 ['touch','Toque pessoal','Cor, nome ou recado escolhidos pelo cliente.',150],
 ['adapted','Adaptada','Modelo ajustado: tamanho, encaixe, texto em relevo.',200],
 ['unique','Exclusiva','Peça desenhada do zero só para o cliente.',300]];
const pricingMaterialReserve=20,pricingMinMargin=100;
const pricingNumber=(v,min,max)=>Math.min(max,Math.max(min,Number(String(v??'').replace(',','.'))||0));
const pricingReais=cents=>(cents/100).toFixed(2);
const pricingDecimal=v=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2});
function pricingDefaults(){
 const c=state.data?.config||{},m=(c.materials||[]).find(m=>m.active);
 return {name:'',quantity:1,printH:1,printM:0,rate:pricingReais(c.extra||600),workH:0,workM:30,workRate:'15.00',material:m?.name||'',kg:pricingReais(m?.cost||10000),grams:20,other:'0.00',level:'ready',margin:100};
}
function pricingState(){return state.pricing??=pricingDefaults();}
// Passos abertos: todos no computador; no celular começam fechados e mostram só o subtotal.
function pricingOpen(){return state.pricingOpen??=Object.fromEntries(['piece','time','material','level'].map(k=>[k,matchMedia('(min-width: 761px)').matches]));}
// Todos os valores em centavos, por peça, e depois multiplicados pela quantidade.
function pricingCalc(p){
 const quantity=Math.floor(pricingNumber(p.quantity,1,1000)),printHours=pricingNumber(p.printH,0,500)+pricingNumber(p.printM,0,59)/60,workHours=pricingNumber(p.workH,0,500)+pricingNumber(p.workM,0,59)/60;
 const rate=pricingNumber(p.rate,0,10000),workRate=pricingNumber(p.workRate,0,10000),grams=pricingNumber(p.grams,0,10000),kg=pricingNumber(p.kg,0,100000);
 const print=Math.round(printHours*rate*100),work=Math.round(workHours*workRate*100);
 const materialBase=Math.round(grams*kg/10),materialReserve=Math.round(materialBase*pricingMaterialReserve/100),other=Math.round(pricingNumber(p.other,0,100000)*100);
 const cost=print+work+materialBase+materialReserve+other,margin=Math.max(pricingMinMargin,pricingNumber(p.margin,0,1000)),exact=Math.round(cost*(1+margin/100));
 // Arredonda para cima até o próximo valor terminado em ,90 (ex.: R$ 23,40 → R$ 23,90).
 const price=cost?Math.ceil((exact+10)/100)*100-10:0,profit=price-cost;
 return {quantity,printHours,workHours,rate,workRate,grams,kg,print,work,time:print+work,materialBase,materialReserve,material:materialBase+materialReserve,other,cost,margin,exact,price,profit};
}
const pricingPercent=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:0})+'%';
const pricingTime=h=>{const m=Math.round(h*60);return m?`${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}`:'0h';};
const pricingLevel=p=>pricingLevels.find(l=>l[0]===p.level)||pricingLevels[0];
// Subtotais mostrados no título de cada passo, visíveis mesmo com o passo fechado.
function pricingSums(p,r){return {piece:`${r.quantity} ${r.quantity>1?'peças':'peça'}${p.name?' · '+esc(p.name):''}`,time:`${pricingTime(r.printHours+r.workHours)} · ${money(r.time)}`,material:`${pricingDecimal(r.grams)} g · ${money(r.material+r.other)}`,level:`${esc(pricingLevel(p)[1])} · lucro ${pricingPercent(r.margin)}`};}
function pricingResultHtml(){
 const p=pricingState(),r=pricingCalc(p);
 if(!r.cost)return `<div class="empty">${icon('tag')}<h3>Preencha os custos</h3><p>Informe o tempo de impressão e o material para ver o preço sugerido.</p></div>`;
 const costShare=Math.round(r.cost/r.price*100),line=(label,value,cls='')=>`<div class="${cls}"><span>${label}</span><strong>${money(value)}</strong></div>`;
 return `<div class="eyebrow">PREÇO SUGERIDO POR PEÇA</div><div class="pricing-price">${money(r.price)}</div><p class="muted pricing-caption">${esc(pricingLevel(p)[1])} · lucro de ${pricingPercent(r.margin)} sobre o custo</p>
 <progress class="pricing-split" max="100" value="${costShare}" aria-label="O custo é ${costShare}% do preço; o resto é lucro"></progress>
 <div class="legend"><div><span><i></i>Custo</span><strong>${money(r.cost)}</strong></div><div><span><i class="held"></i>Lucro</span><strong>${money(r.profit)}</strong></div></div>
 <details class="pricing-math" ${state.pricingMath??matchMedia('(min-width: 761px)').matches?'open':''}><summary>Ver a conta completa</summary>
 <div class="pricing-group"><h3>Tempo</h3><div class="summary">${line(`Impressão · ${pricingTime(r.printHours)} × ${money(r.rate*100)}/h`,r.print)}${line(`Seu trabalho · ${pricingTime(r.workHours)} × ${money(r.workRate*100)}/h`,r.work)}</div></div>
 <div class="pricing-group pricing-material"><h3>Material</h3><div class="summary">${line(`<b>Material puro</b> · ${pricingDecimal(r.grams)} g × ${money(r.kg*100)}/kg`,r.materialBase,'pure')}${line(`Reserva de ${pricingMaterialReserve}% (suportes e falhas)`,r.materialReserve)}${r.other?line('Outros custos',r.other):''}</div></div>
 <div class="pricing-group"><div class="summary">${line('<b>Custo por peça</b>',r.cost)}${line(`Lucro de ${pricingPercent(r.margin)}`,r.exact-r.cost)}${line('Preço sugerido',r.price,'total')}</div></div>
 ${r.quantity>1?`<div class="pricing-group"><h3>Pedido de ${r.quantity} peças</h3><div class="summary">${line('Total para o cliente',r.price*r.quantity)}${line('Material puro',r.materialBase*r.quantity)}${line('Custo total',r.cost*r.quantity)}${line('Lucro total',r.profit*r.quantity)}</div></div>`:''}
 </details>
 <p class="field-help">A conta dá ${money(r.exact)}; arredondamos para ${money(r.price)}. Nunca venda abaixo de ${money(r.cost)}: abaixo disso você paga para trabalhar.</p>
 <div class="row">${btn(icon('file')+' Copiar orçamento','pricing-copy','small')}${btn('Recomeçar','pricing-reset','secondary small')}</div>`;
}
function pricingStickyHtml(){const r=pricingCalc(pricingState());return `<strong>${money(r.price)}</strong><span>custo ${money(r.cost)} · material puro ${money(r.materialBase)}</span>`;}
function pricingPage(){
 const p=pricingState(),r=pricingCalc(p),open=pricingOpen(),sums=pricingSums(p,r),materials=(state.data?.config?.materials||[]).filter(m=>m.active);
 const field=(label,name,unit,attrs,cls='')=>`<label class="${cls}">${label}<span class="pricing-unit"><input name="${name}" type="number" inputmode="decimal" value="${esc(p[name])}" ${attrs}><em>${unit}</em></span></label>`;
 const step=(key,n,title,body)=>`<details class="pricing-step" data-step="${key}" ${open[key]?'open':''}><summary><span class="pricing-n">${n}</span><strong>${title}</strong><span class="pricing-sum" data-sum="${key}">${sums[key]}</span></summary><div class="pricing-body">${body}</div></details>`;
 return `<div class="pricing-head">${header('QUANTO VALE O QUE VOCÊ CRIA?','Calculadora de preço','Preencha os 4 passos e veja o preço na hora.')}</div>
 <div class="pricing-sticky" aria-hidden="true">${pricingStickyHtml()}</div>
 <div class="grid two pricing"><form id="pricing-form" class="card pricing-form" autocomplete="off">
 ${step('piece',1,'A peça',`<div class="pricing-grid two-one"><label>Nome da peça <small>(opcional)</small><input name="name" maxlength="80" value="${esc(p.name)}" placeholder="Ex.: chaveiro com nome"></label>${field('Quantidade','quantity','un.','min="1" max="1000" step="1"')}</div>`)}
 ${step('time',2,'Tempo',`<p class="pricing-hint">Tempo de impressão: veja no MakerWorld (ex.: <b>2 h</b>, <b>1,2 h</b>) ou no Bambu Studio ao fatiar. Mais de uma placa? Some todas.</p>
 <div class="pricing-grid three">${field('Impressão','printH','h','min="0" max="500" step="any"')}${field('+ minutos','printM','min','min="0" max="59" step="1"')}${field('Hora da impressora','rate','R$/h','min="0" step="0.01"')}</div>
 <p class="pricing-hint">Seu trabalho: modelar, lixar, pintar, montar.</p>
 <div class="pricing-grid three">${field('Seu trabalho','workH','h','min="0" max="500" step="any"')}${field('+ minutos','workM','min','min="0" max="59" step="1"')}${field('Sua hora','workRate','R$/h','min="0" step="0.01"')}</div>`)}
 ${step('material',3,'Material',`<p class="pricing-hint">Gramas: no MakerWorld aparece junto do material (ex.: <b>PLA | 32 g</b>). Preço por kg = valor do rolo ÷ peso do rolo (rolo de 1 kg por R$ 110 → <b>110</b>).</p>
 <div class="pricing-grid three"><label>Material<select name="material">${materials.map(m=>`<option value="${esc(m.name)}" data-kg="${pricingReais(m.cost)}" ${m.name===p.material?'selected':''}>${esc(m.name)}</option>`).join('')}<option value="" data-kg="" ${!materials.some(m=>m.name===p.material)?'selected':''}>Outro material</option></select></label>${field('Material por peça','grams','g','min="0" max="10000" step="any"')}${field('Preço do material','kg','R$/kg','min="0" step="0.01"')}</div>
 <div class="pricing-grid two-one">${field('Outros custos por peça <small>(embalagem, argola, ímã, tinta…)</small>','other','R$','min="0" step="0.01"')}</div>
 <p class="pricing-hint">Somamos ${pricingMaterialReserve}% de reserva ao material puro, para suportes, testes e peças que falham.</p>`)}
 ${step('level',4,'Personalização',`<p class="pricing-hint">Quanto mais única a peça, maior o lucro. Nunca menos de ${pricingMinMargin}% (o dobro do custo).</p>
 <div class="pricing-levels">${pricingLevels.map(([v,l,d,m])=>`<label class="pricing-level" title="${d}"><input type="radio" name="level" value="${v}" data-margin="${m}" ${p.level===v?'checked':''}><strong>${l}</strong><small>lucro ${m}%</small></label>`).join('')}</div>
 <div class="pricing-grid two-one"><p class="pricing-hint" id="pricing-level-hint">${esc(pricingLevel(p)[2])}</p>${field('Ajuste fino do lucro','margin','%',`min="${pricingMinMargin}" max="1000" step="5"`)}</div>`)}
 </form><aside><div class="card pricing-result" id="pricing-result" aria-live="polite">${pricingResultHtml()}</div></aside></div>`;
}
function pricingRefresh(){
 const p=pricingState(),sums=pricingSums(p,pricingCalc(p));
 for(const el of document.querySelectorAll('[data-sum]'))el.innerHTML=sums[el.dataset.sum];
 $('#pricing-result').innerHTML=pricingResultHtml();$('.pricing-sticky').innerHTML=pricingStickyHtml();
 const hint=$('#pricing-level-hint');if(hint)hint.textContent=pricingLevel(p)[2];
}
function pricingCopyText(){
 const p=pricingState(),r=pricingCalc(p);
 return [`Orçamento · Clube Maker 3D Emersol`,p.name?`Peça: ${p.name}`:'',`Quantidade: ${r.quantity}`,`Valor por peça: ${money(r.price)}`,r.quantity>1?`Total: ${money(r.price*r.quantity)}`:''].filter(Boolean).join('\n');
}
async function pricingAction(action){
 if(action==='pricing-reset'){state.pricing=pricingDefaults();render();return true;}
 if(action==='pricing-copy'){const text=pricingCopyText();try{await navigator.clipboard.writeText(text);toast('Orçamento copiado. Cole na conversa com o cliente.');}catch{modal('Copie o orçamento',`<textarea readonly rows="6">${esc(text)}</textarea>`);}return true;}
 return false;
}
document.addEventListener('input',e=>{
 const form=e.target.closest('#pricing-form');if(!form)return;const p=pricingState(),el=e.target;
 if(el.name==='material'){const kg=el.selectedOptions[0]?.dataset.kg;if(kg){p.kg=kg;form.elements.kg.value=kg;}}
 if(el.name==='level'){p.margin=Number(el.dataset.margin);form.elements.margin.value=p.margin;}
 if(el.name)p[el.name]=el.value;
 pricingRefresh();
});
document.addEventListener('change',e=>{if(e.target.matches('#pricing-form [name=margin]')&&Number(e.target.value)<pricingMinMargin){e.target.value=pricingMinMargin;pricingState().margin=pricingMinMargin;pricingRefresh();}});
// Lembra quais passos e detalhes ficaram abertos ao voltar para a calculadora ("toggle" não borbulha).
document.addEventListener('toggle',e=>{const el=e.target;if(el.matches?.('.pricing-step'))pricingOpen()[el.dataset.step]=el.open;else if(el.matches?.('.pricing-math'))state.pricingMath=el.open;},true);
document.addEventListener('submit',e=>{if(e.target.id==='pricing-form'){e.preventDefault();e.stopImmediatePropagation();}},true);
