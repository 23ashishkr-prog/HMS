import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {pacsSettings} from '@/lib/services/radiology'
export const GET=api(async(c,db)=>await pacsSettings(db,c))
export const PUT=api(async(c,db,r)=>await pacsSettings(db,c,await body(r)))
