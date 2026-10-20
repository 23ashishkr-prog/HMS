import {api,body} from '@/lib/api';import * as R from '@/lib/services/reorder';import {requireRole,audit} from '@/lib/services/core';export const runtime='nodejs';export const dynamic='force-dynamic'
export const PATCH=api(async(c,db,r,p)=>R.updatePO(db,c,p.id,await body(r)),{module:'pharmacy'})
