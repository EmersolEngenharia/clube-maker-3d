import {createDatabase} from '../db.mjs';
import {randomBytes,scryptSync} from 'node:crypto';
const {MAKER_ADMIN_EMAIL:email,MAKER_ADMIN_NAME:name,MAKER_ADMIN_PASSWORD:password}=process.env;
if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||!password||password.length<6||password.length>200)throw new Error('Configure MAKER_ADMIN_EMAIL, MAKER_ADMIN_NAME e MAKER_ADMIN_PASSWORD (6+ caracteres) no ambiente privado.');
const db=await createDatabase({data:process.env.DATA_DIR||'data'});
try{await db.transaction(async()=>{
 if(await db.one('SELECT id FROM users LIMIT 1'))throw new Error('O clube já tem contas. Nenhuma conta foi alterada.');
 const salt=randomBytes(16).toString('hex'),hashed=salt+':'+scryptSync(password,salt,64).toString('hex');
 await db.run('INSERT INTO users(email,name,password,role) VALUES(?,?,?,?)',email.trim().toLowerCase(),name.trim(),hashed,'admin');
});console.log('Conta inicial criada. Remova MAKER_ADMIN_* do ambiente após este passo.');}finally{await db.close();}
