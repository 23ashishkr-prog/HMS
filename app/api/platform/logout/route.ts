import {NextResponse} from 'next/server'
import {clearPlatformSession,fail} from '@/lib/api'
export const runtime='nodejs'
export async function POST(req:Request){
 try{await clearPlatformSession(req);return NextResponse.json({ok:true})}
 catch(e){return fail(e)}
}
