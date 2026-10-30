export const statuses = ['draft','review','question','approval','queued','printing','ready','completed','cancelled','failed'];
export const reserved = ['queued','printing'];
export const consumed = ['ready','completed'];
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
