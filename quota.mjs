import {period,monthlyUsage,reserved,consumed} from './domain.mjs';
export function localDate(date=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
}
export function monthEnd(month=period()){const [y,m]=month.split('-').map(Number);return `${month}-${new Date(Date.UTC(y,m,0)).getUTCDate()}`;}
export const expiry=b=>b.expires_on||monthEnd(b.period);
// Reserved gifts stay attached to the approved project after their expiration.
// Base allowance renews monthly; gifts keep a separate, nonrenewing balance.
export function giftUsage(project,allocations){
 if(reserved.includes(project.status))return allocations.map(a=>({...a,held:a.minutes,used:0}));
 let remaining=consumed.includes(project.status)?Math.max(0,project.used-(project.included-allocations.reduce((n,a)=>n+a.minutes,0))):0;
 return allocations.map(a=>{const used=Math.min(remaining,a.minutes);remaining-=used;return {...a,used,held:0};});
}
export function computeQuota(projects,base,benefits,allocations,month=period(),today=localDate()){
 const usage=new Map(benefits.map(b=>[b.code,{...b,usedMinutes:0,heldMinutes:0}]));
 let baseUsed=0,baseHeld=0;
 for(const p of projects){
  const rows=giftUsage(p,allocations.filter(a=>a.project_id===p.id).sort((a,b)=>expiry(usage.get(a.code)).localeCompare(expiry(usage.get(b.code)))||a.code.localeCompare(b.code)));
  for(const a of rows){const b=usage.get(a.code);if(b){b.usedMinutes+=a.used;b.heldMinutes+=a.held;}}
  if(p.period===month){if(consumed.includes(p.status))baseUsed+=p.used-rows.reduce((n,a)=>n+a.used,0);if(reserved.includes(p.status))baseHeld+=p.included-rows.reduce((n,a)=>n+a.held,0);}
 }
 const gifts=[...usage.values()].map(b=>({...b,expiresOn:expiry(b),remaining:Math.max(0,b.value-b.usedMinutes-b.heldMinutes)}));
 const active=gifts.filter(b=>b.expiresOn>=today).sort((a,b)=>a.expiresOn.localeCompare(b.expiresOn)||a.created.localeCompare(b.created)||a.code.localeCompare(b.code));
 const result=monthlyUsage(projects,base,month),available=Math.max(0,base-baseUsed-baseHeld)+active.reduce((n,b)=>n+b.remaining,0);
 return {...result,allowance:result.used+result.held+available,available,baseAllowance:base,baseAvailable:Math.max(0,base-baseUsed-baseHeld),giftAvailable:active.reduce((n,b)=>n+b.remaining,0),gifts,activeGifts:active};
}
export function createQuota(db){
 async function balance(id){
  const f=await db.one('SELECT * FROM families WHERE id=?',id);
  const projects=await db.all('SELECT * FROM projects WHERE family_id=?',id);
  const benefits=await db.all("SELECT b.*,t.expires_on FROM benefits b LEFT JOIN benefit_terms t ON t.code=b.code WHERE b.family_id=? AND b.kind='hours'",id);
  const allocations=await db.all('SELECT a.* FROM benefit_allocations a JOIN projects p ON p.id=a.project_id WHERE p.family_id=? ORDER BY a.code',id);
  return computeQuota(projects,f.allowance,benefits,allocations);
 }
 async function reserve(projectId,familyId,included){
  // Called before setting project.included, inside the approval transaction.
  await db.run('DELETE FROM benefit_allocations WHERE project_id=?',projectId);
  const b=await balance(familyId);let remaining=Math.max(0,included-b.baseAvailable);
  for(const gift of b.activeGifts){const minutes=Math.min(remaining,gift.remaining);if(minutes)await db.run('INSERT INTO benefit_allocations(project_id,code,minutes) VALUES(?,?,?) ON CONFLICT(project_id,code) DO UPDATE SET minutes=excluded.minutes',projectId,gift.code,minutes);remaining-=minutes;if(!remaining)break;}
  if(remaining)throw new Error('Saldo de bônus insuficiente durante reserva.');
 }
 return {balance,reserve};
}
