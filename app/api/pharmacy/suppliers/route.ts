import {api,body} from '@/lib/api';import * as R from '@/lib/services/reorder';import {requireRole,audit} from '@/lib/services/core';export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=api(async(c,db)=>({suppliers:await R.listSuppliers(db,c)}),{module:'pharmacy'})
export const POST=api(async(c,db,r)=>R.saveSupplier(db,c,await body(r)),{module:'pharmacy',idempotent:true})
