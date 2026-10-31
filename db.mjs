import {AsyncLocalStorage} from 'node:async_hooks';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const initialSettings={monthly:15000,annual:150000,hours:12,extra:600,markup:20,materials:[{name:'PLA',cost:10000,colors:['Branco','Azul','Verde','Laranja'],active:true}]};
export function postgresSQL(sql){let n=0,quoted=false,out='';for(let i=0;i<sql.length;i++){const c=sql[i];if(c==="'"){if(quoted&&sql[i+1]==="'"){out+="''";i++;continue;}quoted=!quoted;}out+=c==='?'&&!quoted?'$'+(++n):c;}return out;}
export async function createDatabase({data}){
 const mode=process.env.DATABASE_MODE||'sqlite';
 if(process.env.NODE_ENV==='production'&&mode!=='postgres')throw new Error('Produção exige DATABASE_MODE=postgres.');
 const statements=new Map();const context=new AsyncLocalStorage();let pool,sqlite,pglite;
 let queue=Promise.resolve();
 async function exclusive(fn){const prev=queue;let release;queue=new Promise(r=>release=r);await prev;try{return await fn();}finally{release();}}
 if(mode==='sqlite'){
  const {DatabaseSync}=await import('node:sqlite');mkdirSync(data,{recursive:true});sqlite=new DatabaseSync(join(data,'maker.sqlite'));sqlite.exec(readFileSync(new URL('./db/sqlite.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('./db/extensions.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('./db/finance.sql',import.meta.url),'utf8'));sqlite.prepare('INSERT OR IGNORE INTO settings VALUES(1,?)').run(JSON.stringify(initialSettings));
 }else if(mode==='postgres'){
  if(!process.env.DATABASE_URL)throw new Error('Configure DATABASE_URL no ambiente privado do servidor.');
  const {Pool}=await import('pg');
  const url=new URL(process.env.DATABASE_URL);
  if(url.searchParams.has('sslmode')&&url.searchParams.get('sslmode')!=='verify-full')throw new Error('Use TLS validado; remova sslmode ou use verify-full.');
  for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(k);
  const ssl={rejectUnauthorized:true,...(process.env.DATABASE_CA_FILE?{ca:readFileSync(process.env.DATABASE_CA_FILE,'utf8')}:{})};
  pool=new Pool({connectionString:url.toString(),ssl,max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,application_name:'maker3d'});
  pool.on('error',()=>console.error('Conexão de banco interrompida.'));
 }else if(mode==='pglite'&&process.env.NODE_ENV==='test'){
  const {PGlite}=await import('@electric-sql/pglite');pglite=new PGlite();
  await pglite.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await pglite.exec(readFileSync(new URL('./db/postgres.sql',import.meta.url),'utf8'));
  await pglite.exec(readFileSync(new URL('./db/extensions-postgres.sql',import.meta.url),'utf8'));
  await pglite.exec(readFileSync(new URL('./db/finance-postgres.sql',import.meta.url),'utf8'));
 }else throw new Error('Modo de banco inválido.');
 async function query(q,params=[]){
  if(sqlite){let stmt=statements.get(q);if(!stmt){stmt=sqlite.prepare(q);if(statements.size>=100)statements.delete(statements.keys().next().value);statements.set(q,stmt);}return /^\s*(SELECT|WITH)/i.test(q)?{rows:stmt.all(...params)}:{info:stmt.run(...params)};}
  if(!context.getStore())return withRequest(()=>query(q,params),false);
  return context.getStore().client.query(postgresSQL(q),params);
 }
 async function one(q,...p){return (await query(q,p)).rows[0];}
 async function all(q,...p){return (await query(q,p)).rows;}
 async function run(q,...p){
  if(sqlite)return (await query(q,p)).info;
  const returnsId=/^INSERT INTO (families|users|participants|projects|events|messages|files|payments|posts|post_media|audit_log|cash_entries|stock_lots|stock_uses)\b/i.test(q);
  const r=await query(q+(returnsId?' RETURNING id':''),p);return {lastInsertRowid:r.rows?.[0]?.id,changes:r.rowCount??r.affectedRows};
 }
 async function withRequest(fn,mutation=false){
  if(context.getStore())return fn();
  if(sqlite||pglite)return exclusive(async()=>{
   const client=pglite;
   const exec=async s=>sqlite?sqlite.exec(s):pglite.exec(s);
   await exec(mutation?'BEGIN':'BEGIN');
   try{if(pglite){await exec('SET LOCAL ROLE maker3d_app');await exec('SET LOCAL search_path = maker3d, pg_catalog');}const result=await context.run({client},fn);await exec('COMMIT');return result;}catch(e){await exec('ROLLBACK');throw e;}
  });
  const client=await pool.connect();
  try{
   await client.query('BEGIN');await client.query('SET LOCAL search_path = maker3d, pg_catalog');
   await client.query("SET LOCAL statement_timeout = '15s'");await client.query("SET LOCAL lock_timeout = '10s'");
   // The pilot has one printer and ten families. Serialize writes across app instances.
   // All status transitions and balance allocations commit atomically, before HTTP success.
   if(mutation)await client.query('SELECT pg_advisory_xact_lock(733031930)');
   const result=await context.run({client},fn);await client.query('COMMIT');return result;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
 const api={one,all,run,withRequest,transaction:fn=>withRequest(fn,true),close:async()=>{if(sqlite)sqlite.close();if(pool)await pool.end();if(pglite)await pglite.close();}};
 if(mode==='postgres'){
  const schema=await api.one("SELECT to_regclass('maker3d.user_preferences') AS profiles,to_regclass('maker3d.posts') AS posts,to_regclass('maker3d.audit_log') AS audit,to_regclass('maker3d.benefits') AS benefits,to_regclass('maker3d.guardian_contacts') AS contacts,to_regclass('maker3d.cash_entries') AS finance,to_regclass('maker3d.benefit_allocations') AS allocations,to_regclass('maker3d.team_permissions') AS permissions");
  if(!schema.profiles||!schema.posts||!schema.audit||!schema.benefits||!schema.contacts||!schema.finance||!schema.allocations||!schema.permissions){await api.close();throw new Error('Atualize o banco com a migração de perfis e db/benefits-upgrade.sql e db/finance-postgres.sql antes de iniciar.');}
 }
 if(mode==='postgres'&&process.env.NODE_ENV==='production'){const role=await api.one('SELECT current_user AS name');if(role.name!=='maker3d_app'){await api.close();throw new Error('Use o usuário dedicado maker3d_app na conexão de produção.');}}
 if(!sqlite)await api.withRequest(()=>run('INSERT INTO settings(id,value) VALUES(1,?) ON CONFLICT(id) DO NOTHING',JSON.stringify(initialSettings)),true);
 return api;
}
