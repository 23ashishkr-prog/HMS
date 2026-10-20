import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {assistantLookup} from '@/lib/services/assistant'
export const GET=api(async(c,db,r)=>assistantLookup(db,c,qs(r,'q')))
