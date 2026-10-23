import {NextResponse} from 'next/server'
import {clearPlatformSession,fail} from '@/lib/api'
export const runtime='nodejs'
export async function POST(){
 try{await clearPlatformSession();return NextResponse.json({ok:true})}
 catch(e){return fail(e)}
}
