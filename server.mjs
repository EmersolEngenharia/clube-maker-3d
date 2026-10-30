import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { period, allocation, settle, balance } from './domain.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const data=process.env.DATA_DIR || join(root,'data');
mkdirSync(join(data,'files'),{recursive:true});
const db=new DatabaseSync(join(data,'maker.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS families(id INTEGER PRIMARY KEY,name TEXT NOT NULL,plan TEXT NOT NULL DEFAULT 'monthly',allowance INTEGER NOT NULL DEFAULT 720,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,family_id INTEGER REFERENCES families(id));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS invites(token TEXT PRIMARY KEY,family_id INTEGER NOT NULL REFERENCES families(id),role TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS participants(id INTEGER PRIMARY KEY,family_id INTEGER NOT NULL REFERENCES families(id),name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY,family_id INTEGER NOT NULL REFERENCES families(id),name TEXT NOT NULL,description TEXT NOT NULL,participant TEXT NOT NULL,kind TEXT NOT NULL,size TEXT NOT NULL,color TEXT NOT NULL,quantity INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'draft',created TEXT NOT NULL,updated TEXT NOT NULL,minutes INTEGER NOT NULL DEFAULT 0,grams REAL NOT NULL DEFAULT 0,material TEXT NOT NULL DEFAULT '',material_rate INTEGER NOT NULL DEFAULT 0,extra_rate INTEGER NOT NULL DEFAULT 600,included INTEGER NOT NULL DEFAULT 0,period TEXT,approved_at TEXT,quote_note TEXT NOT NULL DEFAULT '',actual_minutes INTEGER,actual_grams REAL,used INTEGER NOT NULL DEFAULT 0,charge INTEGER NOT NULL DEFAULT 0,paid INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),text TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),user_id INTEGER NOT NULL REFERENCES users(id),body TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),name TEXT NOT NULL,path TEXT NOT NULL,size INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY,family_id INTEGER NOT NULL REFERENCES families(id),description TEXT NOT NULL,cents INTEGER NOT NULL,created TEXT NOT NULL);
`);
db.prepare('INSERT OR IGNORE INTO settings VALUES(1,?)').run(JSON.stringify({monthly:15000,annual:150000,hours:12,extra:600,markup:20,materials:[{name:'PLA',cost:10000,colors:['Branco','Azul','Verde','Laranja'],active:true}]}));
const one=(q,...p)=>db.prepare(q).get(...p), all=(q,...p)=>db.prepare(q).all(...p), run=(q,...p)=>db.prepare(q).run(...p);
const now=()=>new Date().toISOString(), config=()=>JSON.parse(one('SELECT value FROM settings WHERE id=1').value);
const hash=s=>createHash('sha256').update(s).digest('hex');
function password(s){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(s,salt,64).toString('hex');}
function verify(s,stored){const [salt,h]=stored.split(':');return timingSafeEqual(Buffer.from(h,'hex'),scryptSync(s,salt,64));}
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function str(value,label,max=500){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(`${label}: preencha entre 1 e ${max} caracteres.`);return value.trim();}
function num(v,label,min,max){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(`${label}: valor inválido.`);return v;}
function integer(v,label,min,max){num(v,label,min,max);if(!Number.isInteger(v))fail(`${label}: use um número inteiro.`);return v;}
function creds(b){const email=str(b.email,'E-mail',150).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Informe um e-mail válido.');if(typeof b.password!=='string'||b.password.length<10||b.password.length>200)fail('Use uma senha entre 10 e 200 caracteres.');return email;}
function event(id,text){run('INSERT INTO events(project_id,text,created) VALUES(?,?,?)',id,text,now());}
function tx(fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}}
const attempts=new Map();
function rate(req){const key=req.socket.remoteAddress;let v=attempts.get(key);if(!v||v.until<Date.now()){v={n:0,until:Date.now()+600000};attempts.set(key,v);}if(++v.n>35)fail('Muitas tentativas. Aguarde 10 minutos.',429);}
async function body(req){let chunks=[],length=0;for await(const chunk of req){length+=chunk.length;if(length>15*1024*1024)fail('O envio deve ter no máximo 10 MB.',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail('Dados inválidos.');}}
function user(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('maker_session='))?.slice(14);return token?one('SELECT u.id,u.email,u.name,u.role,u.family_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?',hash(token),Date.now()):null;}
function authorized(u,roles){if(!u)fail('Entre na sua conta para continuar.',401);if(roles&&!roles.includes(u.role))fail('Esta ação é exclusiva do responsável autorizado.',403);}
function project(id,u){authorized(u);const p=one('SELECT * FROM projects WHERE id=?',id);if(!p)fail('Projeto não encontrado.',404);if(u.role!=='admin'&&p.family_id!==u.family_id)fail('Projeto não encontrado.',404);return p;}
function familyBalance(id){const f=one('SELECT * FROM families WHERE id=?',id);return balance(all('SELECT * FROM projects WHERE family_id=?',id),f.allowance,period());}
function quote(p){const a=allocation(p.minutes,familyBalance(p.family_id).available,p.extra_rate);return {...a,materialCost:Math.round(p.grams*p.material_rate/1000),total:a.extraCost+Math.round(p.grams*p.material_rate/1000)};}
function login(res,id,req){const token=randomBytes(32).toString('hex');run('INSERT INTO sessions VALUES(?,?,?)',hash(token),id,Date.now()+7*86400000);res.setHeader('Set-Cookie',`maker_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);}
function json(res,obj,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));}

