import test from 'node:test';
import assert from 'node:assert/strict';
import {parseModelLink,licenseLevel,lookupModel} from '../models.mjs';

test('links de sites de modelos 3D',()=>{
 const mw=parseModelLink('https://makerworld.com/pt/models/123456-caixa-organizadora?from=search#profileId-98765');
 assert.deepEqual(mw,{site:'makerworld',siteName:'MakerWorld',url:'https://makerworld.com/pt/models/123456-caixa-organizadora#profileId-98765',modelId:'123456',profileId:'98765',supported:false});
 assert.equal(parseModelLink('https://makerworld.com/models/42').profileId,null);
 const pr=parseModelLink('Olha essa peça: https://www.printables.com/pt/model/3161-3d-benchy/files');
 assert.equal(pr.url,'https://www.printables.com/model/3161');assert.equal(pr.supported,true);
 assert.equal(parseModelLink('thingiverse.com/thing:763622/files').url,'https://www.thingiverse.com/thing:763622');
 assert.equal(parseModelLink('https://cults3d.com/en/3d-model/various/3dbenchy').modelId,'3dbenchy');
 assert.equal(parseModelLink('https://thangs.com/designer/Ana/3d-model/Vaso-123').modelId,'123');
 const other=parseModelLink('http://exemplo.com.br/peca?id=1#topo');
 assert.deepEqual([other.site,other.siteName,other.url],['other','exemplo.com.br','https://exemplo.com.br/peca?id=1']);
 for(const bad of['','texto sem link','https://makerworld.com/pt','https://www.printables.com/','https://user:senha@exemplo.com/x','https://127.0.0.1/x','javascript:alert(1)'])assert.throws(()=>parseModelLink(bad),e=>e.status===400,bad);
});

test('licenças que pedem conferência da equipe',()=>{
 assert.equal(licenseLevel('Creative Commons — Public Domain'),'open');
 assert.equal(licenseLevel('Creative Commons — Atribuição'),'open');
 for(const l of['Creative Commons — Attribution — Noncommercial','CC BY-NC-SA','Standard Digital File License','All rights reserved','Creative Commons — Atribuição-NãoComercial'])assert.equal(licenseLevel(l),'restricted',l);
 assert.equal(licenseLevel(null),'unknown');assert.equal(licenseLevel(' '),'unknown');
});

test('busca de dados é opcional e nunca impede o pedido',async()=>{
 const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(20)]);
 const calls=[];
 const fake=async(url,init)=>{calls.push(String(url));
  if(String(url).startsWith('https://api.printables.com/'))return new Response(JSON.stringify({data:{print:{name:'Benchy',license:{name:'Creative Commons — Noncommercial'},user:{publicUsername:'Prusa'},image:{filePath:'media/prints/1/images/2_a/benchy.jpg'}}}}));
  if(String(url).startsWith('https://media.printables.com/'))return new Response(png);
  if(String(url).startsWith('https://www.thingiverse.com/'))return new Response('<meta property="og:title" content="Vaso &amp; tampa by Ana"/><meta property="og:image" content="https://evil.example/x.png"/>"license":"https://creativecommons.org/licenses/by-nc/4.0/"');
  throw new Error('rede indisponível');};
 const p=await lookupModel(parseModelLink('https://www.printables.com/model/1'),{fetchImpl:fake});
 assert.deepEqual({...p,image:p.image.mime},{title:'Benchy',author:'Prusa',license:'Creative Commons — Noncommercial',image:'image/png'});
 assert.ok(calls.includes('https://media.printables.com/media/prints/1/images/2_a/thumbs/inside/320x240/jpg/benchy.webp'));
 const t=await lookupModel(parseModelLink('https://www.thingiverse.com/thing:9'),{fetchImpl:fake});
 assert.deepEqual(t,{title:'Vaso & tampa',author:'Ana',license:'Creative Commons — Atribuição-NãoComercial',image:null});
 assert.ok(!calls.some(c=>c.includes('evil.example')),'imagem de host desconhecido não é baixada');
 assert.equal(await lookupModel(parseModelLink('https://makerworld.com/models/1'),{fetchImpl:fake}),null);
 assert.equal(await lookupModel(parseModelLink('https://www.printables.com/model/2'),{fetchImpl:async()=>{throw new Error('bloqueado');}}),null);
 assert.equal(await lookupModel(parseModelLink('https://www.printables.com/model/3'),{fetchImpl:async()=>new Response('Just a moment',{status:403})}),null);
});
