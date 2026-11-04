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
  const {DatabaseSync}=await import('node:sqlite');mkdirSync(data,{recursive:true});sqlite=new DatabaseSync(join(data,'maker.sqlite'));sqlite.exec(readFileSync(new URL('./db/sqlite.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('./db/extensions.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('./db/finance.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('./db/attribution.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('./db/billing.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('./db/messaging.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('./db/models.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('./db/gallery.sql',import.meta.url),'utf8'));sqlite.prepare('INSERT OR IGNORE INTO settings VALUES(1,?)').run(JSON.stringify(initialSettings));
 }else if(mode==='postgres'){
  if(!process.env.DATABASE_URL)throw new Error('Configure DATABASE_URL no ambiente privado do servidor.');
  const {Pool}=await import('pg');
  const url=new URL(process.env.DATABASE_URL);
  if(url.searchParams.has('sslmode')&&url.searchParams.get('sslmode')!=='verify-full')throw new Error('Use TLS validado; remova sslmode ou use verify-full.');
  for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(k);
  const ssl={rejectUnauthorized:true,...(process.env.DATABASE_CA_FILE?{ca:readFileSync(process.env.DATABASE_CA_FILE,'utf8')}:{})};
  // The database is remote: opening a TLS connection costs several round trips, so keep a warm connection
  // and recycle connections slowly instead of closing them after 30 s of idleness.
  pool=new Pool({connectionString:url.toString(),ssl,max:5,min:1,connectionTimeoutMillis:10000,idleTimeoutMillis:Number(process.env.DATABASE_IDLE_MS||300000),maxLifetimeSeconds:1800,keepAlive:true,application_name:'maker3d'});
  pool.on('error',()=>console.error('Conexão de banco interrompida.'));
  // Session pooler (5432): settings persist for the connection. The query is queued before any request query.
  pool.on('connect',c=>{c.query("SET search_path = maker3d, pg_catalog; SET statement_timeout = '15s'; SET lock_timeout = '10s';").catch(()=>console.error('Falha ao configurar conexão de banco.'));});
 }else if(mode==='pglite'&&process.env.NODE_ENV==='test'){
  const {PGlite}=await import('@electric-sql/pglite');pglite=new PGlite();
  await pglite.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await pglite.exec(readFileSync(new URL('./db/postgres.sql',import.meta.url),'utf8'));
  await pglite.exec(readFileSync(new URL('./db/extensions-postgres.sql',import.meta.url),'utf8'));
  await pglite.exec(readFileSync(new URL('./db/finance-postgres.sql',import.meta.url),'utf8'));
  await pglite.exec(readFileSync(new URL('./db/attribution-postgres.sql',import.meta.url),'utf8'));
  await pglite.exec(readFileSync(new URL('./db/billing-postgres.sql',import.meta.url),'utf8'));
  await pglite.exec(readFileSync(new URL('./db/messaging-postgres.sql',import.meta.url),'utf8'));
  await pglite.exec(readFileSync(new URL('./db/models-postgres.sql',import.meta.url),'utf8'));
  await pglite.exec(readFileSync(new URL('./db/gallery-postgres.sql',import.meta.url),'utf8'));
  await pglite.exec('SET ROLE maker3d_app; SET search_path = maker3d, pg_catalog;');
 }else throw new Error('Modo de banco inválido.');
 // Pure reads run without BEGIN: under READ COMMITTED each statement already takes its own
 // snapshot, and every BEGIN is one more trip to the remote database (~0.15 s France ↔ São Paulo).
 // The first write in a request, or db.transaction(), opens the transaction before it runs; from
 // there on commit/rollback and the write lock work exactly as before.
 const pureRead=q=>/^\s*SELECT\b/i.test(q)&&!/\bFOR\s+(UPDATE|SHARE|NO\s+KEY|KEY\s+SHARE)\b|pg_advisory|nextval|setval/i.test(q);
 async function begin(store,lock){if(store.tx)return;store.tx=true;await store.exec(lock&&pool?'BEGIN; SELECT pg_advisory_xact_lock(733031930);':'BEGIN');}
 async function inRequest(store,fn,mutation){
  try{if(mutation)await begin(store,true);const result=await context.run(store,fn);if(store.tx)await store.exec('COMMIT');return result;}
  catch(e){if(store.tx)await store.exec('ROLLBACK');throw e;}
 }
 async function query(q,params=[]){
  if(sqlite){let stmt=statements.get(q);if(!stmt){stmt=sqlite.prepare(q);if(statements.size>=100)statements.delete(statements.keys().next().value);statements.set(q,stmt);}return /^\s*(SELECT|WITH)/i.test(q)?{rows:stmt.all(...params)}:{info:stmt.run(...params)};}
  const store=context.getStore();
  if(!store)return withRequest(()=>query(q,params),false);
  if(!pureRead(q))await begin(store,false);
  return store.client.query(postgresSQL(q),params);
 }
 async function one(q,...p){return (await query(q,p)).rows[0];}
 async function all(q,...p){return (await query(q,p)).rows;}
 async function run(q,...p){
  if(sqlite)return (await query(q,p)).info;
  const returnsId=/^INSERT INTO (families|users|participants|projects|events|messages|files|payments|posts|post_media|audit_log|cash_entries|stock_lots|stock_uses|gallery_items)\b/i.test(q);
  const r=await query(q+(returnsId?' RETURNING id':''),p);return {lastInsertRowid:r.rows?.[0]?.id,changes:r.rowCount??r.affectedRows};
 }
 async function withRequest(fn,mutation=false){
  const current=context.getStore();
  if(current){if(mutation)await begin(current,true);return fn();}
  if(sqlite)return exclusive(async()=>{sqlite.exec('BEGIN');try{const result=await context.run({tx:true},fn);sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}});
  if(pglite)return exclusive(()=>inRequest({client:pglite,exec:s=>pglite.exec(s),tx:false},fn,mutation));
  // search_path and timeouts are set once per connection (pool 'connect'); mutations keep
  // BEGIN + advisory lock in a single round trip.
  const client=await pool.connect();
  try{return await inRequest({client,exec:s=>client.query(s),tx:false},fn,mutation);}finally{client.release();}
 }
 async function snapshot(specs){
  if(sqlite){const result={};for(const [key,spec]of Object.entries(specs))result[key]=await all(spec.sql,...(spec.params||[]));return result;}
  const params=[],fields=[];
  for(const [key,spec]of Object.entries(specs)){
   if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key))throw new Error('Invalid snapshot key');
   fields.push("'"+key+"', (SELECT COALESCE(jsonb_agg(to_jsonb(snapshot_row)), '[]'::jsonb) FROM ("+spec.sql+") snapshot_row)");params.push(...(spec.params||[]));
  }
  return (await one('SELECT jsonb_build_object('+fields.join(',')+') AS payload',...params)).payload;
 }
 const api={one,all,run,snapshot,withRequest,transaction:fn=>withRequest(fn,true),close:async()=>{if(sqlite)sqlite.close();if(pool)await pool.end();if(pglite)await pglite.close();}};
 if(mode==='postgres'){
  const schema=await api.one("SELECT to_regclass('maker3d.user_preferences') AS profiles,to_regclass('maker3d.posts') AS posts,to_regclass('maker3d.audit_log') AS audit,to_regclass('maker3d.benefits') AS benefits,to_regclass('maker3d.guardian_contacts') AS contacts,to_regclass('maker3d.cash_entries') AS finance,to_regclass('maker3d.benefit_allocations') AS allocations,to_regclass('maker3d.team_permissions') AS permissions,to_regclass('maker3d.cash_attributions') AS attributions,to_regclass('maker3d.billing_contracts') AS billing,to_regclass('maker3d.family_automation') AS automation,to_regclass('maker3d.whatsapp_outbox') AS outbox,to_regclass('maker3d.broadcast_deliveries') AS broadcasts,to_regclass('maker3d.message_extras') AS extras,to_regclass('maker3d.model_links') AS models,to_regclass('maker3d.gallery_items') AS gallery");
  if(!schema.profiles||!schema.posts||!schema.audit||!schema.benefits||!schema.contacts||!schema.finance||!schema.allocations||!schema.permissions||!schema.attributions||!schema.billing||!schema.automation||!schema.outbox||!schema.broadcasts||!schema.extras||!schema.models||!schema.gallery){await api.close();throw new Error('Atualize o banco com a migração de perfis e db/benefits-upgrade.sql e db/finance-postgres.sql e db/attribution-postgres.sql e db/billing-postgres.sql e db/messaging-postgres.sql (incluindo comunicados e anexos da conversa) e db/models-postgres.sql antes de iniciar.');}
 }
 if(mode==='postgres'&&process.env.NODE_ENV==='production'){const role=await api.one('SELECT current_user AS name');if(role.name!=='maker3d_app'){await api.close();throw new Error('Use o usuário dedicado maker3d_app na conexão de produção.');}}
 if(!sqlite)await api.withRequest(()=>run('INSERT INTO settings(id,value) VALUES(1,?) ON CONFLICT(id) DO NOTHING',JSON.stringify(initialSettings)),true);
 return api;
}
