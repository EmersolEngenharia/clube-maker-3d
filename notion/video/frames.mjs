// uso: node frames.mjs h|v out.png t1 t2 ...
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
const {chromium}=createRequire('/opt/node22/lib/node_modules/')('playwright');
const [fmt,outPat,...ts]=process.argv.slice(2);
const W=fmt==='v'?1080:1920,H=fmt==='v'?1920:1080;
const b=await chromium.launch({args:['--no-sandbox','--allow-file-access-from-files']});
const p=await b.newPage({viewport:{width:W,height:H}});
p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CON',m.text())});
await p.goto(pathToFileURL(resolve('video/index.html')).href+'?fmt='+fmt);
await p.waitForFunction(()=>window.READY&&[...document.images].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:20000});
for(const t of ts){await p.evaluate(t=>seek(t),+t);await p.screenshot({path:outPat.replace('%t',(+t).toFixed(2))});}
await b.close();
