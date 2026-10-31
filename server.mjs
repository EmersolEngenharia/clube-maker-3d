import http from 'node:http';
import {promisify} from 'node:util';
import {gzipSync,brotliCompressSync,constants as zlibConstants} from 'node:zlib';
import {createFeatures} from './features.mjs';
import {isTeam,isAdmin,canFinance,canOperate} from './permissions.mjs';
import {createQuota,computeQuota} from './quota.mjs';
import {createBilling} from './payments/billing.mjs';
import {createOperations} from './operations.mjs';
import { createDatabase } from './db.mjs';
import { createFileStorage } from './storage.mjs';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { period, allocation, settle } from './domain.mjs';

if(process.env.NODE_ENV==='production'&&(!process.env.PUBLIC_ORIGIN?.startsWith('https://')||process.env.COOKIE_SECURE!=='1'))throw new Error('Produção exige PUBLIC_ORIGIN HTTPS e COOKIE_SECURE=1.');
const root=dirname(fileURLToPath(import.meta.url));
const data=process.env.DATA_DIR || join(root,'data');
const db=await createDatabase({data});
const storage=await createFileStorage({data});
const one=(q,...p)=>db.one(q,...p), all=(q,...p)=>db.all(q,...p), run=(q,...p)=>db.run(q,...p);
const tx=fn=>db.transaction(fn);
const now=()=>new Date().toISOString(), config=async ()=>JSON.parse((await one('SELECT value FROM settings WHERE id=1')).value);
const hash=s=>createHash('sha256').update(s).digest('hex');
const derive=promisify(scrypt);
async function password(s){const salt=randomBytes(16).toString('hex');return salt+':'+(await derive(s,salt,64)).toString('hex');}
async function verify(s,stored){const [salt,h]=stored.split(':');return timingSafeEqual(Buffer.from(h,'hex'),await derive(s,salt,64));}
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function str(value,label,max=500){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(`${label}: preencha entre 1 e ${max} caracteres.`);return value.trim();}
function num(v,label,min,max){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(`${label}: valor inválido.`);return v;}
function integer(v,label,min,max){num(v,label,min,max);if(!Number.isInteger(v))fail(`${label}: use um número inteiro.`);return v;}
function creds(b){const email=str(b.email,'E-mail',150).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Informe um e-mail válido.');if(typeof b.password!=='string'||b.password.length<6||b.password.length>200)fail('Use uma senha entre 6 e 200 caracteres.');return email;}
async function event(id,text){(await run('INSERT INTO events(project_id,text,created) VALUES(?,?,?)',id,text,now()));}
const attempts=new Map();
function rate(req){const key=process.env.TRUST_PROXY==='1'?(req.headers['x-real-ip']||req.socket.remoteAddress):req.socket.remoteAddress;let v=attempts.get(key);if(!v||v.until<Date.now()){v={n:0,until:Date.now()+600000};attempts.set(key,v);}if(++v.n>35)fail('Muitas tentativas. Aguarde 10 minutos.',429);}
async function body(req){if(req.parsedBody!==undefined)return req.parsedBody;let chunks=[],length=0;for await(const chunk of req){length+=chunk.length;if(length>15*1024*1024)fail('O envio deve ter no máximo 10 MB.',413);chunks.push(chunk);}try{const parsed=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail('Dados inválidos.');return req.parsedBody=parsed;}catch{fail('Dados inválidos.');}}
async function user(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('maker_session='))?.slice(14);return token?(await one("SELECT u.id,u.email,u.name,u.role,u.family_id,t.user_id is_staff,(SELECT access_role FROM team_permissions WHERE user_id=u.id AND t.user_id IS NOT NULL) team_role,(SELECT whatsapp FROM guardian_contacts WHERE user_id=u.id) whatsapp,COALESCE(p.theme,'atelier') theme,COALESCE(p.avatar,'robot') avatar,COALESCE(p.experience,'guided') experience,CASE WHEN p.photo_key IS NOT NULL THEN 1 ELSE 0 END has_photo FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN team_members t ON t.user_id=u.id LEFT JOIN user_preferences p ON p.user_id=u.id WHERE s.token=? AND s.expires>?",hash(token),Date.now())):null;}
function authorized(u,roles){if(!u)fail('Entre na sua conta para continuar.',401);if(roles&&!roles.includes(u.role)&&!(roles.includes('admin')&&isAdmin(u)))fail('Esta ação é exclusiva do responsável autorizado.',403);}
async function project(id,u){authorized(u);const p=(await one('SELECT * FROM projects WHERE id=?',id));if(!p)fail('Projeto não encontrado.',404);if(!isTeam(u)&&p.family_id!==u.family_id)fail('Projeto não encontrado.',404);return p;}
const quota=createQuota(db);
const familyBalance=id=>quota.balance(id);
async function quote(p){const a=allocation(p.minutes,(await familyBalance(p.family_id)).available,p.extra_rate);return {...a,materialCost:Math.round(p.grams*p.material_rate/1000),total:a.extraCost+Math.round(p.grams*p.material_rate/1000)};}
async function login(res,id,req){await run('DELETE FROM sessions WHERE expires<?',Date.now());const token=randomBytes(32).toString('hex');(await run('INSERT INTO sessions VALUES(?,?,?)',hash(token),id,Date.now()+7*86400000));res.setHeader('Set-Cookie',`maker_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);}
function json(res,obj,status=200){if(res.deferJson){res.pendingJson={obj,status};return;}res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));}

function validateRequest(req,webhook=false){
 const method=req.method;
    const allowedHost=process.env.PUBLIC_ORIGIN?new URL(process.env.PUBLIC_ORIGIN).host:null;
    const requestHost=req.headers.host||'';
    if(allowedHost?requestHost!==allowedHost:!/^((localhost|127\.0\.0\.1)(:\d+)?|\[::1\](:\d+)?)$/.test(requestHost))fail('Endereço não autorizado. Configure PUBLIC_ORIGIN para disponibilizar em outro endereço.',403);
    if(!webhook&&!['GET','HEAD'].includes(method)){
      const expected=process.env.PUBLIC_ORIGIN||`http://${req.headers.host}`;
      if(req.headers.origin&&req.headers.origin!==expected)fail('Origem da solicitação não autorizada.',403);
      if(req.headers['sec-fetch-site']==='cross-site')fail('Solicitação não autorizada.',403);
      if(!String(req.headers['content-type']).startsWith('application/json'))fail('Envie os dados como JSON.',415);
    }
 }
