import {api} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {einvoiceJson} from '@/lib/services/gst'
/** e-invoice JSON (IRP schema 1.1) for a business bill, downloaded for upload on the e-invoice portal. */
export const GET=api(async(c,db,r,p)=>{const j=await einvoiceJson(db,c,p.id);return new Response(JSON.stringify([j],null,2),{headers:{'content-type':'application/json','content-disposition':`attachment; filename="einvoice-${String(j.DocDtls.No).replace(/[^\w-]/g,'_')}.json"`,'cache-control':'private, no-store'}})},{module:'billing'})
