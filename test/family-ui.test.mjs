import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function grab(source,name){
 const start=source.search(new RegExp('function '+name+'\\([^)]*\\)\\{'));
 if(start<0) throw new Error('Função não encontrada: '+name);
 let depth=0,end=start;
 for(;end<source.length;end++){
  if(source[end]==='{')depth++;
  else if(source[end]==='}'&&--depth===0){end++;break;}
 }
 return source.slice(start,end);
}

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ops=readFileSync(new URL('../public/operations.js',import.meta.url),'utf8');
const pick=state=>new Function('state',grab(app,'defaultParticipant')+'\nreturn defaultParticipant();')(state);
const contacts=members=>new Function('members','esc','adminUser','btn',grab(ops,'contactsHtml')+'\nreturn contactsHtml(members);')(members,v=>String(v??''),()=>false,(label,action)=>`<button data-action="${action}">${label}</button>`);

const people=(...rows)=>rows.map(([name,active=1])=>({name,active}));

test('o wizard preseleciona o perfil ativo, não o primeiro dependente',()=>{
 const participants=people(['Cyntia'],['Fábio'],['Inativo',0]);
 assert.equal(pick({user:{name:'Fabio',guardian:'Marina'},data:{participants}}),'Fábio');
 assert.equal(pick({user:{name:'  fábio  '},data:{participants}}),'Fábio');
 assert.equal(pick({user:{name:'Cyntia'},data:{participants}}),'Cyntia');
 assert.equal(pick({user:{name:'Marina'},data:{participants}}),'Marina');
 assert.equal(pick({user:{name:'Inativo'},data:{participants}}),'Inativo');
 assert.equal(pick({user:{name:'   '},data:{participants}}),'Cyntia');
 assert.equal(pick({user:{name:'Marina'},data:{participants:[]}}),'Marina');
 assert.equal(pick({user:{},data:{participants:people(['Cyntia'])}}),'Cyntia');
 assert.equal(pick({user:{name:'Ana'},data:{}}),'Ana');
});

test('o pedido da família continua no primeiro nome e o campo segue editável',()=>{
 assert.match(app,/participant:defaultParticipant\(\)/);
 assert.doesNotMatch(app,/participants\.find\(p=>p\.active!==0\)\?\.name/);
 assert.match(app,/forFamily:true,familyId:state\.data\.families\[0\]\.id,name:'',description:'',participant:''/);
 assert.match(app,/state\.wizard\.forFamily&&!state\.wizard\.participant\)state\.wizard\.participant=wizardNames\(\)\[0\]/);
 assert.match(app,/<input name="participant" value="\$\{esc\(w\.participant\)\}" required maxlength="80" list="participants">/);
 assert.doesNotMatch(app,/name="participant"[^>]*readonly/);
});

test('contatos ocultam contas automáticas sem tirar o Entrar como',()=>{
 const html=contacts([
  {id:1,name:'Marina',role:'guardian',email:'marina@exemplo.com',whatsapp:''},
  {id:2,name:'Cyntia',role:'learner',email:'dependente-2@maker3d.invalid'},
  {id:3,name:'Fabio',role:'learner',email:'Dependente-3@Maker3D.invalid'},
  {id:4,name:'Ana',role:'learner',email:'ana@maker3d.invalid.exemplo.com'}
 ]);
 assert.match(html,/Marina/);
 assert.match(html,/mailto:marina@exemplo.com/);
 assert.match(html,/Ana/);
 assert.match(html,/mailto:ana@maker3d\.invalid\.exemplo\.com/);
 assert.doesNotMatch(html,/Cyntia|Fabio|maker3d\.invalid</);
 assert.match(contacts([]),/Nenhum acesso cadastrado/);
 assert.match(contacts([{id:9,name:'Auto',role:'learner',email:'dependente-9@maker3d.invalid'}]),/Nenhum acesso cadastrado/);
 assert.match(ops,/Entrar como /);
 assert.match(ops,/'family-enter'/);
 assert.match(ops,/data-participant=/);
 assert.doesNotMatch(grab(ops,'contactsHtml'),/Entrar como/);
});
