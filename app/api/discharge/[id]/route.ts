import {getDb} from '@/lib/db';import {fail} from '@/lib/api';import {Db} from '@/lib/services/core';import {publicSummary} from '@/lib/services/ipd'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** Patient's copy of the discharge summary, opened from the signed WhatsApp/e-mail link. */
export async function GET(req:Request,ext:{params:Promise<{id:string}>}){try{const {id}=await ext.params;const u=new URL(req.url);return Response.json(await publicSummary(getDb() as unknown as Db,id,Number(u.searchParams.get('e')),u.searchParams.get('s')||''))}catch(e){return fail(e)}}
