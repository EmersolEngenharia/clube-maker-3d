import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
export async function createFileStorage({data}){
 const mode=process.env.FILE_STORAGE||(process.env.NODE_ENV==='production'?'supabase':'local');
 if(process.env.NODE_ENV==='production'&&mode!=='supabase')throw new Error('Produção exige FILE_STORAGE=supabase.');
 if(mode==='local'){
  const dir=join(data,'files');await mkdir(dir,{recursive:true});
  return {put:(key,bytes)=>writeFile(join(dir,key),bytes,{flag:'wx'}),get:key=>readFile(join(dir,key)),remove:key=>unlink(join(dir,key))};
 }
 if(mode!=='supabase'||!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)throw new Error('Configure Supabase Storage no ambiente privado do servidor.');
 const url=new URL(process.env.SUPABASE_URL);if(url.protocol!=='https:')throw new Error('Supabase Storage exige HTTPS.');
 const {createClient}=await import('@supabase/supabase-js');
 const client=createClient(url.origin,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})}});
 const bucketName=process.env.SUPABASE_STORAGE_BUCKET||'maker3d-projects';
 const {data:bucket,error}=await client.storage.getBucket(bucketName);
 if(error||!bucket||bucket.public)throw new Error('O bucket maker3d deve existir e ser privado antes de iniciar.');
 const bucketClient=client.storage.from(bucketName);
 return {
  async put(key,bytes){const {error}=await bucketClient.upload(key,bytes,{contentType:'application/octet-stream',upsert:false});if(error)throw new Error('Falha no envio ao armazenamento privado.');},
  async get(key){const {data,error}=await bucketClient.download(key);if(error)throw new Error('Falha ao recuperar arquivo privado.');return Buffer.from(await data.arrayBuffer());},
  async remove(key){const {error}=await bucketClient.remove([key]);if(error)throw new Error('Falha ao remover arquivo privado.');}
 };
}
