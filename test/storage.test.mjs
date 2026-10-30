import test from 'node:test';
import assert from 'node:assert/strict';
import {createFileStorage} from '../storage.mjs';
test('Storage Supabase: bucket privado, envio imutável e download no servidor',async t=>{
 const originalFetch=globalThis.fetch,originalEnv={...process.env},calls=[];
 t.after(()=>{globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);});
 process.env.FILE_STORAGE='supabase';process.env.SUPABASE_URL='https://storage-test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test_fixture_not_a_real_key';
 globalThis.fetch=async(url,init={})=>{calls.push({url:String(url),method:init.method||'GET',headers:init.headers});
  if(String(url).includes('/bucket/'))return Response.json({id:'maker3d-projects',name:'maker3d-projects',public:false});
  if((init.method||'GET')==='GET')return new Response(new Uint8Array([1,2,3]));
  return Response.json({Key:'maker3d-projects/example'});
 };
 const files=await createFileStorage({data:'/tmp/unused'});await files.put('example',Buffer.from([1,2,3]));assert.deepEqual(await files.get('example'),Buffer.from([1,2,3]));await files.remove('example');assert.ok(calls.every(c=>c.url.includes('maker3d-projects')));assert.ok(calls.some(c=>c.method==='POST'));assert.ok(calls.some(c=>c.method==='DELETE'));
 globalThis.fetch=async()=>Response.json({id:'maker3d-projects',public:true});await assert.rejects(createFileStorage({data:'/tmp/unused'}),/privado/);
});
