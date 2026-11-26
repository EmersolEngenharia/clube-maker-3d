// uso: node render.mjs h|v outDir startFrame endFrame  (30 fps)
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';import {mkdirSync} from 'node:fs';
const {chromium}=createRequire('/opt/node22/lib/node_modules/')('playwright');
const [fmt,dir,a,bb]=process.argv.slice(2);mkdirSync(dir,{recursive:true});
const W=fmt==='v'?1080:1920,H=fmt==='v'?1920:1080;
const b=await chromium.launch({args:['--no-sandbox','--allow-file-access-from-files']});
const p=await b.newPage({viewport:{width:W,height:H}});
await p.goto(pathToFileURL(resolve('video/index.html')).href+'?fmt='+fmt);
await p.waitForFunction(()=>window.READY&&[...document.images].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:30000});
for(let f=+a;f<+bb;f++){await p.evaluate(t=>seek(t),f/30);await p.screenshot({path:`${dir}/f${String(f).padStart(5,'0')}.jpg`,type:'jpeg',quality:94});}
await b.close();
