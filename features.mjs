import {randomBytes,createHash} from 'node:crypto';
import {extname} from 'node:path';

export const isTeam=u=>u?.role==='admin'||Boolean(u?.is_staff);
export const themes=['atelier','ocean','candy','space','contrast'];
export const avatars=['robot','rocket','cat','dino','astronaut','flower','cube','star'];
const hash=s=>createHash('sha256').update(s).digest('hex');
const now=()=>new Date().toISOString();

export function createFeatures({db,storage,fail,str,integer,body,json,config,password,creds,login}){
 const one=(q,...p)=>db.one(q,...p),all=(q,...p)=>db.all(q,...p),run=(q,...p)=>db.run(q,...p);
 const need=(condition,message='Você não tem permissão para esta ação.')=>{if(!condition)fail(message,403);};
 const audit=(u,action,target)=>run('INSERT INTO audit_log(user_id,action,target,created) VALUES(?,?,?,?)',u.id,action,String(target),now());
 const optional=(v,label,max)=>v==null||v===''?'':str(v,label,max);
 async function familyAccess(id,u){need(isTeam(u)||(u.role==='guardian'&&u.family_id===id));const f=await one('SELECT * FROM families WHERE id=?',id);if(!f)fail('Família não encontrada.',404);return f;}
 function preference(b){
  const theme=b.theme??'atelier',avatar=b.avatar??'robot',experience=b.experience??'guided';
  if(!themes.includes(theme)||!avatars.includes(avatar)||!['guided','compact'].includes(experience))fail('Preferências inválidas.');
  return {theme,avatar,experience};
 }
 async function savePreference(id,b){const p=preference(b);await run('INSERT INTO user_preferences(user_id,theme,avatar,experience) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET theme=excluded.theme,avatar=excluded.avatar,experience=excluded.experience',id,p.theme,p.avatar,p.experience);}
 function media(b,photo=false){
  const name=str(b.name,'Arquivo',150),ext=extname(name).toLowerCase();
  if(typeof b.data!=='string'||!b.data||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data))fail('Arquivo inválido.');
  const bytes=Buffer.from(b.data,'base64'),max=photo?2:10;
  if(!bytes.length||bytes.length>max*1024*1024)fail(`Envie um arquivo de até ${max} MB.`);
  let mime;
  if(ext==='.png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
  if(['.jpg','.jpeg'].includes(ext)&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
  if(ext==='.webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')mime='image/webp';
  if(!photo&&ext==='.mp4'&&bytes.toString('ascii',4,8)==='ftyp')mime='video/mp4';
  if(!photo&&ext==='.webm'&&bytes.subarray(0,4).equals(Buffer.from([26,69,223,163])))mime='video/webm';
  if(!mime)fail(photo?'Use uma foto PNG, JPG ou WebP válida.':'Use PNG, JPG, WebP, MP4 ou WebM válido.');
  return {name,bytes,mime};
 }
 async function getPost(id,u){const p=await one('SELECT * FROM posts WHERE id=?',id);if(!p||!(isTeam(u)||p.user_id===u.id||(u.role==='guardian'&&p.family_id===u.family_id)))fail('Publicação não encontrada.',404);return p;}
 const editable=(p,u)=>p.user_id===u.id||(u.role==='guardian'&&p.family_id===u.family_id);
 function postFields(b){
  const title=optional(b.title,'Título',100)||'Minha criação',text=optional(b.body,'Texto',4000),d=b.details??{};
  if(!d||typeof d!=='object'||Array.isArray(d))fail('Campos opcionais inválidos.');
  const details={};for(const [key,max]of Object.entries({product:120,caption:2000,audience:200,callToAction:200,notes:1000}))details[key]=optional(d[key],key,max);
  details.channels=d.channels??[];if(!Array.isArray(details.channels)||details.channels.some(v=>!['Instagram','Facebook','TikTok','YouTube','WhatsApp'].includes(v)))fail('Rede social inválida.');
  details.priceCents=d.priceCents==null?null:integer(d.priceCents,'Preço',0,100000000);
  return {title,text,details:JSON.stringify(details)};
 }
 async function publicRoute(req,res,path,method){
  if(path==='/api/enrollment'&&method==='GET'){
   const token=new URL(req.url,'http://localhost').searchParams.get('token')||'';
   const inv=await one('SELECT label,expires,max_uses,uses FROM enrollment_invites WHERE token=?',hash(token));
   if(!inv||Number(inv.expires)<Date.now()||inv.uses>=inv.max_uses)fail('Este convite expirou, foi encerrado ou atingiu o limite de inscrições.',410);
   const c=await config();json(res,{label:inv.label,expires:inv.expires,monthly:c.monthly,annual:c.annual,hours:c.hours,extra:c.extra,markup:c.markup});return true;
  }
  if(path==='/api/enroll'&&method==='POST'){
   const b=await body(req),email=creds(b),name=str(b.name,'Nome',80),familyName=str(b.familyName,'Família',80);preference(b);
   if(b.responsible!==true)fail('O cadastro da família deve ser feito pelo responsável adulto.');
   if(!['monthly','annual'].includes(b.plan))fail('Plano inválido.');
   const inv=await one('SELECT * FROM enrollment_invites WHERE token=? AND expires>?',hash(str(b.token,'Convite',150)),Date.now());
   if(!inv||inv.uses>=inv.max_uses)fail('Convite indisponível.',410);
   if(await one('SELECT id FROM users WHERE email=?',email))fail('Este e-mail já está cadastrado.');
   if(Number((await one('SELECT COUNT(*) n FROM families')).n)>=10)fail('Todas as 10 vagas do piloto estão ocupadas. Fale com a equipe.');
   const c=await config(),fid=Number((await run('INSERT INTO families(name,plan,allowance,created) VALUES(?,?,?,?)',familyName,b.plan,Math.round(c.hours*60),now())).lastInsertRowid);
   const id=Number((await run('INSERT INTO users(email,name,password,role,family_id) VALUES(?,?,?,?,?)',email,name,await password(b.password),'guardian',fid)).lastInsertRowid);
   await savePreference(id,b);await run('UPDATE enrollment_invites SET uses=uses+1 WHERE token=?',inv.token);await login(res,id,req);json(res,{ok:true});return true;
  }
  return false;
 }
 async function route(req,res,path,method,u){
  if(path==='/api/profile'&&method==='POST'){
   const b=await body(req);await savePreference(u.id,b);await run('UPDATE users SET name=? WHERE id=?',str(b.name,'Nome',80),u.id);
   if(b.removePhoto===true)await run('UPDATE user_preferences SET photo_key=NULL,photo_mime=NULL WHERE user_id=?',u.id);
   json(res,{ok:true});return true;
  }
  if(path==='/api/profile/photo'&&method==='POST'){
   const m=media(await body(req),true),key=randomBytes(24).toString('hex');await storage.put(key,m.bytes);
   try{await run('INSERT INTO user_preferences(user_id,photo_key,photo_mime) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET photo_key=excluded.photo_key,photo_mime=excluded.photo_mime',u.id,key,m.mime);}catch(e){await storage.remove(key);throw e;}
   json(res,{ok:true});return true;
  }
  const photo=path.match(/^\/api\/avatars\/(\d+)$/);
  if(photo&&method==='GET'){
   const owner=await one('SELECT u.id,u.family_id,p.photo_key,p.photo_mime FROM users u JOIN user_preferences p ON p.user_id=u.id WHERE u.id=?',Number(photo[1]));
   if(!owner||!owner.photo_key||!(owner.id===u.id||isTeam(u)||(u.family_id&&owner.family_id===u.family_id)))fail('Foto não encontrada.',404);
   const bytes=await storage.get(owner.photo_key);res.writeHead(200,{'Content-Type':owner.photo_mime});res.end(bytes);return true;
  }
  const fam=path.match(/^\/api\/families\/(\d+)\/edit$/);
  if(fam&&method==='POST'){
   const id=Number(fam[1]),f=await familyAccess(id,u),b=await body(req);let plan=f.plan,allowance=f.allowance;
   if(isTeam(u)){if(!['monthly','annual'].includes(b.plan))fail('Plano inválido.');plan=b.plan;allowance=integer(b.allowance,'Franquia em minutos',0,60000);
    const usage=await all("SELECT period,SUM(CASE WHEN status IN ('queued','printing') THEN included WHEN status IN ('ready','completed') THEN used ELSE 0 END) committed FROM projects WHERE family_id=? GROUP BY period",id);
    const {period}=await import('./domain.mjs');if(allowance<Number(usage.find(x=>x.period===period())?.committed||0))fail('A franquia não pode ficar abaixo das horas já usadas e reservadas neste mês.');
   }
   await run('UPDATE families SET name=?,plan=?,allowance=? WHERE id=?',str(b.name,'Família',80),plan,allowance,id);await audit(u,'family.edit',id);json(res,{ok:true});return true;
  }
  if(path==='/api/dependents'&&method==='POST'){
   const b=await body(req),fid=integer(b.familyId,'Família',1,2147483647);await familyAccess(fid,u);
   const name=str(b.name,'Nome',80),age=b.ageGroup??'unspecified',notes=optional(b.notes,'Observações',500),active=b.active===false?0:1;
   if(!['child','teen','adult','unspecified'].includes(age))fail('Faixa etária inválida.');let id=b.id;
   if(id){const p=await one('SELECT * FROM participants WHERE id=?',integer(id,'Participante',1,2147483647));if(!p||p.family_id!==fid)fail('Participante não encontrado.',404);await run('UPDATE participants SET name=? WHERE id=?',name,id);}
   else{if(Number((await one('SELECT COUNT(*) n FROM participants WHERE family_id=?',fid)).n)>=20)fail('Limite de 20 participantes por família.');id=Number((await run('INSERT INTO participants(family_id,name) VALUES(?,?)',fid,name)).lastInsertRowid);}
   await run('INSERT INTO participant_settings(participant_id,age_group,notes,active) VALUES(?,?,?,?) ON CONFLICT(participant_id) DO UPDATE SET age_group=excluded.age_group,notes=excluded.notes,active=excluded.active',id,age,notes,active);
   await audit(u,'dependent.edit',id);json(res,{id});return true;
  }
  if(path==='/api/team'&&method==='GET'){
   need(u.role==='admin');json(res,{members:await all('SELECT u.id,u.name,u.email,u.role,u.family_id,t.created FROM users u LEFT JOIN team_members t ON t.user_id=u.id WHERE u.role=? OR t.user_id IS NOT NULL','admin'),audit:await all('SELECT a.*,u.name FROM audit_log a JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 50')});return true;
  }
  const member=path.match(/^\/api\/members\/(\d+)$/);
  if(member&&method==='POST'){
   need(u.role==='admin');const id=Number(member[1]),b=await body(req),m=await one('SELECT * FROM users WHERE id=?',id);if(!m)fail('Membro não encontrado.',404);
   await run('UPDATE users SET name=? WHERE id=?',str(b.name,'Nome',80),id);await audit(u,'member.rename',id);json(res,{ok:true});return true;
  }
  const team=path.match(/^\/api\/team\/(\d+)$/);
  if(team&&method==='POST'){
   need(u.role==='admin');const id=Number(team[1]),b=await body(req),m=await one('SELECT * FROM users WHERE id=?',id);if(!m||m.role==='admin')fail('Escolha um participante da família.');
   if(typeof b.enabled!=='boolean')fail('Informe a alteração de acesso.');
   if(b.enabled)await run('INSERT INTO team_members(user_id,granted_by,created) VALUES(?,?,?) ON CONFLICT(user_id) DO NOTHING',id,u.id,now());else await run('DELETE FROM team_members WHERE user_id=?',id);
   await run('DELETE FROM sessions WHERE user_id=?',id);await audit(u,b.enabled?'team.grant':'team.revoke',id);json(res,{ok:true});return true;
  }
  if(path==='/api/enrollment-invites'&&method==='GET'){need(isTeam(u));json(res,{invites:await all('SELECT token,label,expires,max_uses,uses,created FROM enrollment_invites ORDER BY created DESC LIMIT 50')});return true;}
  if(path==='/api/enrollment-invites'&&method==='POST'){
   need(isTeam(u));const b=await body(req),token=randomBytes(24).toString('hex'),expires=Date.now()+integer(b.days??7,'Validade',1,30)*86400000;
   await run('INSERT INTO enrollment_invites(token,label,expires,max_uses,created) VALUES(?,?,?,?,?)',hash(token),str(b.label,'Nome do convite',100),expires,integer(b.maxUses??1,'Vagas',1,10),now());await audit(u,'invite.create',hash(token));json(res,{token,expires});return true;
  }
  if(path==='/api/enrollment-invites/revoke'&&method==='POST'){need(isTeam(u));const b=await body(req);await run('UPDATE enrollment_invites SET expires=0 WHERE token=?',str(b.id,'Convite',100));await audit(u,'invite.revoke',b.id);json(res,{ok:true});return true;}
  if(path==='/api/posts'&&method==='GET'){
   const url=new URL(req.url,'http://localhost'),before=Number(url.searchParams.get('before')||2147483647);integer(before,'Página',1,2147483647);
   const where=isTeam(u)?'':u.role==='guardian'?' AND (p.family_id=? OR p.user_id=?)':' AND p.user_id=?';
   const args=isTeam(u)?[]:u.role==='guardian'?[u.family_id,u.id]:[u.id];
   const posts=await all(`SELECT p.*,u.name author FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id<?${where} ORDER BY p.id DESC LIMIT 21`,before,...args);
   const more=posts.length>20;posts.splice(20);json(res,{posts:posts.map(p=>({...p,details:JSON.parse(p.details)})),next:more?posts.at(-1).id:null});return true;
  }
  if(path==='/api/posts'&&method==='POST'){
   const b=await body(req),p=postFields(b);const id=Number((await run('INSERT INTO posts(user_id,family_id,title,body,details,created,updated) VALUES(?,?,?,?,?,?,?)',u.id,u.family_id,p.title,p.text,p.details,now(),now())).lastInsertRowid);json(res,{id});return true;
  }
  const post=path.match(/^\/api\/posts\/(\d+)(?:\/(\w+))?$/);
  if(post){
   const id=Number(post[1]),action=post[2],p=await getPost(id,u);
   if(!action&&method==='GET'){json(res,{...p,details:JSON.parse(p.details),media:await all('SELECT id,name,mime,size FROM post_media WHERE post_id=? ORDER BY id',id)});return true;}
   if(method!=='POST')return false;const b=await body(req);
   if(action==='edit'){need(editable(p,u));const fields=postFields(b);await run("UPDATE posts SET title=?,body=?,details=?,status='draft',consent_by=NULL,review_note='',updated=? WHERE id=?",fields.title,fields.text,fields.details,now(),id);}
   else if(action==='media'){
    need(editable(p,u));if(p.status!=='draft')fail('Volte a publicação para rascunho antes de alterar os arquivos.');
    if(Number((await one('SELECT COUNT(*) n FROM post_media WHERE post_id=?',id)).n)>=5)fail('Limite de cinco arquivos por publicação.');const m=media(b),key=randomBytes(24).toString('hex');await storage.put(key,m.bytes);
    try{await run('INSERT INTO post_media(post_id,name,path,mime,size) VALUES(?,?,?,?,?)',id,m.name,key,m.mime,m.bytes.length);}catch(e){await storage.remove(key);throw e;}
   }
   else if(action==='remove'){need(editable(p,u));if(p.status!=='draft')fail('Volte a publicação para rascunho antes de remover arquivos.');await run('DELETE FROM post_media WHERE id=? AND post_id=?',integer(b.mediaId,'Arquivo',1,2147483647),id);}
   else if(action==='submit'){
    need(editable(p,u));if(p.status!=='draft')fail('Este conteúdo já foi enviado.');if(!p.body&&!(await one('SELECT id FROM post_media WHERE post_id=?',id)))fail('Adicione um texto, foto ou vídeo antes de enviar.');
    const learner=u.role==='learner';if(!learner&&b.consent!==true)fail('Confirme a autorização de uso deste conteúdo.');
    await run('UPDATE posts SET status=?,consent_by=?,updated=? WHERE id=?',learner?'guardian':'review',learner?null:u.id,now(),id);
   }
   else if(action==='authorize'){need(u.role==='guardian'&&u.family_id===p.family_id);if(p.status!=='guardian'||b.consent!==true)fail('Confira o conteúdo e autorize seu uso.');await run("UPDATE posts SET status='review',consent_by=?,updated=? WHERE id=?",u.id,now(),id);}
   else if(action==='approve'){need(isTeam(u));if(p.status!=='review'||!p.consent_by)fail('A publicação precisa de autorização e revisão.');await run("UPDATE posts SET status='approved',review_note=?,updated=? WHERE id=?",optional(b.note,'Orientação',1000),now(),id);}
   else if(action==='return'){need(isTeam(u)||editable(p,u));await run("UPDATE posts SET status='draft',consent_by=NULL,review_note=?,updated=? WHERE id=?",optional(b.note,'Orientação',1000),now(),id);}
   else return false;
   await audit(u,'post.'+action,id);json(res,{ok:true});return true;
  }
  const file=path.match(/^\/api\/post-media\/(\d+)$/);
  if(file&&method==='GET'){
   const f=await one('SELECT * FROM post_media WHERE id=?',Number(file[1]));if(!f)fail('Arquivo não encontrado.',404);await getPost(f.post_id,u);const bytes=await storage.get(f.path);
   // Range support lets browsers seek short videos without a second public URL.
   let start=0,end=bytes.length-1,status=200;const range=req.headers.range;
   if(range){const m=range.match(/^bytes=(\d+)-(\d*)$/);if(!m){res.writeHead(416,{'Content-Range':`bytes */${bytes.length}`});res.end();return true;}start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;if(start>end){res.writeHead(416,{'Content-Range':`bytes */${bytes.length}`});res.end();return true;}status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`);}
   res.writeHead(status,{'Content-Type':f.mime,'Accept-Ranges':'bytes','Content-Length':end-start+1,'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(f.name).replace(/'/g,'%27')}`});res.end(bytes.subarray(start,end+1));return true;
  }
  return false;
 }
 return {route,publicRoute,savePreference};
}
