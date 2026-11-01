import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {postgresSQL} from '../db.mjs';
test('parâmetros SQL não substituem interrogações em textos',()=>{assert.equal(postgresSQL("SELECT '?' as literal, ? as value, 'it''s ?' as escaped"),"SELECT '?' as literal, $1 as value, 'it''s ?' as escaped");});
test('Postgres: papel dedicado, RLS e rollback',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');await db.exec(readFileSync(new URL('../db/postgres.sql',import.meta.url),'utf8'));
 const rows=await db.query("SELECT relname,relrowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace WHERE nspname='maker3d' AND relkind='r'");assert.equal(rows.rows.length,11);assert.ok(rows.rows.every(r=>r.relrowsecurity));
 const upgrade=readFileSync(new URL('../db/extensions-postgres.sql',import.meta.url),'utf8');await db.exec(upgrade);await db.exec(upgrade);
 const finance=readFileSync(new URL('../db/finance-postgres.sql',import.meta.url),'utf8');await db.exec(finance);await db.exec(finance);
 const attribution=readFileSync(new URL('../db/attribution-postgres.sql',import.meta.url),'utf8');await db.exec(attribution);await db.exec(attribution);
 const billing=readFileSync(new URL('../db/billing-postgres.sql',import.meta.url),'utf8');await db.exec(billing);await db.exec(billing);
 const messaging=readFileSync(new URL('../db/messaging-postgres.sql',import.meta.url),'utf8');await db.exec(messaging);await db.exec(messaging);
 const upgraded=await db.query("SELECT relname,relrowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace WHERE nspname='maker3d' AND relkind='r'");assert.equal(upgraded.rows.length,35);assert.ok(upgraded.rows.every(r=>r.relrowsecurity));
 for(const role of['anon','authenticated']){await db.exec(`SET ROLE ${role}`);await assert.rejects(db.query('SELECT * FROM maker3d.users'),/permission denied/);await assert.rejects(db.query('SELECT * FROM maker3d.posts'),/permission denied/);await assert.rejects(db.query('SELECT * FROM maker3d.guardian_contacts'),/permission denied/);await assert.rejects(db.query('SELECT * FROM maker3d.benefits'),/permission denied/);await assert.rejects(db.query('SELECT * FROM maker3d.cash_entries'),/permission denied/);await assert.rejects(db.query('SELECT * FROM maker3d.staff_invites'),/permission denied/);await assert.rejects(db.query('SELECT * FROM maker3d.family_automation'),/permission denied/);await assert.rejects(db.query('SELECT * FROM maker3d.whatsapp_outbox'),/permission denied/);await db.exec('RESET ROLE');}
 await db.exec('SET ROLE maker3d_app');await db.exec('BEGIN');await db.query("INSERT INTO maker3d.families(name,created) VALUES('Teste de rollback','2026-10-30')");await db.exec('ROLLBACK');assert.equal((await db.query('SELECT count(*)::int n FROM maker3d.families')).rows[0].n,0);
 await assert.rejects(db.exec('CREATE TABLE maker3d.unauthorized(id int)'),/permission denied/);
});