const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try{
    const url=new URL(req.url,'http://localhost'), path=url.pathname, method=req.method;
    const allowedHost=process.env.PUBLIC_ORIGIN?new URL(process.env.PUBLIC_ORIGIN).host:null;
    const requestHost=req.headers.host||'';
    if(allowedHost?requestHost!==allowedHost:!/^((localhost|127\.0\.0\.1)(:\d+)?|\[::1\](:\d+)?)$/.test(requestHost))fail('Endereço não autorizado. Configure PUBLIC_ORIGIN para disponibilizar em outro endereço.',403);
    if(!['GET','HEAD'].includes(method)){
      const expected=process.env.PUBLIC_ORIGIN||`http://${req.headers.host}`;
      if(req.headers.origin&&req.headers.origin!==expected)fail('Origem da solicitação não autorizada.',403);
      if(req.headers['sec-fetch-site']==='cross-site')fail('Solicitação não autorizada.',403);
      if(!String(req.headers['content-type']).startsWith('application/json'))fail('Envie os dados como JSON.',415);
    }
    if(!path.startsWith('/api/')){
      const files={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/art.svg':'art.svg'};
      if(!files[path])fail('Página não encontrada.',404);
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
      res.writeHead(200,{'Content-Type':types[extname(files[path])]});res.end(readFileSync(join(root,'public',files[path])));return;
    }
    res.setHeader('Cache-Control','no-store');
    const u=user(req);
    if(path==='/api/session'&&method==='GET'){return json(res,{user:u,setup:!one('SELECT id FROM users LIMIT 1'),config:config()});}
    if(path==='/api/setup'&&method==='POST'){
      rate(req);
      if(one('SELECT id FROM users LIMIT 1'))fail('O clube já foi configurado.',403);
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))fail('Configure a primeira conta no computador do servidor.',403);
      const b=await body(req),email=creds(b),name=str(b.name,'Nome',80);
      const id=tx(()=>{if(one('SELECT id FROM users LIMIT 1'))fail('O clube já foi configurado.',403);return run('INSERT INTO users(email,name,password,role) VALUES(?,?,?,?)',email,name,password(b.password),'admin').lastInsertRowid;});
      login(res,Number(id),req);return json(res,{ok:true});
    }
    if(path==='/api/login'&&method==='POST'){
      rate(req);const b=await body(req);const email=creds(b),account=one('SELECT * FROM users WHERE email=?',email);
      const dummy='00000000000000000000000000000000:'+ '00'.repeat(64);
      const valid=verify(b.password,account?.password||dummy);if(!account||!valid)fail('E-mail ou senha incorretos.',401);
      login(res,account.id,req);return json(res,{ok:true});
    }
    if(path==='/api/register'&&method==='POST'){
      rate(req);const b=await body(req),email=creds(b),name=str(b.name,'Nome',80),token=str(b.token,'Convite',150);
      const id=tx(()=>{const inv=one('SELECT * FROM invites WHERE token=? AND expires>?',hash(token),Date.now());if(!inv)fail('Este convite venceu ou já foi usado. Peça um novo à equipe.');if(one('SELECT id FROM users WHERE email=?',email))fail('Este e-mail já está cadastrado.');const result=run('INSERT INTO users(email,name,password,role,family_id) VALUES(?,?,?,?,?)',email,name,password(b.password),inv.role,inv.family_id);run('DELETE FROM invites WHERE token=?',hash(token));return Number(result.lastInsertRowid);});login(res,id,req);return json(res,{ok:true});
    }
    authorized(u);
    if(path==='/api/logout'&&method==='POST'){run('DELETE FROM sessions WHERE user_id=?',u.id);res.setHeader('Set-Cookie','maker_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,{ok:true});}
    if(path==='/api/dashboard'&&method==='GET'){
      const projects=u.role==='admin'?all('SELECT p.*,f.name family_name FROM projects p JOIN families f ON f.id=p.family_id ORDER BY p.created DESC'):all('SELECT * FROM projects WHERE family_id=? ORDER BY created DESC',u.family_id);
      const queue=all("SELECT id,family_id,status,minutes,approved_at FROM projects WHERE status IN ('queued','printing') ORDER BY CASE status WHEN 'printing' THEN 0 ELSE 1 END,approved_at").map((p,i)=>({id:p.id,status:p.status,minutes:p.minutes,position:i+1,own:p.family_id===u.family_id,name:u.role==='admin'||p.family_id===u.family_id?one('SELECT name FROM projects WHERE id=?',p.id).name:null}));
      return json(res,{projects,queue,config:config(),family:u.family_id?one('SELECT * FROM families WHERE id=?',u.family_id):null,balance:u.family_id?familyBalance(u.family_id):null,participants:u.family_id?all('SELECT * FROM participants WHERE family_id=?',u.family_id):[],families:u.role==='admin'?all('SELECT * FROM families').map(f=>({...f,balance:familyBalance(f.id),members:all('SELECT id,name,email,role FROM users WHERE family_id=?',f.id)})):[],payments:u.family_id?all('SELECT * FROM payments WHERE family_id=? ORDER BY id DESC',u.family_id):[]});
    }
    if(path==='/api/participants'&&method==='POST'){authorized(u,['guardian']);const b=await body(req);if(all('SELECT id FROM participants WHERE family_id=?',u.family_id).length>=20)fail('Limite de 20 participantes por família.');run('INSERT INTO participants(family_id,name) VALUES(?,?)',u.family_id,str(b.name,'Nome',80));return json(res,{ok:true});}
    if(path==='/api/projects'&&method==='POST'){
      authorized(u,['guardian','learner']);const b=await body(req);const kind=['idea','file'].includes(b.kind)?b.kind:'idea';
      const cfg=config(),colors=cfg.materials.filter(m=>m.active).flatMap(m=>m.colors);
      if(b.color!=='Quero ajuda'&&!colors.includes(b.color))fail('Escolha uma cor disponível.');
      const id=run('INSERT INTO projects(family_id,name,description,participant,kind,size,color,quantity,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)',u.family_id,str(b.name,'Nome do projeto',100),str(b.description,'Descrição',3000),str(b.participant,'Participante',80),kind,str(b.size,'Tamanho',100),str(b.color,'Cor',80),integer(b.quantity,'Quantidade',1,50),now(),now()).lastInsertRowid;
      event(Number(id),'Ideia salva como rascunho.');return json(res,{id:Number(id)});
    }
    const match=path.match(/^\/api\/projects\/(\d+)(?:\/(\w+))?$/);
    if(match){const id=Number(match[1]),action=match[2],p=project(id,u);
      if(!action&&method==='GET')return json(res,{...p,quote:p.minutes?quote(p):null,messages:all('SELECT m.*,u.name,u.role FROM messages m JOIN users u ON u.id=m.user_id WHERE project_id=? ORDER BY m.id',id),events:all('SELECT * FROM events WHERE project_id=? ORDER BY id',id),files:all('SELECT id,name,size FROM files WHERE project_id=?',id)});
      if(method!=='POST')fail('Ação não encontrada.',404);
      const b=await body(req);
      if(action==='edit'){
        if(!['draft','question','review'].includes(p.status))fail('Este projeto já tem orçamento. Peça uma nova avaliação antes de alterar.');
        const colors=config().materials.filter(m=>m.active).flatMap(m=>m.colors);
        if(b.color!=='Quero ajuda'&&!colors.includes(b.color))fail('Escolha uma cor disponível.');
        run('UPDATE projects SET name=?,description=?,participant=?,size=?,color=?,quantity=?,updated=? WHERE id=?',str(b.name,'Nome',100),str(b.description,'Descrição',3000),str(b.participant,'Participante',80),str(b.size,'Tamanho',100),str(b.color,'Cor',80),integer(b.quantity,'Quantidade',1,50),now(),id);event(id,'Detalhes da ideia atualizados.');
      }
      else if(action==='message'){run('INSERT INTO messages(project_id,user_id,body,created) VALUES(?,?,?,?)',id,u.id,str(b.body,'Mensagem',3000),now());}
      else if(action==='submit'){if(!['draft','question'].includes(p.status))fail('Este projeto já foi enviado.');if(p.kind==='file'&&!one('SELECT id FROM files WHERE project_id=?',id))fail('Adicione seu arquivo STL ou 3MF antes de enviar.');run("UPDATE projects SET status='review',updated=? WHERE id=?",now(),id);event(id,'Projeto enviado para avaliação.');}
      else if(action==='file'){
        if(!['draft','question','review'].includes(p.status))fail('Arquivos só podem ser enviados antes do orçamento.');
        const name=str(b.name,'Arquivo',150),ext=extname(name).toLowerCase();if(!['.stl','.3mf','.png','.jpg','.jpeg'].includes(ext))fail('Envie STL, 3MF, PNG ou JPG.');
        if(typeof b.data!=='string'||!b.data||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data))fail('Arquivo inválido.');const bytes=Buffer.from(b.data,'base64');if(bytes.length>10*1024*1024||!bytes.length)fail('O arquivo deve ter entre 1 byte e 10 MB.');if(all('SELECT id FROM files WHERE project_id=?',id).length>=5)fail('Limite de cinco arquivos por projeto.');
        if(p.kind==='file'&&!['.stl','.3mf'].includes(ext))fail('Neste projeto, envie um arquivo STL ou 3MF.');
        const key=randomBytes(24).toString('hex');writeFileSync(join(data,'files',key),bytes,{flag:'wx'});try{run('INSERT INTO files(project_id,name,path,size) VALUES(?,?,?,?)',id,name,key,bytes.length);}catch(e){unlinkSync(join(data,'files',key));throw e;}event(id,`Arquivo adicionado: ${name}`);
      }
      else if(action==='quote'){
        authorized(u,['admin']);if(!['review','question','approval','failed'].includes(p.status))fail('O projeto precisa estar em avaliação para receber um orçamento.');
        const c=config(),m=c.materials.find(m=>m.name===b.material&&m.active);if(!m)fail('Escolha um material disponível.');
        const minutes=integer(b.minutes,'Tempo total',1,10000),grams=num(b.grams,'Material total',0.1,10000),note=str(b.note,'Orientação',1000);
        run("UPDATE projects SET status='approval',minutes=?,grams=?,material=?,material_rate=?,extra_rate=?,quote_note=?,updated=? WHERE id=?",minutes,grams,m.name,Math.round(m.cost*(1+c.markup/100)),c.extra,note,now(),id);event(id,'Orçamento preparado. Aguardando aprovação do responsável.');
      }
      else if(action==='approve'){
        authorized(u,['guardian']);tx(()=>{const current=project(id,u);if(current.status!=='approval')fail('Este orçamento não está mais disponível.');const q=quote(current);if(b.total!==q.total||b.included!==q.included)fail('O saldo mudou. Reabra o orçamento para conferir o valor atualizado.',409);run("UPDATE projects SET status='queued',included=?,period=?,approved_at=?,charge=?,updated=? WHERE id=?",q.included,period(),now(),q.total,now(),id);event(id,`Orçamento aprovado. ${q.included} minutos reservados; valor máximo adicional R$ ${(q.total/100).toFixed(2)}.`);});
      }
      else if(action==='revise'){authorized(u,['guardian']);if(p.status!=='approval')fail('Não há orçamento aguardando aprovação.');run("UPDATE projects SET status='review',updated=? WHERE id=?",now(),id);event(id,'Responsável solicitou uma alteração no orçamento.');}
      else if(action==='cancel'){authorized(u,['guardian','admin']);if(!['draft','review','question','approval','queued'].includes(p.status))fail('Após iniciar a impressão, converse com a equipe.');run("UPDATE projects SET status='cancelled',included=0,charge=0,updated=? WHERE id=?",now(),id);event(id,'Pedido cancelado sem cobrança. Reserva de horas liberada.');}
      else if(action==='question'){authorized(u,['admin']);if(!['review','approval'].includes(p.status))fail('Esta etapa não permite pedir ajustes.');const note=str(b.note,'Pergunta',1000);run("UPDATE projects SET status='question',updated=? WHERE id=?",now(),id);run('INSERT INTO messages(project_id,user_id,body,created) VALUES(?,?,?,?)',id,u.id,note,now());event(id,'A equipe precisa de uma informação para continuar.');}
      else if(action==='start'){authorized(u,['admin']);if(p.status!=='queued'||b.checked!==true)fail('Confira a máquina antes de iniciar.');if(one("SELECT id FROM projects WHERE status='printing'"))fail('Já existe uma impressão em andamento.');const first=one("SELECT id FROM projects WHERE status='queued' ORDER BY approved_at,id LIMIT 1");if(first?.id!==id)fail('Respeite a ordem de aprovação da fila.');run("UPDATE projects SET status='printing',updated=? WHERE id=?",now(),id);event(id,'Máquina conferida pelo responsável. Impressão iniciada.');}
      else if(action==='finish'){authorized(u,['admin']);if(p.status!=='printing')fail('O projeto não está em impressão.');const minutes=integer(b.minutes,'Tempo real',1,10000),grams=num(b.grams,'Material real',0.1,10000),s=settle(p,minutes,grams);run("UPDATE projects SET status='ready',actual_minutes=?,actual_grams=?,used=?,charge=?,updated=? WHERE id=?",minutes,grams,s.used,s.charge,now(),id);event(id,'Impressão concluída. Peça pronta para retirar; consumo ajustado sem ultrapassar o orçamento.');}
      else if(action==='fail'){authorized(u,['admin']);if(p.status!=='printing')fail('O projeto não está em impressão.');const reason=str(b.reason,'Motivo',1000);run("UPDATE projects SET status='failed',included=0,used=0,charge=0,updated=? WHERE id=?",now(),id);event(id,`Impressão interrompida: ${reason}. Sem cobrança; horas liberadas. A equipe preparará um novo orçamento antes de tentar novamente.`);}
      else if(action==='collect'){authorized(u,['admin','guardian']);if(p.status!=='ready')fail('A peça ainda não está pronta para retirar.');run("UPDATE projects SET status='completed',updated=? WHERE id=?",now(),id);event(id,'Retirada confirmada. Projeto concluído!');}
      else if(action==='paid'){authorized(u,['admin']);if(!['ready','completed'].includes(p.status))fail('Registre o pagamento após a conclusão da impressão.');run('UPDATE projects SET paid=1 WHERE id=?',id);event(id,'Pagamento do projeto registrado pela equipe.');}
      else fail('Ação não encontrada.',404);
      return json(res,{ok:true});
    }
    const download=path.match(/^\/api\/files\/(\d+)$/);
    if(download&&method==='GET'){const f=one('SELECT * FROM files WHERE id=?',Number(download[1]));if(!f)fail('Arquivo não encontrado.',404);project(f.project_id,u);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.name).replace(/'/g,'%27')}`});res.end(readFileSync(join(data,'files',f.path)));return;}
    authorized(u,['admin']);
    if(path==='/api/families'&&method==='POST'){const b=await body(req),c=config();if(all('SELECT id FROM families').length>=10)fail('O piloto está limitado a 10 famílias.');if(!['monthly','annual'].includes(b.plan))fail('Plano inválido.');const id=run('INSERT INTO families(name,plan,allowance,created) VALUES(?,?,?,?)',str(b.name,'Família',80),b.plan,Math.round(c.hours*60),now()).lastInsertRowid;return json(res,{id:Number(id)});}
    if(path==='/api/invites'&&method==='POST'){const b=await body(req);if(!one('SELECT id FROM families WHERE id=?',Number(b.familyId)))fail('Família não encontrada.');if(!['guardian','learner'].includes(b.role))fail('Perfil inválido.');const token=randomBytes(24).toString('hex');run('INSERT INTO invites VALUES(?,?,?,?)',hash(token),Number(b.familyId),b.role,Date.now()+7*86400000);return json(res,{token});}
    if(path==='/api/payments'&&method==='POST'){const b=await body(req);if(!one('SELECT id FROM families WHERE id=?',Number(b.familyId)))fail('Família não encontrada.');run('INSERT INTO payments(family_id,description,cents,created) VALUES(?,?,?,?)',Number(b.familyId),str(b.description,'Descrição',150),integer(b.cents,'Valor em centavos',1,10000000),now());return json(res,{ok:true});}
    if(path==='/api/settings'&&method==='POST'){const b=await body(req);integer(b.monthly,'Mensalidade',0,1000000);integer(b.annual,'Anuidade',0,10000000);num(b.hours,'Horas',1,100);integer(b.extra,'Hora extra',0,100000);num(b.markup,'Acréscimo do material',0,200);if(!Array.isArray(b.materials)||!b.materials.length||b.materials.length>20)fail('Cadastre de 1 a 20 materiais.');const names=new Set();for(const m of b.materials){m.name=str(m.name,'Material',40);if(names.has(m.name))fail('Nomes de materiais devem ser únicos.');names.add(m.name);integer(m.cost,'Custo por kg',1,1000000);if(typeof m.active!=='boolean'||!Array.isArray(m.colors)||!m.colors.length||m.colors.length>20)fail('Informe as cores do material.');m.colors=m.colors.map(c=>str(c,'Cor',40));}run('UPDATE settings SET value=? WHERE id=1',JSON.stringify(b));return json(res,{ok:true});}
    fail('Ação não encontrada.',404);
  }catch(e){if(!e.status)console.error('Erro interno:',e.message);if(!res.headersSent)json(res,{error:e.status?e.message:'Não foi possível concluir. Tente novamente.'},e.status||500);else res.end();}
});
server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`Clube Maker 3D disponível em http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||3000}`));
