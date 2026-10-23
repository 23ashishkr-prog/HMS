import {api} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {runImport,importHistory} from '@/lib/services/bulkimport';import {HttpError} from '@/lib/services/core'
export const GET=api(async(c,db)=>({history:await importHistory(db,c)}),{module:'bulk'})
/** multipart: file (.xlsx), kind, dryRun ("1" = preview only). */
export const POST=api(async(c,db,r)=>{const f=await r.formData().catch(()=>null);const file=f?.get('file');if(!f||!file||typeof file==='string')throw new HttpError(400,'Choose an .xlsx file.');return runImport(db,c,String(f.get('kind')) as any,Buffer.from(await (file as File).arrayBuffer()),(file as File).name,f.get('dryRun')!=='0')},{module:'bulk'})
