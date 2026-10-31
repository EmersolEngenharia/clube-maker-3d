import {randomBytes,createHash} from 'node:crypto';
import {isAdmin,isTeam,canFinance,canOperate} from './permissions.mjs';
import {localDate,monthEnd,expiry} from './quota.mjs';
import {period} from './domain.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const now=()=>new Date().toISOString();
export function createOperations({db,quota,fail,str,integer,body,json,creds,password,login}){
 const one=(q,...a)=>db.one(q,...a),all=(q,...a)=>db.all(q,...a),run=(q,...a)=>db.run(q,...a);
 const need=(ok)=>{if(!ok)fail('Você não tem permissão para esta ação.',403);};
 const audit=(u,action,target)=>run('INSERT INTO audit_log(user_id,action,target,created) VALUES(?,?,?,?)',u.id,action,String(target),now());
 function date(value,label='Data'){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)fail(`${label}: informe uma data válida.`);return value;}
 const requestKey=b=>str(b.requestKey,'Identificação do lançamento',100);
 const accessRole=value=>{if(!['admin','finance','operator'].includes(value))fail('Função inválida.');return value;};
 async function family(id){const f=await one('SELECT * FROM families WHERE id=?',integer(id,'Família',1,2147483647));if(!f)fail('Família não encontrada.',404);return f;}
 function ownFamily(u){need(['guardian','learner'].includes(u.role)&&Boolean(u.family_id));return u.family_id;}
 async function addEntry({scope='club',familyId=null,kind,category,description,cents,entryDate=localDate(),sourceKey=null,createdBy=null,key=null}){
  return Number((await run('INSERT INTO cash_entries(scope,family_id,kind,category,description,cents,entry_date,source_key,created_by,created,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?)',scope,familyId,kind,category,description,cents,entryDate,sourceKey,createdBy,now(),key)).lastInsertRowid);
 }
 async function backfill(){
  // Preserve old received amounts, with the original registration date.
  await run("INSERT INTO cash_entries(scope,family_id,kind,category,description,cents,entry_date,source_key,created) SELECT 'club',p.family_id,'income','membership',p.description,p.cents,SUBSTR(p.created,1,10),'payment:' || p.id,p.created FROM payments p WHERE NOT EXISTS(SELECT 1 FROM cash_entries c WHERE c.source_key='payment:' || p.id)");
  await run("INSERT INTO cash_entries(scope,family_id,kind,category,description,cents,entry_date,source_key,created) SELECT 'club',p.family_id,'income','printing',p.name,p.charge,SUBSTR(p.updated,1,10),'project:' || p.id,p.updated FROM projects p WHERE p.paid=1 AND NOT EXISTS(SELECT 1 FROM cash_entries c WHERE c.source_key='project:' || p.id)");
 }
 async function recordProject(p,u){
  need(canFinance(u));if(p.paid)fail('O pagamento deste projeto já foi registrado.',409);
  await addEntry({familyId:p.family_id,kind:'income',category:'printing',description:'Impressão: '+p.name,cents:p.charge,sourceKey:'project:'+p.id,createdBy:u.id});
  await audit(u,'finance.project.received',p.id);
 }
 async function getBenefits(fid){
  const b=await quota.balance(fid);
  const rows=await all('SELECT b.*,t.expires_on,t.redeemed_at,u.name granted_by FROM benefits b LEFT JOIN benefit_terms t ON t.code=b.code JOIN users u ON u.id=b.created_by WHERE b.family_id=? ORDER BY b.created DESC,b.code',fid);
  return rows.map(r=>{const gift=b.gifts.find(g=>g.code===r.code),expiresOn=expiry(r);return {...r,expiresOn,remaining:gift?.remaining??(r.used?0:r.value),usedMinutes:gift?.usedMinutes??0,heldMinutes:gift?.heldMinutes??0,status:r.kind==='discount'&&r.used?'used':r.kind==='hours'&&gift?.remaining===0?'exhausted':expiresOn<localDate()?'expired':'available'};});
 }
 async function preview(fid,b){
  if(b.waiver===true&&b.coupon)fail('Escolha cupom ou isenção total.');
  const f=await family(fid),gross=integer(b.gross,'Valor original',1,10000000);let discount=0,coupon=null;
  if(b.coupon){coupon=await one("SELECT b.*,t.expires_on FROM benefits b LEFT JOIN benefit_terms t ON t.code=b.code WHERE b.code=? AND b.family_id=? AND b.kind='discount' AND b.used=0",str(b.coupon,'Cupom',40).toUpperCase(),f.id);if(!coupon||expiry(coupon)<localDate())fail('Cupom inválido, utilizado, expirado ou de outra família.');discount=Math.min(gross,coupon.value);}
  if(!gross&&!b.waiver)fail('Informe o valor original.');
  if(b.waiver===true){str(b.reason,'Motivo da isenção',150);discount=gross;}
  return {gross,discount,total:Math.max(0,gross-discount),coupon:coupon?.code||null};
 }
 async function publicRoute(req,res,path,method){
  if(path==='/api/staff-invite'&&method==='GET'){
   const token=new URL(req.url,'http://localhost').searchParams.get('token')||'',i=await one('SELECT email,access_role,expires FROM staff_invites WHERE token=? AND expires>?',hash(token),Date.now());
   if(!i)fail('Convite de equipe inválido ou expirado.',410);json(res,i);return true;
  }
  if(path==='/api/staff-register'&&method==='POST'){
   const b=await body(req),email=creds(b),i=await one('SELECT * FROM staff_invites WHERE token=? AND expires>?',hash(str(b.token,'Convite',150)),Date.now());
   if(!i||i.email!==email)fail('Convite inválido para este e-mail.');
   if(await one('SELECT id FROM users WHERE email=?',email))fail('Este e-mail já está cadastrado. O administrador pode atribuir a função em Equipe e acessos.');
   const id=Number((await run('INSERT INTO users(email,name,password,role) VALUES(?,?,?,?)',email,str(b.name,'Nome',80),await password(b.password),'staff')).lastInsertRowid);
   await run('INSERT INTO team_members(user_id,granted_by,created) VALUES(?,?,?)',id,i.created_by,now());
   await run('INSERT INTO team_permissions(user_id,access_role) VALUES(?,?)',id,i.access_role);
   await run('DELETE FROM staff_invites WHERE token=?',i.token);await audit({id:i.created_by},'team.invite.accept',id);await login(res,id,req);json(res,{ok:true});return true;
  }
  return false;
 }
 async function route(req,res,path,method,u){
  if(path==='/api/team'&&method==='GET'){
   need(isAdmin(u));json(res,{members:await all("SELECT u.id,u.name,u.email,u.role,u.family_id,t.created,COALESCE(p.access_role,'operator') access_role FROM users u LEFT JOIN team_members t ON t.user_id=u.id LEFT JOIN team_permissions p ON p.user_id=u.id WHERE u.role='admin' OR t.user_id IS NOT NULL"),invites:await all('SELECT token,email,access_role,expires FROM staff_invites ORDER BY created DESC'),audit:await all('SELECT a.*,u.name FROM audit_log a JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100')});return true;
  }
  if(path==='/api/staff-invites'&&method==='POST'){
   need(isAdmin(u));const b=await body(req),email=str(b.email,'E-mail',150).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('E-mail inválido.');
   if(await one('SELECT id FROM users WHERE email=?',email))fail('Este usuário já existe. Altere sua função em Equipe e acessos.');
   const token=randomBytes(24).toString('hex'),expires=Date.now()+7*86400000;
   await run('INSERT INTO staff_invites(token,email,access_role,expires,created_by,created) VALUES(?,?,?,?,?,?)',hash(token),email,accessRole(b.accessRole),expires,u.id,now());await audit(u,'team.invite.create',email);json(res,{token,expires});return true;
  }
  if(path==='/api/staff-invites/revoke'&&method==='POST'){need(isAdmin(u));const b=await body(req);await run('DELETE FROM staff_invites WHERE token=?',str(b.id,'Convite',100));await audit(u,'team.invite.revoke',b.id);json(res,{ok:true});return true;}
  const team=path.match(/^\/api\/team\/(\d+)$/);
  if(team&&method==='POST'){
   need(isAdmin(u));const id=Number(team[1]),m=await one('SELECT * FROM users WHERE id=?',id),b=await body(req);
   if(!m||m.role==='admin')fail('O administrador inicial não pode ser alterado.');if(m.id===u.id)fail('Peça a outro administrador para alterar seu acesso.');
   if(m.role==='learner')fail('Acesso administrativo exige conta de adulto.');
   if(typeof b.enabled!=='boolean')fail('Informe a alteração de acesso.');
   if(b.enabled){const role=accessRole(b.accessRole??'operator');await run('INSERT INTO team_members(user_id,granted_by,created) VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING',id,u.id,now());await run('INSERT INTO team_permissions(user_id,access_role) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET access_role=excluded.access_role',id,role);}
   else {await run('DELETE FROM team_permissions WHERE user_id=?',id);await run('DELETE FROM team_members WHERE user_id=?',id);}
   await run('DELETE FROM sessions WHERE user_id=?',id);await audit(u,b.enabled?'team.grant':'team.revoke',id);if(b.enabled)await audit(u,'team.role.'+(b.accessRole??'operator'),id);json(res,{ok:true});return true;
  }
  if(path==='/api/benefits'&&method==='GET'){
   const fid=Number(new URL(req.url,'http://localhost').searchParams.get('familyId')||u.family_id);need(isTeam(u)||(u.role==='guardian'&&fid===u.family_id));await family(fid);json(res,{benefits:await getBenefits(fid)});return true;
  }
  if(path==='/api/benefits'&&method==='POST'){
   need(canFinance(u));const b=await body(req),f=await family(b.familyId);
   if(!['hours','discount'].includes(b.kind))fail('Benefício inválido.');
   const value=integer(b.value,'Valor',1,b.kind==='hours'?60000:10000000),reason=str(b.reason,'Motivo',150),code=b.kind==='hours'?randomBytes(12).toString('hex'):str(b.code,'Cupom',40).toUpperCase();
   if(!/^[A-Z0-9_-]+$/i.test(code))fail('Use letras, números, hífen ou sublinhado no cupom.');
   if(await one('SELECT code FROM benefits WHERE code=?',code))fail('Este código já existe.');
   const expiresOn=date(b.expiresOn||monthEnd(),'Validade');if(expiresOn<localDate())fail('A validade não pode estar no passado.');
   await run('INSERT INTO benefits(code,family_id,kind,value,period,reason,created_by,created) VALUES(?,?,?,?,?,?,?,?)',code,f.id,b.kind,value,period(),reason,u.id,now());await run('INSERT INTO benefit_terms(code,expires_on) VALUES(?,?)',code,expiresOn);
   await audit(u,'benefit.'+b.kind,code);json(res,{ok:true,code});return true;
  }
  if(path==='/api/payments/preview'&&method==='POST'){need(canFinance(u));const b=await body(req);json(res,await preview(b.familyId,b));return true;}
  if(path==='/api/payments'&&method==='POST'){
   need(canFinance(u));const b=await body(req),f=await family(b.familyId);let description=str(b.description,'Descrição',150),cents=integer(b.cents,'Valor recebido',0,10000000),q=null;
   const key=b.requestKey?requestKey(b):null;if(key&&await one('SELECT id FROM cash_entries WHERE request_key=?',key)){json(res,{ok:true,duplicate:true});return true;}
   if(b.gross!==undefined&&(b.coupon||b.waiver===true)){q=await preview(f.id,b);if(cents!==q.total)fail('O valor recebido diverge do resumo. Confira o desconto.');}
   else if(b.coupon||b.waiver===true)fail('Informe o valor original.');
   else if(!cents)fail('Para isenção total, informe o valor original e o motivo.');
   if(q?.coupon){description+=` · Cupom ${q.coupon}: R$ ${(q.discount/100).toFixed(2)}`;await run('UPDATE benefits SET used=1 WHERE code=?',q.coupon);await run('UPDATE benefit_terms SET redeemed_at=? WHERE code=?',now(),q.coupon);}
   if(b.waiver===true)description+=' · Isenção: '+str(b.reason,'Motivo',150);
   const entryDate=date(b.entryDate||localDate());if(entryDate>localDate())fail('Registre apenas recebimentos já realizados.');
   const id=Number((await run('INSERT INTO payments(family_id,description,cents,created) VALUES(?,?,?,?)',f.id,description,cents,now())).lastInsertRowid);
   const entryId=await addEntry({familyId:f.id,kind:'income',category:'membership',description,cents,entryDate,sourceKey:'payment:'+id,createdBy:u.id,key});
   await audit(u,'finance.payment.received',entryId);json(res,{ok:true,id});return true;
  }
  if(path==='/api/finance'&&method==='GET'){
   const url=new URL(req.url,'http://localhost'),scope=url.searchParams.get('scope')||(canFinance(u)?'club':'family');if(!['club','family'].includes(scope))fail('Área financeira inválida.');
   const fid=scope==='family'?ownFamily(u):null;if(scope==='club')need(canFinance(u));
   const from=date(url.searchParams.get('from')||period()+'-01'),to=date(url.searchParams.get('to')||monthEnd());if(from>to)fail('A data inicial deve anteceder a final.');
   let rows;
   if(scope==='club')rows=await all("SELECT c.*,f.name family_name,u.name author FROM cash_entries c LEFT JOIN families f ON f.id=c.family_id LEFT JOIN users u ON u.id=c.created_by WHERE c.scope='club' ORDER BY c.entry_date DESC,c.id DESC");
   else rows=await all("SELECT c.id,c.scope,c.family_id,c.created_by,CASE WHEN c.scope='club' THEN 'expense' ELSE c.kind END kind,c.category,c.description,c.cents,c.entry_date,c.source_key,c.created,c.voided_at,c.void_reason,CASE WHEN c.scope='club' OR (a.entry_id IS NOT NULL AND a.participant_id IS NULL AND a.user_id IS NULL) THEN 'family' ELSE COALESCE('p:' || a.participant_id,'u:' || a.user_id,'u:' || c.created_by,'family') END participant_key,CASE WHEN c.scope='club' OR (a.entry_id IS NOT NULL AND a.participant_id IS NULL AND a.user_id IS NULL) THEN 'Família' ELSE COALESCE(p.name,person.name,author.name,'Família') END participant_name FROM cash_entries c LEFT JOIN cash_attributions a ON a.entry_id=c.id LEFT JOIN participants p ON p.id=a.participant_id LEFT JOIN users person ON person.id=a.user_id LEFT JOIN users author ON author.id=c.created_by WHERE c.family_id=? AND (c.scope='family' OR (c.scope='club' AND c.kind='income')) ORDER BY c.entry_date DESC,c.id DESC",fid);
   const within=rows.filter(r=>r.entry_date>=from&&r.entry_date<=to),live=within.filter(r=>!r.voided_at),sum=kind=>live.filter(r=>r.kind===kind).reduce((n,r)=>n+r.cents,0);
   const income=sum('income'),expenses=sum('expense'),investments=sum('investment'),opening=rows.filter(r=>!r.voided_at&&r.entry_date<from).reduce((n,r)=>n+(r.kind==='expense'?-r.cents:r.cents),0);
   const people=scope==='family'?await all("SELECT 'u:' || id key,name,role FROM users WHERE family_id=? UNION ALL SELECT 'p:' || id key,name,'participant' role FROM participants WHERE family_id=?",fid,fid):[];
   json(res,{scope,from,to,entries:within.map(e=>({...e,canVoid:!e.voided_at&&(scope==='club'||(e.scope==='family'&&(u.role==='guardian'||e.created_by===u.id)))})),people,actorKey:'u:'+u.id,guardian:u.role==='guardian',totals:{income,expenses,investments,result:income-expenses,opening,closing:opening+income+investments-expenses},canEdit:true});return true;
  }
  if(path==='/api/finance/entries'&&method==='POST'){
   const b=await body(req),scope=b.scope;if(!['club','family'].includes(scope))fail('Área financeira inválida.');
   const fid=scope==='family'?ownFamily(u):null;if(scope==='club')need(canFinance(u));
   const key=requestKey(b);if(await one('SELECT id FROM cash_entries WHERE request_key=?',key)){json(res,{ok:true,duplicate:true});return true;}
   const kinds=scope==='club'?['income','expense','investment']:['income','expense'];if(!kinds.includes(b.kind))fail('Tipo inválido.');
   const categories=scope==='club'?{income:['other_income'],expense:['equipment','maintenance','rent','energy','services','other_expense'],investment:['capital']}:{income:['sales','allowance','gift','other_income'],expense:['supplies','shipping','purchase','other_expense']};
   if(!categories[b.kind].includes(b.category))fail('Categoria inválida. Pagamentos de participantes são registrados na família ou no projeto.');
   const entryDate=date(b.entryDate);if(entryDate>localDate())fail('Registre somente movimentações realizadas.');
   const id=await addEntry({scope,familyId:fid,kind:b.kind,category:b.category,description:str(b.description,'Descrição',200),cents:integer(b.cents,'Valor',1,100000000),entryDate,createdBy:u.id,key});if(scope==='family'){
    const key=u.role==='learner'?'u:'+u.id:(b.participantKey||'u:'+u.id);let participantId=null,userId=null;
    if(key!=='family'){
     const match=typeof key==='string'&&key.match(/^([up]):(\d+)$/);if(!match)fail('Participante inválido.');
     const target=await one('SELECT id FROM '+(match[1]==='p'?'participants':'users')+' WHERE id=? AND family_id=?',Number(match[2]),fid);need(Boolean(target));if(match[1]==='p')participantId=target.id;else userId=target.id;
    }
    await run('INSERT INTO cash_attributions(entry_id,participant_id,user_id) VALUES(?,?,?)',id,participantId,userId);
   }
   await audit(u,'finance.entry.create',id);json(res,{id});return true;
  }
  const voidEntry=path.match(/^\/api\/finance\/entries\/(\d+)\/void$/);
  if(voidEntry&&method==='POST'){
   const e=await one('SELECT * FROM cash_entries WHERE id=?',Number(voidEntry[1]));if(!e)fail('Lançamento não encontrado.',404);
   if(e.scope==='club')need(canFinance(u));else need(u.family_id===e.family_id&&(u.role==='guardian'||(u.role==='learner'&&e.created_by===u.id)));
   if(e.voided_at)fail('Este lançamento já foi estornado.');
   const stock=await one('SELECT s.id FROM stock_lots s WHERE s.entry_id=?',e.id);if(stock&&await one('SELECT id FROM stock_uses WHERE lot_id=?',stock.id))fail('Este filamento já teve baixa. Registre um ajuste financeiro separado para preservar o estoque.');
   const b=await body(req);await run('UPDATE cash_entries SET voided_at=?,void_reason=? WHERE id=?',now(),str(b.reason,'Motivo do estorno',200),e.id);
   if(e.source_key?.startsWith('project:')){await run('UPDATE projects SET paid=0 WHERE id=?',Number(e.source_key.slice(8)));await run('UPDATE cash_entries SET source_key=? WHERE id=?',e.source_key+':void:'+e.id,e.id);}
   await audit(u,'finance.entry.void',e.id);json(res,{ok:true});return true;
  }
  if(path==='/api/stock'&&method==='GET'){
   need(canFinance(u)||canOperate(u));const lots=await all("SELECT s.*,c.cents,c.entry_date,COALESCE((SELECT SUM(grams) FROM stock_uses x WHERE x.lot_id=s.id),0) used_grams FROM stock_lots s JOIN cash_entries c ON c.id=s.entry_id WHERE c.voided_at IS NULL ORDER BY c.entry_date,s.id");
   const visible=lots.map(l=>{const remaining=l.grams-Number(l.used_grams),{cents,...rest}=l;return {...rest,remaining,...(canFinance(u)?{cents,costPerKg:Math.round(cents*1000/l.grams),remainingValue:Math.round(cents*remaining/l.grams)}:{})};});
   json(res,{lots:visible,uses:await all('SELECT x.*,u.name author FROM stock_uses x JOIN users u ON u.id=x.created_by ORDER BY x.id DESC LIMIT 100'),canBuy:canFinance(u),totals:{grams:visible.reduce((n,l)=>n+l.remaining,0),...(canFinance(u)?{value:visible.reduce((n,l)=>n+l.remainingValue,0)}:{})}});return true;
  }
  if(path==='/api/stock/purchases'&&method==='POST'){
   need(canFinance(u));const b=await body(req),key=requestKey(b);if(await one('SELECT id FROM cash_entries WHERE request_key=?',key)){json(res,{ok:true,duplicate:true});return true;}
   const material=str(b.material,'Material',60),color=str(b.color,'Cor',60),grams=integer(b.grams,'Peso em gramas',1,1000000),supplier=b.supplier?str(b.supplier,'Fornecedor',100):'',entryDate=date(b.entryDate);if(entryDate>localDate())fail('Informe uma compra já realizada.');
   const entryId=await addEntry({kind:'expense',category:'filament',description:`Filamento ${material} · ${color} · ${grams} g${supplier?' · '+supplier:''}`,cents:integer(b.cents,'Valor pago',0,100000000),entryDate,createdBy:u.id,key});
   const id=Number((await run('INSERT INTO stock_lots(entry_id,material,color,supplier,grams) VALUES(?,?,?,?,?)',entryId,material,color,supplier,grams)).lastInsertRowid);await audit(u,'stock.purchase',id);json(res,{id,entryId});return true;
  }
  if(path==='/api/stock/use'&&method==='POST'){
   need(canFinance(u)||canOperate(u));const b=await body(req),key=requestKey(b);if(await one('SELECT id FROM stock_uses WHERE request_key=?',key)){json(res,{ok:true,duplicate:true});return true;}
   const lot=await one('SELECT s.*,c.voided_at FROM stock_lots s JOIN cash_entries c ON c.id=s.entry_id WHERE s.id=?',integer(b.lotId,'Lote',1,2147483647));if(!lot||lot.voided_at)fail('Lote indisponível.');const grams=integer(b.grams,'Gramas consumidos',1,1000000),used=Number((await one('SELECT COALESCE(SUM(grams),0) n FROM stock_uses WHERE lot_id=?',lot.id)).n);if(grams>lot.grams-used)fail('A baixa excede o saldo deste lote.');
   const id=Number((await run('INSERT INTO stock_uses(lot_id,grams,reason,created_by,created,request_key) VALUES(?,?,?,?,?,?)',lot.id,grams,str(b.reason,'Motivo ou projeto',200),u.id,now(),key)).lastInsertRowid);await audit(u,'stock.use',id);json(res,{id});return true;
  }
  return false;
 }
 return {route,publicRoute,backfill,recordProject,getBenefits};
}
