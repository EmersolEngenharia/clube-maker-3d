import {createRequire} from 'node:module';
const {chromium}=createRequire('/opt/node22/lib/node_modules/')('playwright');
const b=await chromium.launch({args:['--no-sandbox']});const p=await (await b.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:3})).newPage();
await p.goto('http://127.0.0.1:3180');await p.getByLabel('E-mail',{exact:true}).fill('helena@example.test');await p.getByLabel('Senha',{exact:true}).fill('Local-test-only-123');await p.getByRole('button',{name:'Entrar no meu espaço'}).click();await p.getByRole('heading',{name:/Olá, Helena/}).waitFor();
await p.getByRole('button',{name:'Criar projeto',exact:true}).click();await p.waitForTimeout(500);
await p.getByRole('button',{name:'Continuar',exact:true}).screenshot({path:'notion/assets/cutouts/btn-continuar.png'});
await p.getByRole('button',{name:'Sair',exact:true}).screenshot({path:'notion/assets/cutouts/btn-sair.png'});
await p.locator('.brand').first().screenshot({path:'notion/assets/brand/logo-lockup@3x.png'});
await b.close();
