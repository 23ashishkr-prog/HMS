import {api,body} from '@/lib/api';import * as R from '@/lib/services/reorder';import {requireRole,audit} from '@/lib/services/core';export const runtime='nodejs';export const dynamic='force-dynamic'
export const PUT=api(async(c,db,r,p)=>R.saveSupplier(db,c,await body(r),p.id),{module:'pharmacy'})
