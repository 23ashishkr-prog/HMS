import {NextResponse} from 'next/server'
import {clearPlatformSession,fail} from '@/lib/api'
export const runtime='nodejs'
export async function POST(){
 try{const res=NextResponse.json({ok:true});clearPlatformSession(res);return res}
 catch(e){return fail(e)}
}
