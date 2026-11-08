import {api,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {tallyXml,gstSummaryCsv} from '@/lib/services/gst';import {HttpError} from '@/lib/services/core'
/** Accounts export for a date range: ?kind=tally (Tally Prime XML) or ?kind=gst (GST summary CSV). */
export const GET=api(async(c,db,r)=>{const from=qs(r,'from'),to=qs(r,'to'),kind=qs(r,'kind')
 if(kind==='tally')return new Response(await tallyXml(db,c,from,to),{headers:{'content-type':'application/xml; charset=utf-8','content-disposition':`attachment; filename="tally-${from}-to-${to}.xml"`,'cache-control':'private, no-store'}})
 if(kind==='gst')return new Response(await gstSummaryCsv(db,c,from,to),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="gst-summary-${from}-to-${to}.csv"`,'cache-control':'private, no-store'}})
 throw new HttpError(400,'kind must be tally or gst')},{module:'billing'})
