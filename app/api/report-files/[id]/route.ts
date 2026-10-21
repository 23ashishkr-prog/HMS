import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {getReportFile,verifyReport,deleteReport} from '@/lib/services/reportfiles'
/** Streams the file inline (PDF/image viewer). Same-hospital only; every view is audited. */
export const GET=api(async(c,db,r,p)=>{const f=await getReportFile(db,c,p.id);const dl=new URL(r.url).searchParams.get('download')==='1';return new Response(new Uint8Array(f.data),{headers:{'content-type':f.mime,'content-disposition':`${dl?'attachment':'inline'}; filename="${f.file_name.replace(/"/g,'')}"`,'cache-control':'private, no-store','x-content-type-options':'nosniff'}})})
export const PATCH=api(async(c,db,r,p)=>{const b:any=await body(r);if(b.action==='verify')return verifyReport(db,c,p.id);return Response.json({error:'Unknown action'},{status:400})})
export const DELETE=api(async(c,db,r,p)=>deleteReport(db,c,p.id))
