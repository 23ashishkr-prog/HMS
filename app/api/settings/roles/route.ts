import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {accessMatrix,setAccess,resetAccess} from '@/lib/services/roleaccess'
export const GET=api(async(c,db)=>accessMatrix(db,c));export const PUT=api(async(c,db,r)=>setAccess(db,c,await body(r)));export const DELETE=api(async(c,db,r)=>resetAccess(db,c,{role:qs(r,'role')}))
