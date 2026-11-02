// Calculadora de preço: custo da hora + material com 20% de reserva + outros, e lucro de pelo menos 100% sobre o custo.
// Quanto mais personalizada a peça, maior o lucro sugerido. Nada é salvo: os valores ficam só nesta tela.
const pricingLevels=[
 ['ready','Modelo pronto','Peça baixada e impressa como está.',100],
 ['touch','Toque pessoal','Cor, nome ou recado escolhidos pelo cliente.',150],
 ['adapted','Adaptada sob encomenda','Modelo ajustado: tamanho, encaixe, texto em relevo.',200],
 ['unique','Criação exclusiva','Peça desenhada do zero só para o cliente.',300]];
const pricingMaterialReserve=20,pricingMinMargin=100;
const pricingNumber=(v,min,max)=>Math.min(max,Math.max(min,Number(String(v??'').replace(',','.'))||0));
const pricingReais=cents=>(cents/100).toFixed(2);
function pricingDefaults(){
 const c=state.data?.config||{},m=(c.materials||[]).find(m=>m.active);
 return {name:'',quantity:1,printH:1,printM:0,rate:pricingReais(c.extra||600),workH:0,workM:30,workRate:'15.00',material:m?.name||'',kg:pricingReais(m?.cost||10000),grams:20,other:'0.00',level:'ready',margin:100};
}
function pricingState(){return state.pricing??=pricingDefaults();}
// Todos os valores em centavos, por peça, e depois multiplicados pela quantidade.
function pricingCalc(p){
 const quantity=Math.floor(pricingNumber(p.quantity,1,1000)),printHours=pricingNumber(p.printH,0,500)+pricingNumber(p.printM,0,59)/60,workHours=pricingNumber(p.workH,0,500)+pricingNumber(p.workM,0,59)/60;
 const print=Math.round(printHours*pricingNumber(p.rate,0,10000)*100),work=Math.round(workHours*pricingNumber(p.workRate,0,10000)*100);
 const materialBase=Math.round(pricingNumber(p.grams,0,10000)*pricingNumber(p.kg,0,100000)/10),materialReserve=Math.round(materialBase*pricingMaterialReserve/100),other=Math.round(pricingNumber(p.other,0,100000)*100);
 const cost=print+work+materialBase+materialReserve+other,margin=Math.max(pricingMinMargin,pricingNumber(p.margin,0,1000)),exact=Math.round(cost*(1+margin/100));
 // Arredonda para cima até o próximo valor terminado em ,90 (ex.: R$ 23,40 → R$ 23,90).
 const price=cost?Math.ceil((exact+10)/100)*100-10:0,profit=price-cost;
 return {quantity,printHours,workHours,print,work,materialBase,materialReserve,other,cost,margin,exact,price,profit,realMargin:cost?profit/cost*100:0};
}
const pricingPercent=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:0})+'%';
const pricingTime=h=>{const m=Math.round(h*60);return m?`${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}`:'0h';};
function pricingResultHtml(){
 const p=pricingState(),r=pricingCalc(p),level=pricingLevels.find(l=>l[0]===p.level)||pricingLevels[0];
 if(!r.cost)return `<div class="empty">${icon('tag')}<h3>Preencha os custos</h3><p>Informe o tempo de impressão e o material para ver o preço sugerido.</p></div>`;
 const costShare=Math.round(r.cost/r.price*100);
 return `<div class="eyebrow">PREÇO SUGERIDO POR PEÇA</div><div class="pricing-price">${money(r.price)}</div><p class="muted">${esc(level[1])} · lucro de ${pricingPercent(r.margin)} sobre o custo${p.name?` · ${esc(p.name)}`:''}</p>
 <progress class="pricing-split" max="100" value="${costShare}" aria-label="O custo é ${costShare}% do preço; o resto é lucro"></progress>
 <div class="legend"><div><span><i></i>Custo</span><strong>${money(r.cost)}</strong></div><div><span><i class="held"></i>Lucro</span><strong>${money(r.profit)}</strong></div></div>
 <div class="summary section"><div><span>Impressão · ${pricingTime(r.printHours)}</span><strong>${money(r.print)}</strong></div><div><span>Seu trabalho · ${pricingTime(r.workHours)}</span><strong>${money(r.work)}</strong></div><div><span>Material · ${esc(String(pricingNumber(p.grams,0,10000)).replace('.',','))} g</span><strong>${money(r.materialBase)}</strong></div><div><span>Reserva de material (+${pricingMaterialReserve}%)</span><strong>${money(r.materialReserve)}</strong></div>${r.other?`<div><span>Outros custos</span><strong>${money(r.other)}</strong></div>`:''}<div><span><b>Custo por peça</b></span><strong>${money(r.cost)}</strong></div><div><span>Lucro de ${pricingPercent(r.margin)}</span><strong>${money(r.exact-r.cost)}</strong></div><div><span>Preço calculado</span><strong>${money(r.exact)}</strong></div><div class="total"><span>Preço sugerido</span><strong>${money(r.price)}</strong></div></div>
 ${r.quantity>1?`<div class="summary pricing-order"><div><span>${r.quantity} peças · total do pedido</span><strong>${money(r.price*r.quantity)}</strong></div><div><span>Custo total</span><strong>${money(r.cost*r.quantity)}</strong></div><div><span>Lucro total</span><strong>${money(r.profit*r.quantity)}</strong></div></div>`:''}
 <p class="field-help">Nunca venda abaixo de ${money(r.cost)}: abaixo disso você paga para trabalhar. Com ${money(r.cost*2)} você ainda cobre o custo e ganha o mínimo de 100%.</p>
 <div class="row">${btn(icon('file')+' Copiar orçamento para o cliente','pricing-copy','small')}${btn('Recomeçar','pricing-reset','secondary small')}</div>`;
}
function pricingPage(){
 const p=pricingState(),materials=(state.data?.config?.materials||[]).filter(m=>m.active),field=(label,name,attrs,help='')=>`<label>${label}<input name="${name}" type="number" inputmode="decimal" value="${esc(p[name])}" ${attrs}>${help?`<small class="field-help">${help}</small>`:''}</label>`;
 return `${header('QUANTO VALE O QUE VOCÊ CRIA?','Calculadora de preço','Some os custos, escolha o quanto a peça é personalizada e veja o preço sugerido para vender.')}
 <div class="grid two pricing"><form id="pricing-form" class="stack" autocomplete="off" onsubmit="return false">
 <div class="card stack"><h2>1. A peça</h2><div class="form-grid"><label>Nome da peça (opcional)<input name="name" maxlength="80" value="${esc(p.name)}" placeholder="Ex.: chaveiro com nome"></label>${field('Quantidade','quantity','min="1" max="1000" step="1"')}</div></div>
 <div class="card stack"><h2>2. Custo da hora</h2><p>Use o tempo e as gramas que aparecem no MakerWorld (ex.: <b>2 h</b>, <b>1,2 h</b>, <b>PLA 32 g</b>) ou no Bambu Studio depois de fatiar. Se a peça tem mais de uma placa, some todas.</p>
 <div class="form-grid">${field('Tempo de impressão (horas)','printH','min="0" max="500" step="any"','Pode usar decimal: 1,2 h = 1h12.')}${field('+ minutos (opcional)','printM','min="0" max="59" step="1"')}</div>${field('Valor da hora de impressão (R$)','rate','min="0" step="0.01"','Começa com o valor da hora extra do clube. Use o custo da sua impressora, se tiver um.')}
 <div class="form-grid">${field('Seu trabalho (horas)','workH','min="0" max="500" step="any"','Modelagem, acabamento, montagem.')}${field('+ minutos (opcional)','workM','min="0" max="59" step="1"')}</div>${field('Valor da sua hora de trabalho (R$)','workRate','min="0" step="0.01"')}</div>
 <div class="card stack"><h2>3. Materiais</h2><div class="form-grid"><label>Material<select name="material">${materials.map(m=>`<option value="${esc(m.name)}" data-kg="${pricingReais(m.cost)}" ${m.name===p.material?'selected':''}>${esc(m.name)} · ${money(m.cost)}/kg</option>`).join('')}<option value="" data-kg="" ${!materials.some(m=>m.name===p.material)?'selected':''}>Outro material</option></select></label>${field('Preço do material (R$ por kg)','kg','min="0" step="0.01"')}</div>
 <div class="form-grid">${field('Material por peça (gramas)','grams','min="0" max="10000" step="any"','No MakerWorld aparece junto do material, ex.: PLA | 32 g.')}${field('Outros custos por peça (R$)','other','min="0" step="0.01"','Embalagem, argola, ímã, tinta…')}</div>
 <p class="field-help">Sobre o material somamos ${pricingMaterialReserve}% de reserva para suportes, testes e peças que falham.</p></div>
 <div class="card stack"><h2>4. Quanto é personalizada?</h2><p>Quanto mais única a peça, mais ela vale. O lucro começa em ${pricingMinMargin}% do custo.</p>
 <div class="pricing-levels">${pricingLevels.map(([v,l,d,m])=>`<label class="theme-choice"><input type="radio" name="level" value="${v}" data-margin="${m}" ${p.level===v?'checked':''}><strong>${l}</strong><small>${d}</small><span class="badge">lucro ${m}%</span></label>`).join('')}</div>
 ${field('Lucro sobre o custo (%)','margin',`min="${pricingMinMargin}" max="1000" step="5"`,`Ajuste fino. Mínimo de ${pricingMinMargin}%: o preço é pelo menos o dobro do custo.`)}</div>
 </form><aside><div class="card stack pricing-result" id="pricing-result" aria-live="polite">${pricingResultHtml()}</div></aside></div>`;
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
 $('#pricing-result').innerHTML=pricingResultHtml();
});
document.addEventListener('change',e=>{if(e.target.matches('#pricing-form [name=margin]')&&Number(e.target.value)<pricingMinMargin){e.target.value=pricingMinMargin;pricingState().margin=pricingMinMargin;$('#pricing-result').innerHTML=pricingResultHtml();}});
