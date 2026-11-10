import {inflateRawSync} from 'node:zlib';
// Reads print time and filament weight from a sliced file, so a member does not have to type them.
// Bambu Studio / OrcaSlicer store them in Metadata/slice_info.config inside the .3mf; plain G-code keeps them in comments.
const LIMIT=4*1024*1024;
export function zipEntry(buf,match){
 let end=-1;for(let i=buf.length-22;i>=Math.max(0,buf.length-66000);i--)if(buf.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)return null;
 const count=buf.readUInt16LE(end+10);let at=buf.readUInt32LE(end+16);
 for(let n=0;n<count&&at+46<=buf.length;n++){
  if(buf.readUInt32LE(at)!==0x02014b50)return null;
  const method=buf.readUInt16LE(at+10),size=buf.readUInt32LE(at+20),full=buf.readUInt32LE(at+24),nameLen=buf.readUInt16LE(at+28),extra=buf.readUInt16LE(at+30),comment=buf.readUInt16LE(at+32),local=buf.readUInt32LE(at+42),name=buf.toString('utf8',at+46,at+46+nameLen);
  if(match(name)){
   if(full>LIMIT||local+30>buf.length||buf.readUInt32LE(local)!==0x04034b50)return null;
   const start=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28),data=buf.subarray(start,start+size);
   if(method===0)return data;if(method!==8)return null;
   try{return inflateRawSync(data,{maxOutputLength:LIMIT});}catch{return null;}
  }
  at+=46+nameLen+extra+comment;
 }
 return null;
}
const attr=(tag,name)=>tag.match(new RegExp('\\b'+name+'="([^"]*)"'))?.[1];
const round1=n=>Math.round(n*10)/10;
function fromSliceInfo(xml){
 let seconds=0,grams=0,plates=0;const filaments=[];
 for(const plate of xml.match(/<plate>[\s\S]*?<\/plate>/g)||[]){
  const meta=key=>Number(plate.match(new RegExp('key="'+key+'"\\s+value="([^"]*)"'))?.[1]);
  if(!Number.isFinite(meta('prediction')))continue;plates++;seconds+=meta('prediction');
  let plateGrams=0;
  for(const tag of plate.match(/<filament\b[^>]*>/g)||[]){const g=Number(attr(tag,'used_g'));if(!Number.isFinite(g)||g<=0)continue;plateGrams+=g;const type=String(attr(tag,'type')||'').slice(0,40),color=String(attr(tag,'color')||'').slice(0,20),same=filaments.find(f=>f.type===type&&f.color===color);if(same)same.grams=round1(same.grams+g);else filaments.push({type,color,grams:round1(g)});}
  grams+=plateGrams||(Number.isFinite(meta('weight'))?meta('weight'):0);
 }
 return plates&&seconds>0?{minutes:Math.max(1,Math.ceil(seconds/60)),grams:round1(grams),filaments,plates}:null;
}
function duration(text){const m=text.match(/(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?/);if(!m||!m[0].trim())return 0;return (Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0));}
function fromGcode(text){
 const time=text.match(/;\s*total estimated time:\s*([^;\n]+)/i)||text.match(/;\s*estimated printing time \(normal mode\)\s*=\s*([^\n]+)/i),seconds=time?duration(time[1].trim()):0;
 const weight=text.match(/;\s*total filament weight \[g\]\s*:\s*([^\n]+)/i)||text.match(/;\s*(?:total )?filament used \[g\]\s*=\s*([^\n]+)/i);
 const parts=weight?weight[1].split(/[,;]/).map(v=>Number(v.trim())).filter(v=>Number.isFinite(v)&&v>0):[],types=(text.match(/;\s*filament_type\s*=\s*([^\n]+)/i)?.[1]||'').split(';').map(v=>v.trim());
 if(!seconds)return null;
 return {minutes:Math.max(1,Math.ceil(seconds/60)),grams:round1(parts.reduce((a,b)=>a+b,0)),filaments:parts.map((g,i)=>({type:(types[i]||types[0]||'').slice(0,40),color:'',grams:round1(g)})),plates:1};
}
// Returns {sliced:true,minutes,grams,filaments,plates} or {sliced:false} when the file has no slicing data.
export function analyzePrintFile(name,bytes){
 const lower=String(name||'').toLowerCase();let found=null;
 if(lower.endsWith('.3mf')){const info=zipEntry(bytes,n=>/^Metadata\/slice_info\.config$/i.test(n));if(info)found=fromSliceInfo(info.toString('utf8'));}
 else if(/\.(gcode|gco|g)$/.test(lower)){const head=bytes.subarray(0,262144).toString('utf8'),tail=bytes.subarray(Math.max(0,bytes.length-262144)).toString('utf8');found=fromGcode(head)||fromGcode(tail);}
 return found?{sliced:true,...found}:{sliced:false};
}
