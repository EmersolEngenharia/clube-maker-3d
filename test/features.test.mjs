import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {monthlyUsage} from '../domain.mjs';

test('bateria separa uso, reservas, extras e filamento pelo mês de aprovação',()=>{
 const month='2026-10',base={period:month,extra_rate:600,material_rate:12000};
 const b=monthlyUsage([
  {...base,status:'completed',minutes:900,actual_minutes:840,included:720,used:720,grams:100,actual_grams:80},
  {...base,status:'queued',minutes:60,included:0,grams:10},
  {...base,status:'failed',minutes:999,included:0,used:0,grams:999},
  {...base,status:'completed',period:'2026-09',minutes:60,included:60,used:60,grams:10}
 ],720,month);
 assert.equal(b.available,0);assert.equal(b.extraMinutes,120);assert.equal(b.extraCost,1200);assert.equal(b.materialCost,960);assert.equal(b.total,2160);assert.equal(b.pendingExtra,600);assert.equal(b.pendingMaterial,120);
 assert.equal(monthlyUsage([],0,month).available,0);
 const capped=monthlyUsage([{...base,status:'ready',minutes:60,included:30,used:30,actual_minutes:90,grams:10,actual_grams:20}],30,month);
 assert.equal(capped.extraCost,300);assert.equal(capped.materialCost,120);assert.equal(capped.actualMinutes,90);
});

