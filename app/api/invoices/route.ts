import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {createInvoice,listInvoices} from '@/lib/services/billing'
export const GET=api(async(c,db,r)=>({invoices:await listInvoices(db,c,qs(r,'q'))}),{module:'billing'})
export const POST=api(async(c,db,r)=>({invoice:await createInvoice(db,c,await body(r))}),{module:'billing'})
