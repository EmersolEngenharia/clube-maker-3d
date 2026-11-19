export const statuses = ['draft','review','question','approval','queued','printing','ready','completed','cancelled','failed'];
export const reserved = ['queued','printing'];
// `ready` is the visible stage "À retirar": printed, waiting for the family to pick it up.
export const consumed = ['ready','completed'];
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
export function financeKey(project){
  if(Number(project?.paid)) return 'paid';
  if(Number(project?.exempt)) return 'exempt';
  if(project?.bill_open) return 'open';
  if(project?.status==='ready'||project?.status==='completed') return Number(project.charge)>0?'due':'none';
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
// Hours gifted by the team come off the hours that would be charged. A cash gift comes off the total, which never goes below zero.
export function chargeWithBonus({extraMinutes, extraRate, materialCost, bonusMinutes=0, bonusCents=0}) {
  const extraBefore = Math.max(0, Number(extraMinutes) || 0);
  const rate = Number(extraRate) || 0;
  const gifted = Math.min(Math.max(0, Math.floor(Number(bonusMinutes) || 0)), extraBefore);
  const extra = extraBefore - gifted;
  const extraCost = Math.round(extra * rate / 60);
  const material = Math.max(0, Math.round(Number(materialCost) || 0));
  const hourBonusValue = Math.round(gifted * rate / 60);
  const gross = extraCost + material;
  const money = Math.min(Math.max(0, Math.floor(Number(bonusCents) || 0)), gross);
  let reportedMaterial = material, reportedExtra = extraCost, left = money;
  const fromMaterial = Math.min(reportedMaterial, left);
  reportedMaterial -= fromMaterial;
  left -= fromMaterial;
  reportedExtra -= left;
  return {extra, extraBefore, bonusMinutes: gifted, extraCost, materialCost: material, hourBonusValue, bonusCents: money, reportedExtra, reportedMaterial, total: gross - money};
}
export function pricedQuote({minutes, grams, available, extraRate, materialRate, bonusMinutes=0, bonusCents=0}) {
  const a = allocation(Math.max(0, Number(minutes) || 0), available, extraRate);
  const materialCost = Math.round(Math.max(0, Number(grams) || 0) * Math.max(0, Number(materialRate) || 0) / 1000);
  const priced = chargeWithBonus({extraMinutes: a.extra, extraRate, materialCost, bonusMinutes, bonusCents});
  return {minutes, grams, included: a.included, ...priced, materialRate: Number(materialRate) || 0, extraRate: Number(extraRate) || 0, timeValue: Math.round((Number(minutes) || 0) * (Number(extraRate) || 0) / 60), creditValue: Math.round(a.included * (Number(extraRate) || 0) / 60)};
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
  const priced = chargeWithBonus({extraMinutes: Math.max(0, billable - used), extraRate: project.extra_rate, materialCost, bonusMinutes: project.bonus_minutes, bonusCents: project.bonus_cents});
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
  const result={...balance(projects,allowance,month),extraMinutes:0,extraCost:0,materialCost:0,grams:0,pendingExtra:0,pendingMaterial:0,pendingExtraMinutes:0,actualMinutes:0};
  for(const p of projects){
    if(p.period!==month)continue;
    if(reserved.includes(p.status)){
      const priced=chargeWithBonus({extraMinutes:Math.max(0,p.minutes-p.included),extraRate:p.extra_rate,materialCost:Math.round(p.grams*p.material_rate/1000),bonusMinutes:p.bonus_minutes,bonusCents:p.bonus_cents});
      result.pendingExtraMinutes+=priced.extra;
      result.pendingExtra+=priced.reportedExtra;
      result.pendingMaterial+=priced.reportedMaterial;
    }
    if(consumed.includes(p.status)){
      const extraBefore=Math.max(0,Math.min(p.actual_minutes??p.minutes,p.minutes)-p.used);
      const priced=chargeWithBonus({extraMinutes:extraBefore,extraRate:p.extra_rate,materialCost:Math.round(Math.min(p.actual_grams??p.grams,p.grams)*p.material_rate/1000),bonusMinutes:p.bonus_minutes,bonusCents:p.bonus_cents});
      const extra=priced.extra;
      result.extraMinutes+=extra;
      result.extraCost+=priced.reportedExtra;
      result.materialCost+=priced.reportedMaterial;
      result.grams+=p.actual_grams??p.grams;
      result.actualMinutes+=p.actual_minutes??p.minutes;
    }
  }
  return {...result,total:result.extraCost+result.materialCost};
}
