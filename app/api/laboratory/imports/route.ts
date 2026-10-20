import {api,qs} from '@/lib/api';import {listImports} from '@/lib/services/labimport';export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=api(async(c,db,r)=>({imports:await listImports(db,c,qs(r,'status')||'open')}),{module:'lab'})
