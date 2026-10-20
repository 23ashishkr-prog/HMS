import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {dashboard} from '@/lib/services/dashboard';import {listQueue} from '@/lib/services/opd'
export const GET=api(async(c,db)=>({summary:await dashboard(db,c),queue:await listQueue(db,c)}))