test('perfis, famílias, equipe, convites e publicações com autorização',async t=>{
 const data=await mkdtemp(join(tmpdir(),'maker-features-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:data,PORT:'3168',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(data,{recursive:true,force:true});});
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Servidor não iniciou.');})]);
 const base='http://127.0.0.1:3168',pass='Testing123!';
 function client(){let cookie='';const raw=async(path,b,headers={})=>{const r=await fetch(base+path,{method:b===undefined?'GET':'POST',headers:{...(b===undefined?{}:{'Content-Type':'application/json'}),Cookie:cookie,...headers},body:b===undefined?undefined:JSON.stringify(b)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;};const call=async(path,b,status=200)=>{const r=await raw('/api'+path,b),value=await r.json();assert.equal(r.status,status,`${path}: ${JSON.stringify(value)}`);return value;};call.raw=raw;return call;}
 const admin=client(),guardian=client(),learner=client(),other=client(),anon=client();
 await admin('/setup',{name:'Admin',email:'admin@test.example',password:pass});
 const f=await admin('/families',{name:'Família Um',plan:'monthly'}),f2=await admin('/families',{name:'Família Dois',plan:'annual'});
 async function register(c,role,email,family=f.id){const inv=await admin('/invites',{familyId:family,role});await c('/register',{token:inv.token,name:email,email,password:pass,avatar:'cat',theme:'ocean'});return (await c('/session')).user;}
 const g=await register(guardian,'guardian','guardian@test.example'),l=await register(learner,'learner','learner@test.example');await register(other,'guardian','other@test.example',f2.id);
 await t.test('WhatsApp privado, horas concedidas e cupom de uso único',async()=>{
  await guardian('/profile',{name:'Responsável',theme:'ocean',avatar:'cat',experience:'guided',whatsapp:'(64) 99999-1234'});
  assert.equal((await guardian('/session')).user.whatsapp,'5564999991234');
  await guardian('/profile',{name:'Responsável',whatsapp:'abc'},400);
  const before=(await guardian('/dashboard')).balance.available;
  await guardian('/benefits',{familyId:f.id,kind:'hours',value:60,reason:'Bônus'},403);
  await admin('/benefits',{familyId:f.id,kind:'hours',value:60,reason:'Presente'});
  assert.equal((await guardian('/dashboard')).balance.available,before+60);
  assert.equal((await admin('/dashboard')).families.find(x=>x.id===f.id).balance.available,before+60);
  await admin('/benefits',{familyId:f.id,kind:'discount',value:3000,reason:'Boas-vindas',code:'BEMVINDO'});
  await admin('/benefits',{familyId:f.id,kind:'discount',value:3000,reason:'Duplicado',code:'BEMVINDO'},400);
  await admin('/payments',{familyId:f2.id,description:'Mensalidade',cents:12000,gross:15000,coupon:'BEMVINDO'},400);
  await admin('/payments',{familyId:f.id,description:'Mensalidade',cents:15000,gross:15000,coupon:'BEMVINDO'},400);
  await admin('/payments',{familyId:f.id,description:'Mensalidade',cents:12000,gross:15000,coupon:'BEMVINDO'});
  await admin('/payments',{familyId:f.id,description:'Mensalidade',cents:12000,gross:15000,coupon:'BEMVINDO'},400);
  assert.equal((await guardian('/dashboard')).payments[0].cents,12000);
 });
 const png={name:'foto.png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jm1sAAAAASUVORK5CYII='};
 await t.test('preferências persistem e fotos são privadas',async()=>{
  assert.equal((await guardian('/session')).user.theme,'ocean');
  await guardian('/profile',{name:'Marina',theme:'space',avatar:'rocket',experience:'compact'});
  await guardian('/profile',{name:'Marina',theme:'invalid',avatar:'rocket'},400);
  assert.equal((await guardian('/session')).user.theme,'space');
  await guardian('/profile/photo',{name:'fake.jpg',data:Buffer.from('<script>bad</script>').toString('base64')},400);
  await guardian('/profile/photo',png);assert.equal((await guardian('/session')).user.has_photo,1);
  assert.equal((await guardian.raw(`/api/avatars/${g.id}`)).headers.get('content-type'),'image/png');
  assert.equal((await other.raw(`/api/avatars/${g.id}`)).status,404);
  assert.equal((await anon.raw(`/api/avatars/${g.id}`)).status,401);
 });
 await t.test('nomes, plano, franquia e participantes editáveis sem alterar histórico',async()=>{
  await admin(`/families/${f.id}/edit`,{name:'Família Criativa',plan:'annual',allowance:900});
  await guardian(`/families/${f.id}/edit`,{name:'Família Marina',plan:'monthly',allowance:60000});
  const own=(await guardian('/dashboard')).family;assert.equal(own.allowance,900);assert.equal(own.plan,'annual');
  await other(`/families/${f.id}/edit`,{name:'Intruso'},403);await learner(`/families/${f.id}/edit`,{name:'Intruso'},403);
  const p=await admin('/dependents',{familyId:f.id,name:'Ana',ageGroup:'child'});
  await guardian('/dependents',{id:p.id,familyId:f.id,name:'Ana Maria',ageGroup:'teen',notes:'Gosta de foguetes',active:false});
  assert.equal((await guardian('/dashboard')).participants[0].active,0);
  await other('/dependents',{id:p.id,familyId:f2.id,name:'Teste'},404);
  await learner('/dependents',{familyId:f.id,name:'Teste'},403);
  await admin(`/members/${g.id}`,{name:'Marina Maker'});assert.equal((await guardian('/session')).user.name,'Marina Maker');
 });
 await t.test('equipe mantém família, exige administrador e revoga sessões',async()=>{
  await guardian(`/team/${l.id}`,{enabled:true},403);
  await admin(`/team/${g.id}`,{enabled:true});await guardian('/dashboard',undefined,401);
  await guardian('/login',{email:g.email,password:pass});const session=(await guardian('/session')).user;
  assert.ok(session.is_staff);assert.equal(session.family_id,f.id);assert.equal(session.role,'guardian');
  assert.equal((await guardian('/dashboard')).families.length,2);
  await guardian('/settings',{},403);await guardian(`/team/${l.id}`,{enabled:true},403);
  const p=await other('/projects',{name:'Outro',description:'Teste',participant:'Outro',color:'Azul',size:'Pequeno',quantity:1});await other(`/projects/${p.id}/submit`,{});
  await guardian(`/projects/${p.id}/quote`,{minutes:60,grams:10,material:'PLA',note:'Operação da equipe'});
  const q=(await other(`/projects/${p.id}`)).quote;
  await guardian(`/projects/${p.id}/approve`,{included:q.included,total:q.total},403);
  await guardian(`/projects/${p.id}/revise`,{},403);
  await admin(`/team/${g.id}`,{enabled:false});await guardian('/dashboard',undefined,401);await guardian('/login',{email:g.email,password:pass});
  await guardian(`/projects/${p.id}`,undefined,404);
  assert.ok((await admin('/team')).audit.some(a=>a.action==='team.grant'));
 });
 await t.test('convite de inscrição é limitado, pode ser encerrado e cria família',async()=>{
  const inv=await admin('/enrollment-invites',{label:'Oficina maker',maxUses:1,days:7});
  assert.equal((await anon('/enrollment?token='+inv.token)).hours,12);
  const newcomer=client(),entry={token:inv.token,name:'Novo',familyName:'Família Nova',email:'novo@test.example',password:pass,plan:'monthly',responsible:true};
  await newcomer('/enroll',{...entry,responsible:false},400);
  await newcomer('/enroll',entry);assert.equal((await newcomer('/dashboard')).family.name,'Família Nova');
  await anon('/enroll',{...entry,email:'another@test.example'},410);
  await anon('/enrollment?token='+inv.token,undefined,410);
  const revoke=await admin('/enrollment-invites',{label:'Encerrar',days:1,maxUses:1});
  const list=(await admin('/enrollment-invites')).invites;const item=list.find(i=>i.label==='Encerrar');
  await admin('/enrollment-invites/revoke',{id:item.token});await anon('/enrollment?token='+revoke.token,undefined,410);
 });
 await t.test('aprendiz envia mídia privada, responsável autoriza e equipe revisa',async()=>{
  const p=await learner('/posts',{title:'Meu foguete',body:'Aprendi a modelar.',details:{product:'Foguete',channels:['Instagram'],priceCents:2500}});
  await other(`/posts/${p.id}`,undefined,404);
  await learner(`/posts/${p.id}/media`,{name:'fake.mp4',data:'aGVsbG8='},400);
  await learner(`/posts/${p.id}/media`,png);
  const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom000000000000')]);
  await learner(`/posts/${p.id}/media`,{name:'clip.mp4',data:mp4.toString('base64')});
  const post=await learner(`/posts/${p.id}`),photo=post.media[0],video=post.media[1];
  assert.equal((await other.raw('/api/post-media/'+photo.id)).status,404);
  const ranged=await guardian.raw('/api/post-media/'+video.id,undefined,{Range:'bytes=0-7'});assert.equal(ranged.status,206);assert.equal((await ranged.arrayBuffer()).byteLength,8);
  await learner(`/posts/${p.id}/submit`,{});assert.equal((await guardian(`/posts/${p.id}`)).status,'guardian');
  await learner(`/posts/${p.id}/authorize`,{consent:true},403);await other(`/posts/${p.id}/authorize`,{consent:true},404);await admin(`/posts/${p.id}/approve`,{},400);
  await guardian(`/posts/${p.id}/authorize`,{consent:false},400);await guardian(`/posts/${p.id}/authorize`,{consent:true});
  await learner(`/posts/${p.id}/media`,png,400);await admin(`/posts/${p.id}/approve`,{});assert.equal((await learner(`/posts/${p.id}`)).status,'approved');
  await learner(`/posts/${p.id}/edit`,{title:'Modificado',body:'Novo conteúdo'});const edited=await guardian(`/posts/${p.id}`);assert.equal(edited.status,'draft');assert.equal(edited.consent_by,null);
  await learner(`/posts/${p.id}/remove`,{mediaId:photo.id});assert.equal((await learner(`/posts/${p.id}`)).media.length,1);assert.equal((await learner.raw('/api/post-media/'+photo.id)).status,404);
  await learner(`/posts/${p.id}/submit`,{});await guardian(`/posts/${p.id}/authorize`,{consent:true});await guardian(`/posts/${p.id}/return`,{});assert.equal((await learner(`/posts/${p.id}`)).consent_by,null);
 });
 await t.test('conteúdos vazios não são enviados e listas usam cursor',async()=>{
  const empty=await guardian('/posts',{});await guardian(`/posts/${empty.id}/submit`,{consent:true},400);
  for(let i=0;i<21;i++)await guardian('/posts',{title:'Rascunho '+i});
  const first=await guardian('/posts'),second=await guardian('/posts?before='+first.next);
  assert.equal(first.posts.length,20);assert.ok(first.next);assert.ok(second.posts.every(p=>p.id<first.next));
  assert.equal((await other('/posts')).posts.length,0);
 });
 await t.test('arquivos estáticos usam ETag sem cache privado',async()=>{
  const first=await anon.raw('/themes.css'),etag=first.headers.get('etag');assert.ok(etag);
  assert.equal((await anon.raw('/themes.css',undefined,{'If-None-Match':etag})).status,304);
  assert.equal((await guardian.raw('/api/dashboard')).headers.get('cache-control'),'no-store');
 });
});
