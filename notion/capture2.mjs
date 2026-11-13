import {createRequire} from 'node:module';const {chromium}=createRequire('/opt/node22/lib/node_modules/')('playwright');
const base='http://127.0.0.1:3180',out='notion/assets/screens/';
const browser=await chromium.launch({args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});const p=await ctx.newPage();
await p.goto(base);await p.getByLabel('E-mail',{exact:true}).fill('helena@example.test');await p.getByLabel('Senha',{exact:true}).fill('Local-test-only-123');await p.getByRole('button',{name:'Entrar no meu espaço'}).click();await p.getByRole('heading',{name:/Olá, Helena/}).waitFor();
await p.evaluate(()=>fetch('/api/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Helena Souza Miranda',theme:'candy',avatar:'robot',experience:'guided'})}));await p.reload();await p.getByRole('heading',{name:/Olá, Helena/}).waitFor();
// logo
await p.locator('.brand').first().screenshot({path:'notion/assets/brand/logo-lockup.png'});
await p.locator('.brand-mark img').first().screenshot({path:'notion/assets/brand/rocket-icon.png'}).catch(()=>{});
const info=await p.evaluate(()=>{const cs=getComputedStyle(document.documentElement),b=getComputedStyle(document.body),btn=document.querySelector('.btn');return {theme:document.documentElement.dataset.theme,font:b.fontFamily,vars:Object.fromEntries(['--page','--ink','--green','--muted','--border','--lime','--soft','--hero','--orange','--navy','--turquoise','--sun','--flame'].map(v=>[v,cs.getPropertyValue(v).trim()])),btnBg:btn&&getComputedStyle(btn).backgroundColor,h1:getComputedStyle(document.querySelector('h1')||document.body).fontWeight}});
console.log(JSON.stringify(info,null,1));
const flow=async(kind,fill,tag)=>{
 await p.getByRole('button',{name:'Criar projeto',exact:true}).click();await p.waitForTimeout(400);
 await p.locator(`.choice[data-kind="${kind}"]`).click();await p.waitForTimeout(300);
 await p.locator('main').screenshot({path:out+`p-${tag}-1.png`});
 await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.waitForTimeout(500);
 await p.locator('main').screenshot({path:out+`p-${tag}-2.png`});
 await fill();await p.waitForTimeout(300);await p.locator('main').screenshot({path:out+`p-${tag}-2b.png`});
};
await flow('idea',async()=>{await p.getByLabel('Nome do projeto').fill('Porta-lápis foguete');await p.getByLabel('O que você quer criar?').fill('Um foguete azul para organizar os lápis da escrivaninha.');},'idea');
await p.getByRole('button',{name:'Voltar',exact:true}).click();await p.waitForTimeout(300);await p.getByRole('button',{name:'Sair',exact:true}).click();await p.waitForTimeout(500);
await flow('file',async()=>{await p.getByLabel('Nome do projeto').fill('Suporte de fone');await p.getByLabel('O que você quer criar?').fill('Suporte para o fone de ouvido da mesa.');},'file');
await p.getByRole('button',{name:'Voltar',exact:true}).click();await p.waitForTimeout(300);await p.getByRole('button',{name:'Sair',exact:true}).click();await p.waitForTimeout(500);
await flow('link',async()=>{await p.getByLabel('Link da peça').fill('https://makerworld.com/pt/models/123456-porta-lapis');await p.getByLabel(/Para que você quer a peça/).fill('Para organizar os lápis da escrivaninha.');},'link');
await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.waitForTimeout(600);await p.locator('main').screenshot({path:out+'p-link-3.png'});
await browser.close();
