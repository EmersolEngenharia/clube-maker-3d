// Recortes reais (elementos da interface) para animar. Nada é redesenhado.
import {createRequire} from 'node:module';import {writeFileSync} from 'node:fs';
const {chromium}=createRequire('/opt/node22/lib/node_modules/')('playwright');
const base='http://127.0.0.1:3180',o='notion/assets/cutouts/';
const browser=await chromium.launch({args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2});const p=await ctx.newPage();
await p.goto(base);await p.getByLabel('E-mail',{exact:true}).fill('helena@example.test');await p.getByLabel('Senha',{exact:true}).fill('Local-test-only-123');await p.getByRole('button',{name:'Entrar no meu espaço'}).click();await p.getByRole('heading',{name:/Olá, Helena/}).waitFor();
await p.evaluate(()=>fetch('/api/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Helena Souza Miranda',theme:'candy',avatar:'robot',experience:'guided'})}));await p.reload();await p.getByRole('heading',{name:/Olá, Helena/}).waitFor();
const meta={};
const snap=async(name,sel,idx=0)=>{const l=p.locator(sel).nth(idx);await l.scrollIntoViewIfNeeded();await p.waitForTimeout(150);await l.screenshot({path:o+name+'.png'});const b=await l.boundingBox();meta[name]={w:b.width,h:b.height};};
const head=async(n)=>{await snap(n+'-title','main h1');await snap(n+'-steps','.steps');await snap(n+'-card','.wizard .card');};
await p.getByRole('button',{name:'Criar projeto',exact:true}).click();await p.waitForTimeout(500);
await head('s1');
for(const[i,k]of['idea','file','link'].entries()){await p.locator(`.choice[data-kind="${k}"]`).click();await p.waitForTimeout(250);await snap('choice-'+k+'-on',`.choice[data-kind="${k}"]`);}
for(const k of['idea','file','link'])await p.locator(`.choice[data-kind="${k}"]`).click().then(()=>p.waitForTimeout(100));
await p.locator('.choice[data-kind="idea"]').click();await p.waitForTimeout(250);
for(const k of['idea','file','link'])await snap('choice-'+k+'-off',`.choice[data-kind="${k}"]`);
await p.locator('.choice[data-kind="idea"]').click();await p.waitForTimeout(250);await snap('s1-card-idea','.wizard .card');
await snap('btn-continuar','.wizard-controls .btn');
const flows={idea:async()=>{await p.getByLabel('Nome do projeto').fill('Porta-lápis foguete');await p.getByLabel('O que você quer criar?').fill('Um foguete azul para organizar os lápis da escrivaninha.');},
 file:async()=>{await p.getByLabel('Nome do projeto').fill('Suporte de fone');await p.getByLabel('O que você quer criar?').fill('Suporte para o fone de ouvido da mesa.');},
 link:async()=>{await p.getByLabel('Link da peça').fill('https://makerworld.com/pt/models/123456-porta-lapis');await p.getByLabel(/Para que você quer a peça/).fill('Para organizar os lápis da escrivaninha.');}};
for(const k of['idea','file','link']){
 await p.locator(`.choice[data-kind="${k}"]`).click();await p.waitForTimeout(200);
 await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.waitForTimeout(500);
 await head('s2-'+k+'-empty');await snap('s2-'+k+'-empty-card','.wizard .card');
 await flows[k]();await p.locator('h1').click();await p.waitForTimeout(300);await snap('s2-'+k+'-card','.wizard .card');
 if(k==='idea'){await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.waitForTimeout(500);await head('s3');await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.waitForTimeout(500);await head('s4');
  await p.getByRole('button',{name:'Voltar',exact:true}).click();await p.waitForTimeout(300);}
 await p.getByRole('button',{name:'Voltar',exact:true}).click();await p.waitForTimeout(400);
 await p.getByRole('button',{name:'Voltar',exact:true}).click().catch(()=>{});await p.waitForTimeout(300);
}
writeFileSync(o+'meta.json',JSON.stringify(meta,null,1));console.log(Object.keys(meta).join('\n'));await browser.close();
