export const statuses = ['draft','review','question','approval','queued','printing','ready','picked','completed','cancelled','failed'];
export const reserved = ['queued','printing'];
// `ready` is "À retirar". `picked` is already collected and still waiting for payment.
export const consumed = ['ready','picked','completed'];
// Concluído needs a settled balance. Charge 0 is not enough: staff marks Isento / Bonificado.
export function financiallySettled(project){
  if(Boolean(Number(project?.paid)) || Boolean(Number(project?.exempt))) return true;
  // A bonificação que zera o orçamento quita o valor. Isento/Bonificado (exempt) continua sendo outra decisão.
  const gifted=Number(project?.bonus_minutes)>0 || Number(project?.bonus_cents)>0;
  return gifted && Number(project?.charge)===0;
}
// List scope for Pedidos do clube. Default hides Concluído and Cancelado; Todos brings both back.
export function ordersInScope(projects, filter){
  if(filter==='completed') return projects.filter(p=>p.status==='completed');
  if(filter==='all') return projects;
  return projects.filter(p=>p.status!=='completed'&&p.status!=='cancelled');
}
// Badge for a charge already issued and still open. Card with one installment does not announce parcelas.
export function openBillLabel(project){
  const method=project?.bill_method;
  const installments=Number(project?.bill_installments)||1;
  if(method==='card_installments'||method==='card_recurring') return installments>1?`Cartão emitido · aguardando · até ${installments}×`:'Cartão emitido · aguardando';
  return 'PIX emitido · aguardando';
}
export function financeKey(project){
  if(Number(project?.paid)) return 'paid';
  if(Number(project?.exempt)) return 'exempt';
  if(project?.bill_open) return 'open';
  if(project?.status==='ready'||project?.status==='picked'||project?.status==='completed') return Number(project.charge)>0?'due':'none';
  return '';
}
export function period(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(date);
  return `${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}`;
}
export function allocation(estimatedMinutes, availableMinutes, extraCents) {
  const included = Math.min(estimatedMinutes, Math.max(0, availableMinutes));
  return { included, extra: estimatedMinutes - included, extraCost: Math.round((estimatedMinutes-included)*extraCents/60) };
}
export const EXTRA_ITEMS_MAX = 20;
export const EXTRA_ITEM_DESC_MAX = 120;
// Staff add-ons on a quote: description, integer quantity and unit price in cents. Empty means the charge is unchanged.
export function readExtraItems(value) {
  let raw = value;
  if (raw == null || raw === '') return [];
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(raw)) return [];
  return raw.map(item => ({
    description: String(item?.description ?? '').trim(),
    quantity: Math.floor(Number(item?.quantity) || 0),
    unitCents: Math.floor(Number(item?.unitCents ?? item?.unit_cents) || 0)
  })).filter(item => item.description && item.quantity > 0 && item.unitCents >= 0);
}
export function extraItemsCost(value) {
  return readExtraItems(value).reduce((sum, item) => sum + item.quantity * item.unitCents, 0);
}
export function parseExtraItems(input) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error('Itens adicionais: envie uma lista.');
  if (input.length > EXTRA_ITEMS_MAX) throw new Error(`Itens adicionais: no máximo ${EXTRA_ITEMS_MAX}.`);
  return input.map((item, index) => {
    const n = index + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Item ${n}: dados inválidos.`);
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    if (!description || description.length > EXTRA_ITEM_DESC_MAX) throw new Error(`Item ${n}: descreva entre 1 e ${EXTRA_ITEM_DESC_MAX} caracteres.`);
    const quantity = item.quantity;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error(`Item ${n}: a quantidade é um inteiro de 1 a 1000.`);
    const unitCents = item.unitCents ?? item.unit_cents;
    if (typeof unitCents !== 'number' || !Number.isInteger(unitCents) || unitCents < 0 || unitCents > 1000000) throw new Error(`Item ${n}: o preço unitário é um inteiro de 0 a 1000000 centavos.`);
    return {description, quantity, unitCents};
  });
}
// One sentence for the order history and the confirmation after a charge is issued or paid.
export function chargeHistory({cents, method, installments=1, whatsapp=false, paid=false}) {
  const value = (Number(cents) / 100).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  const card = method === 'card_installments' || method === 'card_recurring';
  const times = card && Number(installments) > 1 ? ` (até ${Number(installments)}x)` : '';
  if (paid) return `Pagamento de ${value} recebido via ${card ? 'cartão' : 'PIX'}.`;
  if (card) return `Link de pagamento no cartão${times} de ${value} gerado${whatsapp ? ' e enviado no WhatsApp' : ''}.`;
  return `Cobrança de ${value} emitida via PIX${whatsapp ? ' e enviada no WhatsApp' : '. O WhatsApp não foi enviado'}.`;
}
export function extraItemsText(value) {
  const money = cents => (cents / 100).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
  return readExtraItems(value).map(item => `${item.description} (${item.quantity} × ${money(item.unitCents)} = ${money(item.quantity * item.unitCents)})`).join('; ');
}
// Hours gifted by the team come off the hours that would be charged. A cash gift comes off the whole charge (hours, filament and extra items), which never goes below zero.
export function chargeWithBonus({extraMinutes, extraRate, materialCost, bonusMinutes=0, bonusCents=0, itemsCost=0}) {
  const extraBefore = Math.max(0, Number(extraMinutes) || 0);
  const rate = Number(extraRate) || 0;
  const gifted = Math.min(Math.max(0, Math.floor(Number(bonusMinutes) || 0)), extraBefore);
  const extra = extraBefore - gifted;
  const extraCost = Math.round(extra * rate / 60);
  const extraCostBefore = Math.round(extraBefore * rate / 60);
  const material = Math.max(0, Math.round(Number(materialCost) || 0));
  const items = Math.max(0, Math.round(Number(itemsCost) || 0));
  const hourBonusValue = extraCostBefore - extraCost;
  const gross = extraCost + material + items;
  const money = Math.min(Math.max(0, Math.floor(Number(bonusCents) || 0)), gross);
  let reportedMaterial = material, reportedExtra = extraCost, reportedItems = items, left = money;
  const fromMaterial = Math.min(reportedMaterial, left);
  reportedMaterial -= fromMaterial;
  left -= fromMaterial;
  const fromExtra = Math.min(reportedExtra, left);
  reportedExtra -= fromExtra;
  left -= fromExtra;
  reportedItems -= left;
  return {extra, extraBefore, bonusMinutes: gifted, extraCost, extraCostBefore, materialCost: material, itemsCost: items, hourBonusValue, bonusCents: money, reportedExtra, reportedMaterial, reportedItems, total: gross - money};
}
export function pricedQuote({minutes, grams, available, extraRate, materialRate, bonusMinutes=0, bonusCents=0, extraItems=[]}) {
  const a = allocation(Math.max(0, Number(minutes) || 0), available, extraRate);
  const materialCost = Math.round(Math.max(0, Number(grams) || 0) * Math.max(0, Number(materialRate) || 0) / 1000);
  const items = readExtraItems(extraItems);
  const priced = chargeWithBonus({extraMinutes: a.extra, extraRate, materialCost, bonusMinutes, bonusCents, itemsCost: extraItemsCost(items)});
  return {minutes, grams, included: a.included, extraItems: items, ...priced, materialRate: Number(materialRate) || 0, extraRate: Number(extraRate) || 0, timeValue: Math.round((Number(minutes) || 0) * (Number(extraRate) || 0) / 60), creditValue: Math.round(a.included * (Number(extraRate) || 0) / 60)};
}
// Splits a stored charge into hours, filament and extra items after gifted hours, so a message does not bill the same hour twice.
export function quoteCostParts(p) {
  const extraBefore = Math.max(0, (Number(p?.minutes) || 0) - (Number(p?.included) || 0));
  const gifted = Math.min(Math.max(0, Math.floor(Number(p?.bonus_minutes) || 0)), extraBefore);
  const hourCap = Math.round((extraBefore - gifted) * (Number(p?.extra_rate) || 0) / 60);
  const itemsFull = extraItemsCost(p?.extra_items);
  const charge = Math.max(0, Number(p?.charge) || 0);
  let hours, material, items;
  if (charge >= hourCap + itemsFull) {
    hours = hourCap;
    items = itemsFull;
    material = charge - hourCap - itemsFull;
  } else if (charge >= itemsFull) {
    hours = charge - itemsFull;
    items = itemsFull;
    material = 0;
  } else {
    hours = 0;
    items = charge;
    material = 0;
  }
  return {hours, material, items, gifted};
}
export function hoursLine({included=0, extra=0, bonusMinutes=0}={}) {
  const h = m => `${Number((Number(m) / 60).toFixed(1)).toLocaleString('pt-BR')} h`;
  const base = included > 0 ? (extra > 0 ? `Usa ${h(included)} do saldo + ${h(extra)} extras` : `Usa ${h(included)} do saldo`) : `Sem saldo: ${h(extra)} extras`;
  return bonusMinutes > 0 ? `${base} · ${h(bonusMinutes)} bonificadas` : base;
}
export function settle(project, actualMinutes, actualGrams) {
  const billable = Math.min(actualMinutes, project.minutes);
  const used = Math.min(billable, project.included);
  const materialCost = Math.round(Math.min(actualGrams, project.grams) * project.material_rate / 1000);
  const priced = chargeWithBonus({extraMinutes: Math.max(0, billable - used), extraRate: project.extra_rate, materialCost, bonusMinutes: project.bonus_minutes, bonusCents: project.bonus_cents, itemsCost: extraItemsCost(project.extra_items)});
  return { used, charge: priced.total };
}
export function balance(projects, allowance, month) {
  let used=0, held=0;
  for(const p of projects.filter(p=>p.period===month)) {
    if(reserved.includes(p.status)) held += p.included;
    if(consumed.includes(p.status)) used += p.used;
  }
  return { allowance, used, held, available: Math.max(0, allowance-used-held), period: month };
}

// Costs use the approved rate snapshots and the existing budget ceiling.
// The accounting month remains the month in which the family approved the project.
export function monthlyUsage(projects, allowance, month) {
  const result={...balance(projects,allowance,month),extraMinutes:0,extraCost:0,materialCost:0,itemsCost:0,grams:0,pendingExtra:0,pendingMaterial:0,pendingItems:0,pendingExtraMinutes:0,actualMinutes:0};
  for(const p of projects){
    if(p.period!==month)continue;
    if(reserved.includes(p.status)){
      const priced=chargeWithBonus({extraMinutes:Math.max(0,p.minutes-p.included),extraRate:p.extra_rate,materialCost:Math.round(p.grams*p.material_rate/1000),bonusMinutes:p.bonus_minutes,bonusCents:p.bonus_cents,itemsCost:extraItemsCost(p.extra_items)});
      result.pendingExtraMinutes+=priced.extra;
      result.pendingExtra+=priced.reportedExtra;
      result.pendingMaterial+=priced.reportedMaterial;
      result.pendingItems+=priced.reportedItems;
    }
    if(consumed.includes(p.status)){
      const extraBefore=Math.max(0,Math.min(p.actual_minutes??p.minutes,p.minutes)-p.used);
      const priced=chargeWithBonus({extraMinutes:extraBefore,extraRate:p.extra_rate,materialCost:Math.round(Math.min(p.actual_grams??p.grams,p.grams)*p.material_rate/1000),bonusMinutes:p.bonus_minutes,bonusCents:p.bonus_cents,itemsCost:extraItemsCost(p.extra_items)});
      const extra=priced.extra;
      result.extraMinutes+=extra;
      result.extraCost+=priced.reportedExtra;
      result.materialCost+=priced.reportedMaterial;
      result.itemsCost+=priced.reportedItems;
      result.grams+=p.actual_grams??p.grams;
      result.actualMinutes+=p.actual_minutes??p.minutes;
    }
  }
  return {...result,total:result.extraCost+result.materialCost+result.itemsCost};
}
