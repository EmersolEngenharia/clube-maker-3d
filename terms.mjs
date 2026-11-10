import {readFileSync} from 'node:fs';
import {isAdmin} from './permissions.mjs';
// Regulamento do clube. The admin edits a draft and publishes it as a numbered version; each published version
// must be accepted by a guardian of the family before it books or approves anything that costs money.
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
export const guardianLike=u=>Boolean(u)&&(u.role==='guardian'||(u.role==='admin'&&Boolean(u.family_id)));
export function draftText(cfg){
 const text=readFileSync(new URL('./db/regulamento-proposta.md',import.meta.url),'utf8');
 return text.replaceAll('{mensalidade}',money(cfg.monthly)).replaceAll('{anuidade}',money(cfg.annual)).replaceAll('{horas}',String(cfg.hours).replace('.',',')).replaceAll('{hora_extra}',money(cfg.extra)).replaceAll('{acrescimo}',String(cfg.markup).replace('.',','));
}
export function createTerms({db,fail,str,body,json,config,broadcasts,clock=()=>new Date(),env=process.env}){
 const one=(q,...a)=>db.one(q,...a),all=(q,...a)=>db.all(q,...a),run=(q,...a)=>db.run(q,...a),stamp=()=>clock().toISOString();
 const current=()=>one('SELECT version,title,body,published_at FROM terms_versions WHERE published_at IS NOT NULL ORDER BY version DESC LIMIT 1');
 const view=v=>v?{version:v.version,title:v.title,body:v.body,publishedAt:v.published_at}:null;
 async function familyAccepted(fid,version){return Boolean(fid)&&Boolean(await one('SELECT user_id FROM terms_acceptances WHERE version=? AND family_id=? LIMIT 1',version,fid));}
 // Called before booking and before approving a quote. Nothing is blocked while no version was published.
 async function require(fid){const c=await current();if(!c||!fid)return;if(!await familyAccepted(fid,c.version))fail('O responsável da família precisa aceitar o regulamento atual do clube no portal (menu Regulamento) antes de continuar.',403);}
 async function flag(u){if(!u?.family_id)return null;const c=await current();if(!c)return null;const mine=await one('SELECT accepted_at FROM terms_acceptances WHERE version=? AND user_id=?',c.version,u.id);const family=Boolean(mine)||await familyAccepted(u.family_id,c.version);return {version:c.version,mustAccept:guardianLike(u)&&!mine,familyAccepted:family};}
 // A first draft built from the rules the portal already applies. It is never published on its own.
 async function seed(){if(await one('SELECT version FROM terms_versions LIMIT 1'))return;await run('INSERT INTO terms_versions(version,title,body,created,updated) VALUES(1,?,?,?,?)','Regulamento do Clube Maker 3D Emersol',draftText(await config()),stamp(),stamp());}
 const draft=()=>one('SELECT version,title,body,updated FROM terms_versions WHERE published_at IS NULL ORDER BY version DESC LIMIT 1');
 async function admin(){
  const c=await current(),d=await draft();
  const versions=await all('SELECT v.version,v.title,v.published_at,u.name published_by,(SELECT COUNT(*) FROM terms_acceptances a WHERE a.version=v.version) accepted FROM terms_versions v LEFT JOIN users u ON u.id=v.published_by WHERE v.published_at IS NOT NULL ORDER BY v.version DESC');
  const families=c?await all('SELECT f.id,f.name,(SELECT a.name FROM terms_acceptances a WHERE a.family_id=f.id AND a.version=? ORDER BY a.accepted_at LIMIT 1) accepted_by,(SELECT MIN(a.accepted_at) FROM terms_acceptances a WHERE a.family_id=f.id AND a.version=?) accepted_at FROM families f ORDER BY f.name',c.version,c.version):[];
  return {current:view(c),draft:d?{version:d.version,title:d.title,body:d.body,updated:d.updated}:null,versions:versions.map(v=>({...v,accepted:Number(v.accepted)})),families:families.map(f=>({id:f.id,name:f.name,acceptedBy:f.accepted_by||null,acceptedAt:f.accepted_at||null}))};
 }
 async function route(req,res,path,method,u){
  if(!path.startsWith('/api/terms'))return false;
  if(path==='/api/terms'&&method==='GET'){json(res,{current:view(await current()),...(await flag(u)||{mustAccept:false,familyAccepted:false}),canManage:isAdmin(u)});return true;}
  if(path==='/api/terms/admin'&&method==='GET'){if(!isAdmin(u))fail('Ação exclusiva da administração.',403);json(res,await admin());return true;}
  if(method!=='POST')return false;
  const b=await body(req);
  if(path==='/api/terms/accept'){
   if(!guardianLike(u))fail('Somente o responsável da família aceita o regulamento.',403);
   const c=await current();if(!c)fail('Ainda não há regulamento publicado.',409);
   if(b.version!==c.version)fail('O regulamento foi atualizado. Reabra a página e leia a versão atual.',409);
   if(b.confirmed!==true)fail('Marque que leu e aceita o regulamento.');
   await run('INSERT INTO terms_acceptances(version,user_id,family_id,name,accepted_at) VALUES(?,?,?,?,?) ON CONFLICT(version,user_id) DO NOTHING',c.version,u.id,u.family_id,u.name,stamp());
   await run('INSERT INTO audit_log(user_id,action,target,created) VALUES(?,?,?,?)',u.id,'terms.accept','v'+c.version,stamp());
   json(res,{ok:true,version:c.version});return true;
  }
  if(!isAdmin(u))fail('Ação exclusiva da administração.',403);
  if(path==='/api/terms/draft'){
   const title=str(b.title,'Título',150),text=typeof b.body==='string'?b.body.replace(/\r\n/g,'\n').trim():'';if(text.length<50||text.length>40000)fail('Escreva o regulamento (entre 50 e 40.000 caracteres).');
   const d=await draft();
   if(d)await run('UPDATE terms_versions SET title=?,body=?,updated=? WHERE version=?',title,text,stamp(),d.version);
   else{const next=Number((await one('SELECT COALESCE(MAX(version),0) n FROM terms_versions')).n)+1;await run('INSERT INTO terms_versions(version,title,body,created,updated) VALUES(?,?,?,?,?)',next,title,text,stamp(),stamp());}
   await run('INSERT INTO audit_log(user_id,action,target,created) VALUES(?,?,?,?)',u.id,'terms.draft','draft',stamp());json(res,{ok:true});return true;
  }
  if(path==='/api/terms/publish'){
   if(b.confirmed!==true)fail('Confirme a publicação: todas as famílias vão precisar aceitar de novo.');
   const d=await draft();if(!d)fail('Não há rascunho para publicar.',409);
   await run('UPDATE terms_versions SET published_at=?,published_by=?,updated=? WHERE version=?',stamp(),u.id,stamp(),d.version);
   await run('INSERT INTO audit_log(user_id,action,target,created) VALUES(?,?,?,?)',u.id,'terms.publish','v'+d.version,stamp());
   let told=0;
   for(const f of await all('SELECT id FROM families ORDER BY id')){try{told+=(await broadcasts.notifyFamily({authorId:u.id,familyId:f.id,text:`Olá, {nome}! O regulamento do Clube Maker 3D ${d.version>1?'foi atualizado':'foi publicado'} (versão ${d.version}). Para continuar agendando e aprovando impressões, leia e aceite no portal: ${env.PUBLIC_ORIGIN||'https://maker3d.emersol.ai'}/?regulamento=1`})).queued||0;}catch{console.error('Falha ao avisar família sobre o regulamento.');}}
   json(res,{ok:true,version:d.version,notified:told});return true;
  }
  return false;
 }
 return {route,require,flag,seed};
}
