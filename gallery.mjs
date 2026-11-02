// Vitrine do clube: pieces already printed by the club or tested by the team. Like the link orders, it keeps
// only the link, the details and photos; the model file stays on the original site.
import {randomBytes} from 'node:crypto';
import {canOperate} from './permissions.mjs';
import {mediaType} from './messaging/broadcasts.mjs';
import {parseModelLink,licenseLevel} from './models.mjs';

export const collections=['Para presentear','Úteis em casa','Brinquedos e articulados','Projetos de escola','Natal no clube'];
const now=()=>new Date().toISOString();

export function createGallery({db,storage,fail,str,integer,num,body,json,event,modelInfo}){
 const one=(q,...p)=>db.one(q,...p),all=(q,...p)=>db.all(q,...p),run=(q,...p)=>db.run(q,...p);
 const optional=(v,label,max)=>v==null||(typeof v==='string'&&!v.trim())?null:str(v,label,max);
 const firstName=s=>String(s||'').trim().split(/\s+/)[0].slice(0,40)||null;
 const operator=u=>{if(!canOperate(u))fail('Somente a equipe organiza a vitrine.',403);};
 function photo(v){
  if(v==null)return null;
  if(typeof v!=='object'||typeof v.data!=='string'||!v.data||!/^[A-Za-z0-9+/]*={0,2}$/.test(v.data))fail('Foto inválida.');
  const bytes=Buffer.from(v.data,'base64'),type=mediaType(bytes);
  if(!bytes.length||bytes.length>8*1024*1024)fail('A foto deve ter até 8 MB.');if(type?.kind!=='image')fail('Envie uma foto JPG, PNG ou WebP.');
  return {bytes,mime:type.mime};
 }
 async function keep(prefix,image){if(!image)return null;const key=prefix+'-'+randomBytes(24).toString('hex');await storage.put(key,image.bytes);return key;}
 async function copy(key){return key?keep('gallery',{bytes:await storage.get(key)}):null;}
 async function item(id){const g=await one('SELECT g.*,p.family_id,p.participant FROM gallery_items g LEFT JOIN projects p ON p.id=g.project_id WHERE g.id=?',id);if(!g)fail('Peça não encontrada na vitrine.',404);return g;}
 // Families see published pieces and the pieces of their own projects, so the guardian can authorize them.
 const allowed=(g,u)=>g.status==='published'||canOperate(u)||(u.role==='guardian'&&g.family_id!=null&&g.family_id===u.family_id);
 const view=(g,u)=>({id:g.id,status:g.status,title:g.title,collection:g.collection,note:g.note,site:g.site,url:g.url,author:g.author,license:g.license,license_level:licenseLevel(g.license),license_checked:!!g.license_checked_at,has_photo:!!g.photo_key,has_site_image:!!g.site_image_key,minutes:g.minutes,grams:g.grams,material:g.material,size:g.size,maker:g.maker,from_club:g.project_id!=null,own:g.family_id!=null&&g.family_id===u.family_id,participant:g.family_id!=null&&(canOperate(u)||g.family_id===u.family_id)?g.participant:null,project_id:canOperate(u)||g.family_id===u.family_id?g.project_id:null,created:g.created});
 async function remove(...keys){for(const k of keys)if(k)await storage.remove(k).catch(()=>{});}

 async function create(u,b){
  operator(u);const collection=str(b.collection,'Coleção',40),note=optional(b.note,'Comentário da equipe',500),image=photo(b.photo);
  if(b.projectId!=null){
   const p=await one('SELECT * FROM projects WHERE id=?',Number(b.projectId));if(!p)fail('Projeto não encontrado.',404);
   if(!['ready','completed'].includes(p.status))fail('Só peças já impressas vão para a vitrine.');
   if(await one('SELECT id FROM gallery_items WHERE project_id=?',p.id))fail('Esta peça já está na vitrine.',409);
   const m=await one('SELECT * FROM model_links WHERE project_id=?',p.id);if(!image&&!m?.image_key)fail('Envie uma foto da peça pronta.');
   const photoKey=await keep('gallery',image),siteKey=await copy(m?.image_key);
   try{const id=Number((await run("INSERT INTO gallery_items(project_id,status,title,collection,note,site,url,author,license,license_checked_by,license_checked_at,site_image_key,site_image_mime,photo_key,photo_mime,minutes,grams,material,size,created_by,created,updated) VALUES(?,'pending',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",p.id,optional(b.title,'Nome da peça',200)||m?.title||p.name,collection,note,m?.site??null,m?.url??null,m?.author??null,m?.license??null,m?.license_checked_by??null,m?.license_checked_at??null,siteKey,siteKey?m.image_mime:null,photoKey,image?.mime??null,p.actual_minutes??p.minutes??null,p.actual_grams??p.grams??null,p.material||null,p.size,u.id,now(),now())).lastInsertRowid);
    await event(p.id,'A equipe quer mostrar esta peça na vitrine do clube. Aguardando a autorização do responsável.');return id;}
   catch(e){await remove(photoKey,siteKey);throw e;}
  }
  // A piece picked by the team: the details come from the server-side lookup cache, never from the browser.
  const link=parseModelLink(b.url),info=modelInfo(link.url),title=str(b.title,'Nome da peça',200);
  const minutes=b.minutes==null||b.minutes===''?null:integer(b.minutes,'Tempo de impressão',1,10000),grams=b.grams==null||b.grams===''?null:num(b.grams,'Material',0.1,10000);
  const photoKey=await keep('gallery',image),siteKey=await keep('gallery',info?.image);
  try{return Number((await run("INSERT INTO gallery_items(status,title,collection,note,site,url,author,license,license_checked_by,license_checked_at,site_image_key,site_image_mime,photo_key,photo_mime,minutes,grams,material,size,created_by,created,updated) VALUES('published',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",title,collection,note,link.site,link.url,info?.author??null,info?.license??null,b.licenseChecked===true?u.id:null,b.licenseChecked===true?now():null,siteKey,siteKey?info.image.mime:null,photoKey,image?.mime??null,minutes,grams,optional(b.material,'Material',40),optional(b.size,'Tamanho',100),u.id,now(),now())).lastInsertRowid);}
  catch(e){await remove(photoKey,siteKey);throw e;}
 }

 async function action(u,g,name,b){
  if(name==='authorize'){
   if(u.role!=='guardian'||g.family_id==null||g.family_id!==u.family_id)fail('Somente o responsável desta família autoriza a vitrine.',403);
   if(b.allow===true){if(!['pending','declined'].includes(g.status))fail('Esta peça já está autorizada.',409);
    await run("UPDATE gallery_items SET status='published',maker=?,authorized_by=?,authorized_at=?,updated=? WHERE id=?",b.showName===true?firstName(g.participant):null,u.id,now(),now(),g.id);await event(g.project_id,b.showName===true?'Responsável autorizou a peça na vitrine do clube, com o primeiro nome do participante.':'Responsável autorizou a peça na vitrine do clube, sem o nome do participante.');}
   else{if(g.status==='declined')fail('Esta peça já está fora da vitrine.',409);await run("UPDATE gallery_items SET status='declined',maker=NULL,updated=? WHERE id=?",now(),g.id);await event(g.project_id,'Responsável preferiu não mostrar a peça na vitrine do clube.');}
   return;
  }
  operator(u);
  if(name==='edit'){
   const image=photo(b.photo),key=await keep('gallery',image),checked=b.licenseChecked===true&&g.url&&!g.license_checked_at;
   try{await run('UPDATE gallery_items SET title=?,collection=?,note=?,photo_key=COALESCE(?,photo_key),photo_mime=COALESCE(?,photo_mime),license_checked_by=COALESCE(?,license_checked_by),license_checked_at=COALESCE(?,license_checked_at),updated=? WHERE id=?',str(b.title,'Nome da peça',200),str(b.collection,'Coleção',40),optional(b.note,'Comentário da equipe',500),key,image?.mime??null,checked?u.id:null,checked?now():null,now(),g.id);}
   catch(e){await remove(key);throw e;}
   if(key)await remove(g.photo_key);return;
  }
  if(name==='visibility'){
   if(!['published','hidden'].includes(g.status))fail(g.status==='pending'?'A peça aguarda a autorização da família.':'A família preferiu não mostrar esta peça.',409);
   await run('UPDATE gallery_items SET status=?,updated=? WHERE id=?',b.visible===true?'published':'hidden',now(),g.id);return;
  }
  if(name==='remove'){await run('DELETE FROM gallery_items WHERE id=?',g.id);await remove(g.photo_key,g.site_image_key);if(g.project_id)await event(g.project_id,'A equipe retirou a peça da vitrine do clube.');return;}
  fail('Ação não encontrada.',404);
 }

 async function route(req,res,path,method,u){
  if(path==='/api/gallery'&&method==='GET'){
   const rows=(await all('SELECT g.*,p.family_id,p.participant FROM gallery_items g LEFT JOIN projects p ON p.id=g.project_id ORDER BY g.id DESC')).filter(g=>allowed(g,u));
   json(res,{items:rows.map(g=>view(g,u)),collections:[...new Set([...collections,...rows.map(g=>g.collection)])]});return true;
  }
  if(path==='/api/gallery'&&method==='POST'){json(res,{id:await create(u,await body(req))});return true;}
  const m=path.match(/^\/api\/gallery\/(\d+)\/(\w+)$/);
  if(m&&method==='POST'){const g=await item(Number(m[1]));if(!allowed(g,u))fail('Peça não encontrada na vitrine.',404);await action(u,g,m[2],await body(req));json(res,{ok:true});return true;}
  const image=path.match(/^\/api\/gallery-image\/(\d+)\/(photo|site)$/);
  if(image&&method==='GET'){const g=await item(Number(image[1]));if(!allowed(g,u))fail('Imagem não encontrada.',404);const [key,mime]=image[2]==='photo'?[g.photo_key,g.photo_mime]:[g.site_image_key,g.site_image_mime];if(!key)fail('Imagem não encontrada.',404);const bytes=await storage.get(key);res.writeHead(200,{'Content-Type':mime,'Cache-Control':'private, max-age=86400','Content-Disposition':'inline'});res.end(bytes);return true;}
  return false;
 }

 // "Quero um igual": the new order copies the link, the details and the license check from the published piece.
 async function forOrder(id){
  const g=await one("SELECT * FROM gallery_items WHERE id=? AND status='published' AND url IS NOT NULL",Number(id));if(!g)fail('Esta peça não está mais disponível na vitrine.',404);
  return {link:parseModelLink(g.url),title:g.title,author:g.author,license:g.license,checkedBy:g.license_checked_by,checkedAt:g.license_checked_at,image:g.site_image_key?{bytes:await storage.get(g.site_image_key),mime:g.site_image_mime}:null};
 }
 return {route,forOrder,projectItem:id=>one('SELECT id,status,maker FROM gallery_items WHERE project_id=?',id)};
}
