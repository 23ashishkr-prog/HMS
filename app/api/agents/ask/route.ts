import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {askAgents} from '@/lib/agents/tools'
export const POST=api(async(c,db,r)=>askAgents(db,c,(await body(r)).question))
