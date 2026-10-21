import {api} from '@/lib/api';import {liveActivity} from '@/lib/services/widgets';export const runtime='nodejs';export const dynamic='force-dynamic'
export const GET=api(async(c,db)=>liveActivity(db,c))
