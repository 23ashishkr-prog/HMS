import {NextResponse} from 'next/server';import {timingSafeEqual} from 'crypto'
/** Fails closed: refuses unless CRON_SECRET is set and Authorization: Bearer <CRON_SECRET> matches. */
export function cronGuard(req:Request,job:string){const sec=process.env.CRON_SECRET;if(!sec)return NextResponse.json({error:`CRON_SECRET not configured; ${job} job refused.`},{status:503});const got=req.headers.get('authorization')||'',exp='Bearer '+sec;if(got.length!==exp.length||!timingSafeEqual(Buffer.from(got),Buffer.from(exp)))return NextResponse.json({error:'Unauthorized'},{status:401});return null}