async function rawBody(req){const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>1024*1024)fail('Webhook muito grande.',413);chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}
async function billingRequest(req,res,path){
 validateRequest(req);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const u=await db.withRequest(()=>user(req));authorized(u);
 const method=req.method,b=method==='POST'?await body(req):null;
 if(path==='/api/billing'&&method==='GET')return json(res,await db.withRequest(()=>billing.list(u)));
 if(path==='/api/billing/diagnostic'&&method==='GET')return json(res,await billing.diagnostic(u));
 if(path==='/api/billing/diagnostic/test'&&method==='POST')return json(res,await billing.diagnostic(u,true));
 if(path==='/api/billing/charges'&&method==='POST')return json(res,await billing.create(b,u));
 const match=path.match(/^\/api\/billing\/charges\/([a-f0-9-]+)\/(refresh|cancel|manual|pix|resolve)$/);
 if(match){const id=match[1],action=match[2];if(action==='pix'&&method==='GET')return json(res,await billing.pix(id,u));if(method==='POST'){if(action==='resolve')return json(res,await billing.resolve(id,u,b.confirmed));if(action==='refresh')return json(res,await billing.refresh(id,u));if(action==='cancel')return json(res,await billing.cancel(id,u));if(action==='manual')return json(res,await billing.manualPaid(id,u));}}
 fail('Ação de cobrança não encontrada.',404);
}
async function handle(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const url=new URL(req.url,'http://localhost'), path=url.pathname, method=req.method;
    validateRequest(req);
    if(!path.startsWith('/api/')){
      const file=staticFiles.get(path);if(!file||!['GET','HEAD'].includes(method))fail('Página não encontrada.',404);
      const encodings=String(req.headers['accept-encoding']||'').split(',').map(v=>v.trim().split(';'));const accepts=name=>encodings.some(([n,...params])=>n===name&&!params.some(p=>/^q=0(?:\.0*)?$/.test(p.trim())));
      const encoding=accepts('br')?'br':accepts('gzip')?'gzip':null,bytes=encoding?file[encoding]:file.bytes,etag='\"'+hash(bytes)+'\"';
      res.setHeader('Cache-Control','public, max-age=0, must-revalidate');res.setHeader('ETag',etag);res.setHeader('Vary','Accept-Encoding');if(encoding)res.setHeader('Content-Encoding',encoding);
      if(req.headers['if-none-match']===etag){res.writeHead(304);res.end();return;}
      res.writeHead(200,{'Content-Type':file.type,'Content-Length':bytes.length});res.end(method==='HEAD'?undefined:bytes);return;
    }
    res.setHeader('Cache-Control','no-store');
    const u=(await user(req));
    if(path==='/api/enroll'&&method==='POST')rate(req);
    if(path==='/api/staff-register'&&method==='POST')rate(req);
    if(await operations.publicRoute(req,res,path,method))return;
    if(await features.publicRoute(req,res,path,method))return;
    if(path==='/api/session'&&method==='GET'){return json(res,{user:u,setup:process.env.NODE_ENV!=='production'&&!(await one('SELECT id FROM users LIMIT 1')),config:(await config())});}
    if(path==='/api/setup'&&method==='POST'){
      if(process.env.NODE_ENV==='production')fail('A conta inicial é criada pelo administrador do servidor.',403);
      rate(req);
      if((await one('SELECT id FROM users LIMIT 1')))fail('O clube já foi configurado.',403);
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))fail('Configure a primeira conta no computador do servidor.',403);
      const b=await body(req),email=creds(b),name=str(b.name,'Nome',80);
      const id=(await tx(async ()=>{if((await one('SELECT id FROM users LIMIT 1')))fail('O clube já foi configurado.',403);return (await run('INSERT INTO users(email,name,password,role) VALUES(?,?,?,?)',email,name,await password(b.password),'admin')).lastInsertRowid;}));
      (await login(res,Number(id),req));return json(res,{ok:true});
    }
    if(path==='/api/login'&&method==='POST'){
      rate(req);const b=await body(req);const email=creds(b),account=(await one('SELECT * FROM users WHERE email=?',email));
      if(account?.role==='staff'&&!(await one('SELECT user_id FROM team_members WHERE user_id=?',account.id)))fail('Seu acesso à equipe foi removido.',403);
      const dummy='00000000000000000000000000000000:'+ '00'.repeat(64);
      const valid=await verify(b.password,account?.password||dummy);if(!account||!valid)fail('E-mail ou senha incorretos.',401);
      (await login(res,account.id,req));return json(res,{ok:true});
    }
    if(path==='/api/register'&&method==='POST'){
      rate(req);const b=await body(req),email=creds(b),name=str(b.name,'Nome',80),token=str(b.token,'Convite',150);
      const id=(await tx(async ()=>{const inv=(await one('SELECT * FROM invites WHERE token=? AND expires>?',hash(token),Date.now()));if(!inv)fail('Este convite venceu ou já foi usado. Peça um novo à equipe.');if((await one('SELECT id FROM users WHERE email=?',email)))fail('Este e-mail já está cadastrado.');const result=(await run('INSERT INTO users(email,name,password,role,family_id) VALUES(?,?,?,?,?)',email,name,await password(b.password),inv.role,inv.family_id));(await run('DELETE FROM invites WHERE token=?',hash(token)));return Number(result.lastInsertRowid);}));await features.savePreference(id,b);(await login(res,id,req));return json(res,{ok:true});
    }
    authorized(u);
    if(await operations.route(req,res,path,method,u))return;
    if(await features.route(req,res,path,method,u))return;
    if(path==='/api/logout'&&method==='POST'){(await run('DELETE FROM sessions WHERE user_id=?',u.id));res.setHeader('Set-Cookie','maker_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,{ok:true});}
    if(path==='/api/dashboard'&&method==='GET'){
      const team=isTeam(u),fid=u.family_id;
      const scoped=(sql,clause='family_id')=>({sql:sql+(team?'':' WHERE '+clause+'=?'),params:team?[]:[fid]});
      const data=await db.snapshot({
        projects:{sql:team?'SELECT p.id,p.family_id,p.name,p.participant,p.kind,p.status,p.created,p.updated,p.minutes,p.grams,p.material_rate,p.extra_rate,p.included,p.period,p.approved_at,p.actual_minutes,p.actual_grams,p.used,p.charge,p.paid,f.name family_name FROM projects p JOIN families f ON f.id=p.family_id ORDER BY p.created DESC':'SELECT id,family_id,name,participant,kind,status,created,updated,minutes,grams,material_rate,extra_rate,included,period,approved_at,actual_minutes,actual_grams,used,charge,paid FROM projects WHERE family_id=? ORDER BY created DESC',params:team?[]:[fid]},
        queue:{sql:"SELECT id,name,family_id,status,minutes,approved_at FROM projects WHERE status IN ('queued','printing') ORDER BY CASE status WHEN 'printing' THEN 0 ELSE 1 END,approved_at"},
        families:scoped('SELECT * FROM families','id'),
        members:{sql:"SELECT u.id,u.name,u.email,u.role,u.family_id,t.user_id is_staff,c.whatsapp FROM users u LEFT JOIN team_members t ON t.user_id=u.id LEFT JOIN guardian_contacts c ON c.user_id=u.id WHERE "+(team?'u.family_id IS NOT NULL':u.role==='guardian'?'u.family_id=?':'1=0'),params:!team&&u.role==='guardian'?[fid]:[]},
        participants:scoped("SELECT p.*,COALESCE(s.age_group,'unspecified') age_group,COALESCE(s.notes,'') notes,COALESCE(s.active,1) active FROM participants p LEFT JOIN participant_settings s ON s.participant_id=p.id",'p.family_id'),
        benefits:{sql:"SELECT b.*,t.expires_on FROM benefits b LEFT JOIN benefit_terms t ON t.code=b.code WHERE b.kind='hours'"+(team?'':' AND b.family_id=?'),params:team?[]:[fid]},
        allocations:{...scoped('SELECT a.*,p.family_id FROM benefit_allocations a JOIN projects p ON p.id=a.project_id','p.family_id')},
        payments:{sql:"SELECT p.* FROM payments p WHERE p.family_id=? AND NOT EXISTS(SELECT 1 FROM cash_entries c WHERE c.source_key='payment:' || p.id AND c.voided_at IS NOT NULL) ORDER BY p.id DESC",params:[fid]},
        settings:{sql:'SELECT value FROM settings WHERE id=1'}
      });
      const group=rows=>{const map=new Map();for(const row of rows){if(!map.has(row.family_id))map.set(row.family_id,[]);map.get(row.family_id).push(row);}return map;};
      const byProject=group(data.projects),byMember=group(data.members),byDependent=group(data.participants),byBenefit=group(data.benefits),byAllocation=group(data.allocations);
      const balances=new Map(data.families.map(f=>[f.id,computeQuota(byProject.get(f.id)||[],f.allowance,byBenefit.get(f.id)||[],byAllocation.get(f.id)||[])]));
      const families=team?data.families.map(f=>({...f,balance:balances.get(f.id),members:byMember.get(f.id)||[],participants:byDependent.get(f.id)||[]})):[];
      const queue=data.queue.map((p,i)=>({id:p.id,status:p.status,minutes:p.minutes,position:i+1,own:p.family_id===fid,name:team||p.family_id===fid?p.name:null}));
      return json(res,{projects:data.projects,queue,config:JSON.parse(data.settings[0].value),family:fid?data.families.find(f=>f.id===fid)||null:null,balance:fid?balances.get(fid)||null:null,participants:fid?byDependent.get(fid)||[]:[],families,familyMembers:u.role==='guardian'?byMember.get(fid)||[]:[],payments:data.payments});
    }
    if(path==='/api/participants'&&method==='POST'){authorized(u,['guardian']);const b=await body(req);if((await all('SELECT id FROM participants WHERE family_id=?',u.family_id)).length>=20)fail('Limite de 20 participantes por família.');(await run('INSERT INTO participants(family_id,name) VALUES(?,?)',u.family_id,str(b.name,'Nome',80)));return json(res,{ok:true});}
    if(path==='/api/projects'&&method==='POST'){
      authorized(u,['guardian','learner']);const b=await body(req);const kind=['idea','file'].includes(b.kind)?b.kind:'idea';
      const cfg=(await config()),colors=cfg.materials.filter(m=>m.active).flatMap(m=>m.colors);
      if(b.color!=='Quero ajuda'&&!colors.includes(b.color))fail('Escolha uma cor disponível.');
      const id=(await run('INSERT INTO projects(family_id,name,description,participant,kind,size,color,quantity,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)',u.family_id,str(b.name,'Nome do projeto',100),str(b.description,'Descrição',3000),str(b.participant,'Participante',80),kind,str(b.size,'Tamanho',100),str(b.color,'Cor',80),integer(b.quantity,'Quantidade',1,50),now(),now())).lastInsertRowid;
      (await event(Number(id),'Ideia salva como rascunho.'));return json(res,{id:Number(id)});
    }
    const match=path.match(/^\/api\/projects\/(\d+)(?:\/(\w+))?$/);
    if(match){const id=Number(match[1]),action=match[2],p=(await project(id,u));
      if(!action&&method==='GET')return json(res,{...p,quote:p.minutes?(await quote(p)):null,messages:(await all('SELECT m.*,u.name,u.role,t.user_id is_staff FROM messages m JOIN users u ON u.id=m.user_id LEFT JOIN team_members t ON t.user_id=u.id WHERE project_id=? ORDER BY m.id',id)),events:(await all('SELECT * FROM events WHERE project_id=? ORDER BY id',id)),files:(await all('SELECT id,name,size FROM files WHERE project_id=?',id))});
      if(method!=='POST')fail('Ação não encontrada.',404);
      const b=await body(req);
      if(!canOperate(u)&&!(u.family_id&&u.family_id===p.family_id)&&['edit','submit','file','message'].includes(action))fail('Acesso operacional necessário.',403);
      if(action==='edit'){
        if(!['draft','question','review'].includes(p.status))fail('Este projeto já tem orçamento. Peça uma nova avaliação antes de alterar.');
        const colors=(await config()).materials.filter(m=>m.active).flatMap(m=>m.colors);
        if(b.color!=='Quero ajuda'&&!colors.includes(b.color))fail('Escolha uma cor disponível.');
        (await run('UPDATE projects SET name=?,description=?,participant=?,size=?,color=?,quantity=?,updated=? WHERE id=?',str(b.name,'Nome',100),str(b.description,'Descrição',3000),str(b.participant,'Participante',80),str(b.size,'Tamanho',100),str(b.color,'Cor',80),integer(b.quantity,'Quantidade',1,50),now(),id));(await event(id,'Detalhes da ideia atualizados.'));
      }
      else if(action==='message'){(await run('INSERT INTO messages(project_id,user_id,body,created) VALUES(?,?,?,?)',id,u.id,str(b.body,'Mensagem',3000),now()));}
      else if(action==='submit'){if(!['draft','question'].includes(p.status))fail('Este projeto já foi enviado.');if(p.kind==='file'&&!(await one('SELECT id FROM files WHERE project_id=?',id)))fail('Adicione seu arquivo STL ou 3MF antes de enviar.');(await run("UPDATE projects SET status='review',updated=? WHERE id=?",now(),id));(await event(id,'Projeto enviado para avaliação.'));}
      else if(action==='file'){
        if(!['draft','question','review'].includes(p.status))fail('Arquivos só podem ser enviados antes do orçamento.');
        const name=str(b.name,'Arquivo',150),ext=extname(name).toLowerCase();if(!['.stl','.3mf','.png','.jpg','.jpeg'].includes(ext))fail('Envie STL, 3MF, PNG ou JPG.');
        if(typeof b.data!=='string'||!b.data||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data))fail('Arquivo inválido.');const bytes=Buffer.from(b.data,'base64');if(bytes.length>10*1024*1024||!bytes.length)fail('O arquivo deve ter entre 1 byte e 10 MB.');if((await all('SELECT id FROM files WHERE project_id=?',id)).length>=5)fail('Limite de cinco arquivos por projeto.');
        if(p.kind==='file'&&!['.stl','.3mf'].includes(ext))fail('Neste projeto, envie um arquivo STL ou 3MF.');
        const key=randomBytes(24).toString('hex');await storage.put(key,bytes);try{(await run('INSERT INTO files(project_id,name,path,size) VALUES(?,?,?,?)',id,name,key,bytes.length));}catch(e){await storage.remove(key);throw e;}(await event(id,`Arquivo adicionado: ${name}`));
      }
      else if(action==='quote'){
        authorized(u,canOperate(u)?null:['admin']);if(!['review','question','approval','failed'].includes(p.status))fail('O projeto precisa estar em avaliação para receber um orçamento.');
        const c=(await config()),m=c.materials.find(m=>m.name===b.material&&m.active);if(!m)fail('Escolha um material disponível.');
        const minutes=integer(b.minutes,'Tempo total',1,10000),grams=num(b.grams,'Material total',0.1,10000),note=str(b.note,'Orientação',1000);
        (await run("UPDATE projects SET status='approval',minutes=?,grams=?,material=?,material_rate=?,extra_rate=?,quote_note=?,updated=? WHERE id=?",minutes,grams,m.name,Math.round(m.cost*(1+c.markup/100)),c.extra,note,now(),id));(await event(id,'Orçamento preparado. Aguardando aprovação do responsável.'));
      }
      else if(action==='approve'){
        authorized(u,['guardian']);if(p.family_id!==u.family_id)fail('Somente o responsável desta família pode aprovar.',403);(await tx(async ()=>{const current=(await project(id,u));if(current.status!=='approval')fail('Este orçamento não está mais disponível.');const q=(await quote(current));if(b.total!==q.total||b.included!==q.included)fail('O saldo mudou. Reabra o orçamento para conferir o valor atualizado.',409);await quota.reserve(id,current.family_id,q.included);(await run("UPDATE projects SET status='queued',included=?,period=?,approved_at=?,charge=?,updated=? WHERE id=?",q.included,period(),now(),q.total,now(),id));(await event(id,`Orçamento aprovado. ${q.included} minutos reservados; valor máximo adicional R$ ${(q.total/100).toFixed(2)}.`));}));
      }
      else if(action==='revise'){authorized(u,['guardian']);if(p.family_id!==u.family_id)fail('Somente o responsável desta família pode alterar a aprovação.',403);if(p.status!=='approval')fail('Não há orçamento aguardando aprovação.');(await run("UPDATE projects SET status='review',updated=? WHERE id=?",now(),id));(await event(id,'Responsável solicitou uma alteração no orçamento.'));}
      else if(action==='cancel'){authorized(u,canOperate(u)?null:['guardian']);if(!canOperate(u)&&p.family_id!==u.family_id)fail('Ação exclusiva da sua família.',403);if(!['draft','review','question','approval','queued'].includes(p.status))fail('Após iniciar a impressão, converse com a equipe.');(await run("UPDATE projects SET status='cancelled',included=0,charge=0,updated=? WHERE id=?",now(),id));(await event(id,'Pedido cancelado sem cobrança. Reserva de horas liberada.'));}
      else if(action==='question'){authorized(u,canOperate(u)?null:['admin']);if(!['review','approval'].includes(p.status))fail('Esta etapa não permite pedir ajustes.');const note=str(b.note,'Pergunta',1000);(await run("UPDATE projects SET status='question',updated=? WHERE id=?",now(),id));(await run('INSERT INTO messages(project_id,user_id,body,created) VALUES(?,?,?,?)',id,u.id,note,now()));(await event(id,'A equipe precisa de uma informação para continuar.'));}
      else if(action==='start'){authorized(u,canOperate(u)?null:['admin']);if(p.status!=='queued'||b.checked!==true)fail('Confira a máquina antes de iniciar.');if((await one("SELECT id FROM projects WHERE status='printing'")))fail('Já existe uma impressão em andamento.');const first=(await one("SELECT id FROM projects WHERE status='queued' ORDER BY approved_at,id LIMIT 1"));if(first?.id!==id)fail('Respeite a ordem de aprovação da fila.');(await run("UPDATE projects SET status='printing',updated=? WHERE id=?",now(),id));(await event(id,'Máquina conferida pelo responsável. Impressão iniciada.'));}
      else if(action==='finish'){authorized(u,canOperate(u)?null:['admin']);if(p.status!=='printing')fail('O projeto não está em impressão.');const minutes=integer(b.minutes,'Tempo real',1,10000),grams=num(b.grams,'Material real',0.1,10000),s=settle(p,minutes,grams);(await run("UPDATE projects SET status='ready',actual_minutes=?,actual_grams=?,used=?,charge=?,updated=? WHERE id=?",minutes,grams,s.used,s.charge,now(),id));(await event(id,'Impressão concluída. Peça pronta para retirar; consumo ajustado sem ultrapassar o orçamento.'));}
      else if(action==='fail'){authorized(u,canOperate(u)?null:['admin']);if(p.status!=='printing')fail('O projeto não está em impressão.');const reason=str(b.reason,'Motivo',1000);(await run("UPDATE projects SET status='failed',included=0,used=0,charge=0,updated=? WHERE id=?",now(),id));(await event(id,`Impressão interrompida: ${reason}. Sem cobrança; horas liberadas. A equipe preparará um novo orçamento antes de tentar novamente.`));}
      else if(action==='collect'){authorized(u,canOperate(u)?null:['guardian']);if(!canOperate(u)&&p.family_id!==u.family_id)fail('Ação exclusiva da sua família.',403);if(p.status!=='ready')fail('A peça ainda não está pronta para retirar.');(await run("UPDATE projects SET status='completed',updated=? WHERE id=?",now(),id));(await event(id,'Retirada confirmada. Projeto concluído!'));}
      else if(action==='paid'){authorized(u,canFinance(u)?null:['admin']);if(!['ready','completed'].includes(p.status))fail('Registre o pagamento após a conclusão da impressão.');await operations.recordProject(p,u);(await run('UPDATE projects SET paid=1 WHERE id=?',id));(await event(id,'Pagamento do projeto registrado pela equipe.'));}
      else fail('Ação não encontrada.',404);
      return json(res,{ok:true});
    }
    const download=path.match(/^\/api\/files\/(\d+)$/);
    if(download&&method==='GET'){const f=(await one('SELECT * FROM files WHERE id=?',Number(download[1])));if(!f)fail('Arquivo não encontrado.',404);(await project(f.project_id,u));const bytes=await storage.get(f.path);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.name).replace(/'/g,'%27')}`});res.end(bytes);return;}
    authorized(u,canOperate(u)?null:['admin']);
    if(path==='/api/families'&&method==='POST'){const b=await body(req),c=(await config());if((await all('SELECT id FROM families')).length>=10)fail('O piloto está limitado a 10 famílias.');if(!['monthly','annual'].includes(b.plan))fail('Plano inválido.');const id=(await run('INSERT INTO families(name,plan,allowance,created) VALUES(?,?,?,?)',str(b.name,'Família',80),b.plan,Math.round(c.hours*60),now())).lastInsertRowid;return json(res,{id:Number(id)});}
    if(path==='/api/invites'&&method==='POST'){const b=await body(req);if(!(await one('SELECT id FROM families WHERE id=?',Number(b.familyId))))fail('Família não encontrada.');if(!['guardian','learner'].includes(b.role))fail('Perfil inválido.');const token=randomBytes(24).toString('hex');(await run('INSERT INTO invites VALUES(?,?,?,?)',hash(token),Number(b.familyId),b.role,Date.now()+7*86400000));return json(res,{token});}
    if(path==='/api/settings'&&method==='POST'){authorized(u,['admin']);const b=await body(req);integer(b.monthly,'Mensalidade',0,1000000);integer(b.annual,'Anuidade',0,10000000);num(b.hours,'Horas',1,100);integer(b.extra,'Hora extra',0,100000);num(b.markup,'Acréscimo do material',0,200);if(!Array.isArray(b.materials)||!b.materials.length||b.materials.length>20)fail('Cadastre de 1 a 20 materiais.');const names=new Set();for(const m of b.materials){m.name=str(m.name,'Material',40);if(names.has(m.name))fail('Nomes de materiais devem ser únicos.');names.add(m.name);integer(m.cost,'Custo por kg',1,1000000);if(typeof m.active!=='boolean'||!Array.isArray(m.colors)||!m.colors.length||m.colors.length>20)fail('Informe as cores do material.');m.colors=m.colors.map(c=>str(c,'Cor',40));}(await run('UPDATE settings SET value=? WHERE id=1',JSON.stringify(b)));return json(res,{ok:true});}
    fail('Ação não encontrada.',404);
}
const features=createFeatures({db,quota,storage,fail,str,integer,body,json,config,password,creds,login});
const operations=createOperations({db,quota,fail,str,integer,body,json,creds,password,login});
await db.transaction(()=>operations.backfill());
const billing=createBilling({db,fail,str,integer,config});
const staticFiles=new Map(Object.entries({'/':'index.html','/app.js':'app.js','/features.js':'features.js','/operations.js':'operations.js','/billing.js':'billing.js','/styles.css':'styles.css','/themes.css':'themes.css','/art.svg':'art.svg','/brand.css':'brand.css','/brand-icon.svg':'brand-icon.svg','/favicon.svg':'favicon.svg'}).map(([url,file])=>{const bytes=readFileSync(join(root,'public',file));return [url,{bytes,gzip:gzipSync(bytes),br:brotliCompressSync(bytes,{params:{[zlibConstants.BROTLI_PARAM_QUALITY]:5}}),etag:'"'+hash(bytes)+'"',type:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'})[extname(file)]}];}));
const cleanup=setInterval(()=>{for(const [k,v]of attempts)if(v.until<Date.now())attempts.delete(k);},60000);cleanup.unref();
const server=http.createServer(async(req,res)=>{
  try {
    const requestPath=new URL(req.url,'http://localhost').pathname;
    if(requestPath==='/api/webhooks/asaas'&&req.method==='POST'){
      validateRequest(req,true);res.setHeader('Cache-Control','no-store');
      const event=await billing.parseWebhook(await rawBody(req),req.headers),result=await billing.handleEvent(event);json(res,{ok:true,...result});return;
    }
    if(requestPath==='/api/billing'||requestPath.startsWith('/api/billing/')){await billingRequest(req,res,requestPath);return;}
    if(req.url==='/healthz'&&req.method==='GET'){await db.one('SELECT 1 AS ok');json(res,{ok:true});return;}
    const mutation=!['GET','HEAD'].includes(req.method);
    if(mutation)await body(req);
    res.deferJson=mutation;
    if(new URL(req.url,'http://localhost').pathname.startsWith('/api/'))await db.withRequest(()=>handle(req,res),mutation);else await handle(req,res);
    if(res.pendingJson){res.deferJson=false;json(res,res.pendingJson.obj,res.pendingJson.status);}
  }catch(e){
    res.deferJson=false;
    if(!e.status)console.error('Falha interna na solicitação:',e.code||'internal_error');
    if(!res.headersSent){res.removeHeader('Set-Cookie');json(res,{error:e.status?e.message:'Não foi possível concluir. Tente novamente.'},e.status||500);}else res.end();
  }
});
server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`Clube Maker 3D disponível em http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||3000}`));

for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(async()=>{await db.close();process.exit(0);}));
