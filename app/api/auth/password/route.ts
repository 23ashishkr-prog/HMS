import {NextResponse} from 'next/server';import {getSession} from '@/lib/auth';import {getDb} from '@/lib/db';import {fail,body} from '@/lib/api';import {changeOwnPassword} from '@/lib/services/auth';import {Db} from '@/lib/services/core'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** Signed-in user changes their own password (required on first login with a temporary password). Works while the temporary-password lock is on. */
export async function POST(req:Request){try{const s=await getSession();if(!s)return NextResponse.json({error:'Please sign in.'},{status:401});const b=await body(req);await changeOwnPassword(getDb() as unknown as Db,s.userId,s.hospitalId,b.currentPassword,b.newPassword);return NextResponse.json({ok:true})}catch(e){return fail(e)}}
