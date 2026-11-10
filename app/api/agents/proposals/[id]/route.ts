import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {decideProposal} from '@/lib/agents/agents'
export const POST=api(async(c,db,r,p)=>decideProposal(db,c,String(p.id),await body(r)))
