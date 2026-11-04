import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDatabase} from '../db.mjs';

// Leituras não abrem transação (uma ida a menos ao banco); gravações continuam atômicas.
test('Postgres: leitura sem BEGIN, gravação com transação e rollback',{skip:process.env.DATABASE_MODE!=='pglite'},async t=>{
 const data=await mkdtemp(join(tmpdir(),'maker-tx-')),db=await createDatabase({data});t.after(async()=>{await db.close();await rm(data,{recursive:true,force:true});});
 const pause=()=>new Promise(r=>setTimeout(r,15));
 const clock=()=>db.one('SELECT now()::text AS t').then(r=>r.t);
 const families=async()=>Number((await db.one('SELECT count(*) AS n FROM families')).n);
 // Leitura pura: cada comando fora de transação, então now() avança entre eles.
 const read=await db.withRequest(async()=>{const a=await clock();await pause();return [a,await clock()];});
 assert.notEqual(read[0],read[1]);
 // db.transaction: tudo numa transação só.
 const tx=await db.transaction(async()=>{const a=await clock();await pause();return [a,await clock()];});
 assert.equal(tx[0],tx[1]);
 // Gravação dentro de uma leitura abre a transação e desfaz tudo se a requisição falhar.
 const before=await families();
 await assert.rejects(db.withRequest(async()=>{await clock();await db.run("INSERT INTO families(name,created) VALUES('Rollback',?)",'2026-11-04');await db.transaction(()=>db.run("INSERT INTO families(name,created) VALUES('Rollback 2',?)",'2026-11-04'));throw new Error('falha');}),/falha/);
 assert.equal(await families(),before);
 // E confirma quando dá certo.
 await db.withRequest(async()=>{await db.run("INSERT INTO families(name,created) VALUES('Fica',?)",'2026-11-04');});
 assert.equal(await families(),before+1);
});
