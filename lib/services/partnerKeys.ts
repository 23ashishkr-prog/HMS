import {timingSafeEqual} from 'crypto'

export type PartnerProduct='taildesk'|'smartshop'
const same=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}

/** Which product server is calling: it must present its own shared platform key
 *  (TAILDESK_PLATFORM_API_KEY or SMARTSHOP_PLATFORM_API_KEY). Returns null when the key is missing or wrong. */
export function partnerFromRequest(req:Request):PartnerProduct|null{
 const given=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim()||(req.headers.get('x-platform-api-key')||'').trim()
 if(!given)return null
 const td=(process.env.TAILDESK_PLATFORM_API_KEY||'').trim()
 const ss=(process.env.SMARTSHOP_PLATFORM_API_KEY||'').trim()
 if(td&&same(given,td))return 'taildesk'
 if(ss&&same(given,ss))return 'smartshop'
 return null
}
