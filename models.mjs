// Pieces chosen on 3D model sites. The club keeps only the link and a few details;
// the operator downloads the file from the original site when it is time to print.
import {mediaType} from './messaging/broadcasts.mjs';
export const sites={
 makerworld:{name:'MakerWorld',home:'https://makerworld.com',hosts:/^(www\.)?makerworld\.com$/,model:/^\/(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?models\/(\d+)/i},
 printables:{name:'Printables',home:'https://www.printables.com',hosts:/^(www\.)?printables\.com$/,model:/^\/(?:[a-z]{2}\/)?model\/(\d+)/i},
 thingiverse:{name:'Thingiverse',home:'https://www.thingiverse.com',hosts:/^(www\.)?thingiverse\.com$/,model:/^\/thing:(\d+)/i},
 cults3d:{name:'Cults3D',home:'https://cults3d.com',hosts:/^(www\.)?cults3d\.com$/,model:/^\/(?:[a-z]{2}\/)?3d-model\/[^/]+\/([^/?#]+)/i},
 thangs:{name:'Thangs',home:'https://thangs.com',hosts:/^(www\.)?thangs\.com$/,model:/\/3d-model\/[^/?#]*?-(\d+)$/i}
};
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
// Accepts the link as copied from the browser or from a share text ("Veja esta peça: https://…").
export function parseModelLink(raw){
 if(typeof raw!=='string'||!raw.trim())invalid('Cole o link da peça.');
 const found=raw.trim().match(/https?:\/\/\S+/i)?.[0]||raw.trim();
 let url;try{url=new URL(/^https?:\/\//i.test(found)?found:'https://'+found);}catch{invalid('Esse link não parece um endereço de site. Copie o link da página da peça.');}
 const host=url.hostname.toLowerCase();
 if(url.username||url.password||!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)||found.length>600)invalid('Esse link não parece um endereço de site. Copie o link da página da peça.');
 for(const [site,s]of Object.entries(sites)){
  if(!s.hosts.test(host))continue;
  const id=url.pathname.replace(/\/+$/,'').match(s.model)?.[1];
  if(!id)invalid(`Esse link não abre uma peça do ${s.name}. Abra a página da peça e copie o link dela.`);
  const profileId=site==='makerworld'?url.hash.match(/profileId-(\d+)/i)?.[1]||null:null;
  const canonical=site==='printables'?`https://www.printables.com/model/${id}`:site==='thingiverse'?`https://www.thingiverse.com/thing:${id}`:`https://${host}${url.pathname.replace(/\/+$/,'')}`+(profileId?`#profileId-${profileId}`:'');
  return {site,siteName:s.name,url:canonical,modelId:id,profileId,supported:['printables','thingiverse'].includes(site)};
 }
 url.protocol='https:';url.hash='';
 return {site:'other',siteName:host.replace(/^www\./,''),url:url.toString(),modelId:null,profileId:null,supported:false};
}
// Licenses that forbid or may forbid printing for a club that charges fees ask the team to check before quoting.
export function licenseLevel(license){
 const text=String(license||'').trim();
 if(!text)return 'unknown';
 if(/non[- ]?commercial|by-nc|\bnc\b|n[ãa]o[- ]?comercial|standard digital file|all rights reserved|personal use/i.test(text))return 'restricted';
 return 'open';
}
const ccNames={'by':'Creative Commons — Atribuição','by-sa':'Creative Commons — Atribuição-CompartilhaIgual','by-nd':'Creative Commons — Atribuição-SemDerivações','by-nc':'Creative Commons — Atribuição-NãoComercial','by-nc-sa':'Creative Commons — Atribuição-NãoComercial-CompartilhaIgual','by-nc-nd':'Creative Commons — Atribuição-NãoComercial-SemDerivações'};
function licenseFromUrl(value){
 const v=String(value||'');
 if(/publicdomain/i.test(v))return 'Domínio público (CC0)';
 const cc=v.match(/creativecommons\.org\/licenses\/([a-z-]+)/i)?.[1]?.toLowerCase();
 return cc?(ccNames[cc]||'Creative Commons '+cc.toUpperCase()):v.slice(0,120)||null;
}
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const clean=(v,max=200)=>typeof v==='string'&&v.trim()?v.replace(/\s+/g,' ').trim().slice(0,max):null;
const imageHosts=/^(media\.printables\.com|resize\.thingiverse\.com|cdn\.thingiverse\.com)$/;
// Best effort only: every failure returns null and the member fills the title by hand.
export async function lookupModel(link,{fetchImpl=fetch,timeout=4000}={}){
 if(!link.supported)return null;
 const signal=AbortSignal.timeout(timeout);
 try{
  let info;
  if(link.site==='printables'){
   const r=await fetchImpl('https://api.printables.com/graphql/',{method:'POST',signal,redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:`{ print(id:"${link.modelId}"){ name license{name} user{publicUsername} image{filePath} } }`})});
   if(!r.ok)return null;const p=(await r.json())?.data?.print;if(!p)return null;
   const file=typeof p.image?.filePath==='string'?p.image.filePath:'';
   const thumb=/^media\/[\w./-]+\.\w+$/.test(file)?`https://media.printables.com/${file.replace(/\/([^/]+)\.\w+$/,'/thumbs/inside/320x240/jpg/$1.webp')}`:null;
   info={title:clean(p.name),author:clean(p.user?.publicUsername,120),license:clean(p.license?.name,120),imageUrl:thumb};
  }else{
   const r=await fetchImpl(link.url,{signal,redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 (compatible; ClubeMaker3D/1.0)','Accept':'text/html'}});
   if(!r.ok)return null;const html=(await r.text()).slice(0,800000);
   const meta=name=>{const m=html.match(new RegExp(`<meta[^>]+property="${name}"[^>]+content="([^"]*)"`,'i'));return m?decode(m[1]):null;};
   const og=meta('og:title');if(!og)return null;
   const by=og.match(/^(.*) by ([^]+)$/);
   const image=meta('og:image')?.replace(/([?&])w=\d+/,'$1w=320').replace(/([?&])h=\d+/,'$1h=240')||null;
   info={title:clean(by?by[1]:og),author:clean(by?.[2],120),license:clean(licenseFromUrl(html.match(/"license\\?":\\?"([^"\\]+)/)?.[1]),120),imageUrl:image};
  }
  if(!info.title)return null;
  let image=null;
  try{
   const u=info.imageUrl&&new URL(info.imageUrl);
   if(u&&u.protocol==='https:'&&imageHosts.test(u.hostname)){
    const r=await fetchImpl(u,{signal,redirect:'error'});
    const bytes=r.ok?Buffer.from(await r.arrayBuffer()):null,type=bytes&&bytes.length<=1024*1024&&mediaType(bytes);
    if(type?.kind==='image')image={bytes,mime:type.mime};
   }
  }catch{}
  return {title:info.title,author:info.author,license:info.license,image};
 }catch{return null;}
}
