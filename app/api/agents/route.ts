import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {agentHome,saveAgentSettings} from '@/lib/agents/agents'
export const GET=api(async(c,db)=>agentHome(db,c));export const PATCH=api(async(c,db,r)=>({settings:await saveAgentSettings(db,c,await body(r))}))
