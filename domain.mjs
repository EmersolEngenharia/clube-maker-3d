export const statuses = ['draft','review','question','approval','queued','printing','ready','completed','cancelled','failed'];
export const reserved = ['queued','printing'];
// `ready` is the visible stage "À retirar": printed, waiting for the family to pick it up.
export const consumed = ['ready','completed'];
// Concluído needs a settled balance. Charge 0 is not enough: staff marks Isento / Bonificado.
export function financiallySettled(project){
  return Boolean(Number(project?.paid)) || Boolean(Number(project?.exempt));
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
export function settle(project, actualMinutes, actualGrams) {
  const billable = Math.min(actualMinutes, project.minutes);
  const used = Math.min(billable, project.included);
  return { used, charge: Math.round(Math.max(0,billable-used)*project.extra_rate/60) + Math.round(Math.min(actualGrams,project.grams)*project.material_rate/1000) };
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
      result.pendingExtraMinutes+=Math.max(0,p.minutes-p.included);
      result.pendingExtra+=Math.round(Math.max(0,p.minutes-p.included)*p.extra_rate/60);
      result.pendingMaterial+=Math.round(p.grams*p.material_rate/1000);
    }
    if(consumed.includes(p.status)){
      const extra=Math.max(0,Math.min(p.actual_minutes??p.minutes,p.minutes)-p.used);
      result.extraMinutes+=extra;
      result.extraCost+=Math.round(extra*p.extra_rate/60);
      result.materialCost+=Math.round(Math.min(p.actual_grams??p.grams,p.grams)*p.material_rate/1000);
      result.grams+=p.actual_grams??p.grams;
      result.actualMinutes+=p.actual_minutes??p.minutes;
    }
  }
  return {...result,total:result.extraCost+result.materialCost};
}
