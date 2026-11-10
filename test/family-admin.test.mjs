import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
// The club owner is an administrator and also the guardian of a family: he approves his own family's orders.
test('administrador que é responsável da família aprova o pedido da própria família',async t=>{
 if((process.env.DATABASE_MODE||'sqlite')!=='sqlite')return;
 const dir=await mkdtemp(join(tmpdir(),'maker-famadmin-')),child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:dir,PORT:'3171',HOST:'127.0.0.1',MODEL_LOOKUP:'off'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(dir,{recursive:true,force:true});});
 await once(child.stdout,'data');
 const base='http://127.0.0.1:3171';
 function client(){let cookie='';return async(path,b,expected=200)=>{const r=await fetch(base+'/api'+path,{method:b===undefined?'GET':'POST',headers:{...(b===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},body:b===undefined?undefined:JSON.stringify(b)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const j=await r.json();assert.equal(r.status,expected,`${path}: ${JSON.stringify(j)}`);return j;};}
 const admin=client(),kid=client();
 await admin('/setup',{name:'Dono',email:'dono@x.test',password:'ideias'});
 const fam=await admin('/families',{name:'Miranda',plan:'monthly'}),other=await admin('/families',{name:'Outra',plan:'monthly'});
 const inv=await admin('/invites',{familyId:fam.id,role:'learner'});await kid('/register',{token:inv.token,name:'Helena',email:'h@x.test',password:'ideias'});
 const sql=new DatabaseSync(join(dir,'maker.sqlite'));sql.prepare('UPDATE users SET family_id=? WHERE id=1').run(fam.id);sql.close();
 const fil=[{material:'PLA',color:'Branco',grams:9}],start=(await kid('/schedule/suggest?minutes=32')).suggestions[0];
 const {id}=await kid('/schedule/bookings',{name:'Capivara',participant:'Helena',quantity:1,minutes:32,filaments:fil,startsAt:start});
 await kid(`/projects/${id}/approve`,{total:216,included:32},403);
 const p=await admin(`/projects/${id}`);assert.equal(p.status,'approval');
 await admin(`/projects/${id}/approve`,{total:p.quote.total,included:p.quote.included});
 assert.equal((await admin(`/projects/${id}`)).status,'queued');
 // Still only for his own family.
 const inv2=await admin('/invites',{familyId:other.id,role:'learner'}),k2=client();await k2('/register',{token:inv2.token,name:'Outro',email:'o@x.test',password:'ideias'});
 const s2=(await k2('/schedule/suggest?minutes=30')).suggestions[0],b2=await k2('/schedule/bookings',{name:'Peça',participant:'Outro',quantity:1,minutes:30,filaments:fil,startsAt:s2});
 const q2=(await admin(`/projects/${b2.id}`)).quote;await admin(`/projects/${b2.id}/approve`,{total:q2.total,included:q2.included},403);
});
