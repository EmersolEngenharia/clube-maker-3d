// Captura telas reais do portal (instância local, banco temporário) para o vídeo manual.
import {createRequire} from 'node:module';const {chromium}=createRequire('/opt/node22/lib/node_modules/')('playwright');
const base='http://127.0.0.1:3180',out='notion/assets/screens/',pw='Local-test-only-123';
const browser=await chromium.launch({args:['--no-sandbox']});
const team=await browser.newContext({viewport:{width:1440,height:900}}),fam=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
const a=await team.newPage(),p=await fam.newPage();
await a.goto(base);await a.getByLabel('Seu nome').fill('Equipe Maker');await a.getByLabel('E-mail',{exact:true}).fill('equipe@example.test');await a.getByLabel('Senha',{exact:true}).fill(pw);await a.getByRole('button',{name:'Preparar meu clube'}).click();await a.getByRole('button',{name:'Famílias',exact:true}).waitFor();
await a.getByRole('button',{name:'Famílias',exact:true}).click();await a.getByRole('button',{name:'Nova família',exact:true}).click();await a.getByLabel('Nome da família').fill('Família Souza Miranda');await a.getByRole('button',{name:'Cadastrar família',exact:true}).click();await a.getByRole('button',{name:'Gerar convite',exact:true}).click();await a.getByRole('button',{name:'Gerar link de convite'}).click();const link=await a.locator('#invite-link').inputValue();
await p.goto(link);await p.getByLabel('Seu nome').fill('Helena Souza Miranda');await p.getByLabel('E-mail',{exact:true}).fill('helena@example.test');await p.getByLabel('Senha',{exact:true}).fill(pw);await p.getByRole('button',{name:'Criar minha conta'}).click();await p.getByRole('heading',{name:/Olá, Helena/}).waitFor();
await p.evaluate(()=>fetch('/api/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Helena Souza Miranda',theme:'candy',avatar:'robot',experience:'guided'})}));
await p.reload();await p.getByRole('heading',{name:/Olá, Helena/}).waitFor();await p.waitForTimeout(600);
const shot=async(n,loc)=>{await p.waitForTimeout(500);await (loc?p.locator(loc):p).screenshot({path:out+n+'.png'});console.log('ok',n);};
await shot('00-home');
await p.getByRole('button',{name:'Criar projeto',exact:true}).click();await p.waitForTimeout(500);await shot('01-comecar');
const card=(k)=>p.locator(`.choice[data-kind="${k}"]`);
for(const k of['idea','file','link']){await card(k).click();await shot('01-comecar-'+k);}
await card('link').click();
const next=async()=>{await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.waitForTimeout(500);};
// Caminho 1: ideia
await card('idea').click();await next();await shot('02-ideia');
await p.getByLabel('Nome do projeto').fill('Porta-lápis foguete');await p.getByLabel('O que você quer criar?').fill('Um foguete azul para organizar os lápis da escrivaninha.');await shot('02-ideia-preenchida');
await next();await shot('03-detalhes');
await p.getByRole('button',{name:'Continuar',exact:true}).click().catch(()=>{});await p.waitForTimeout(500);await shot('04-revisar');
// Caminho 2: arquivo
await p.getByRole('button',{name:'Sair',exact:true}).click().catch(()=>{});await p.waitForTimeout(500);
await shot('after-sair');
await browser.close();
