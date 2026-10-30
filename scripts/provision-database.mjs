// Run once on the VPS with credentials supplied in a private environment file.
// Never pass secrets on command-line arguments or commit the environment file.
import {Pool} from 'pg';
import {readFileSync} from 'node:fs';
const connectionString=process.env.DATABASE_ADMIN_URL,password=process.env.MAKER_DATABASE_PASSWORD;
if(!connectionString||!password||password.length<24||password.length>200)throw new Error('Configure DATABASE_ADMIN_URL e MAKER_DATABASE_PASSWORD (24+ caracteres) no ambiente privado.');
const url=new URL(connectionString);
for(const k of['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(k);
const pool=new Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true,...(process.env.DATABASE_CA_FILE?{ca:readFileSync(process.env.DATABASE_CA_FILE,'utf8')}:{})},max:1,connectionTimeoutMillis:10000});
try{
 const r=await pool.query("SELECT rolname,rolcanlogin,rolbypassrls FROM pg_roles WHERE rolname='maker3d_app'");
 if(!r.rows.length)throw new Error('Aplique primeiro a migração maker3d.');
 if(r.rows[0].rolcanlogin)throw new Error('Acesso já provisionado. Nenhuma senha foi alterada.');
 if(r.rows[0].rolbypassrls)throw new Error('O papel deve ter NOBYPASSRLS.');
 const literal="'"+password.replaceAll("'","''")+"'";
 await pool.query('ALTER ROLE maker3d_app LOGIN PASSWORD '+literal);
 console.log('Acesso dedicado maker3d_app habilitado. Nenhuma credencial foi impressa.');
}finally{await pool.end();}
