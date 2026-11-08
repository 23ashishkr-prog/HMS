import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {getStudy,radiologyAction} from '@/lib/services/radiology'
export const GET=api(async(c,db,r,p)=>await getStudy(db,c,p.id),{module:'lab'})
export const PATCH=api(async(c,db,r,p)=>({study:await radiologyAction(db,c,p.id,await body(r))}),{module:'lab'})
