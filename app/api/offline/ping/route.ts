import {NextResponse} from 'next/server'
export const runtime='nodejs';export const dynamic='force-dynamic'
/** Cheap "is the server reachable?" check for offline mode (no database, no data). */
export async function GET(){return NextResponse.json({ok:true,t:Date.now()},{headers:{'cache-control':'no-store'}})}
