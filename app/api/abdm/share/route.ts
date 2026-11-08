import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {checkinShare,facilityQr,listShares} from '@/lib/services/abdm';import {required} from '@/lib/services/core'
/** Front desk: today's Scan & Share arrivals and the facility QR. POST gives the OPD token (or dismisses). */
export const GET=api(async(c,db)=>{const [shares,qr]=await Promise.all([listShares(db,c),facilityQr(db,c)]);return {shares,qr}},{module:'queue'})
export const POST=api(async(c,db,r)=>{const b=await body(r);return checkinShare(db,c,required(b.id,'Entry'),b)},{module:'queue',idempotent:true})
