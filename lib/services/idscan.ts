import {HttpError} from './core';
import {inflateSync,gunzipSync} from 'zlib'
/** Parse an Indian ID QR into registration fields. Supports Aadhaar Secure QR (big-integer, zlib/gzip, 0xFF-delimited),
 *  legacy Aadhaar XML QR, and generic key:value / JSON QR. Aadhaar number is NEVER returned in full; only last 4 for display. */
export type IdFields={fullName?:string;gender?:string;dob?:string;ageYears?:number;address?:string;city?:string;state?:string;pincode?:string;mobileHint?:string;idLast4?:string;source:string}
const G:any={M:'Male',F:'Female',T:'Other',MALE:'Male',FEMALE:'Female'}
function age(dob?:string){if(!dob)return undefined;const m=dob.match(/(\d{2})[-/](\d{2})[-/](\d{4})/)||dob.match(/(\d{4})-(\d{2})-(\d{2})/);if(!m)return undefined;const y=Number(m[1].length===4?m[1]:m[3]);const a=new Date().getFullYear()-y;return a>=0&&a<130?a:undefined}
function iso(d?:string){if(!d)return undefined;const m=d.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:d}
function bigToBytes(s:string){let n=BigInt(s);const out:number[]=[];const Z=BigInt(0),F=BigInt(255),E=BigInt(8);while(n>Z){out.unshift(Number(n&F));n>>=E}return Buffer.from(out)}
export function parseIdQr(raw:string):IdFields{const t=String(raw||'').trim();if(!t)throw new HttpError(400,'Empty QR')
 if(/^\d{50,}$/.test(t)){let buf=bigToBytes(t),dec:Buffer;try{dec=gunzipSync(buf)}catch{try{dec=inflateSync(buf)}catch{throw new HttpError(400,'Unreadable Aadhaar Secure QR')}}
  const parts:string[]=[];let st=0;for(let i=0;i<dec.length&&parts.length<18;i++)if(dec[i]===255){parts.push(dec.subarray(st,i).toString('latin1'));st=i+1}
  const off=/^V\d/.test(parts[0]||'')?1:0;const p=(i:number)=>(parts[i+off]||'').trim()
  // [emailMobileInd, referenceId, name, dob, gender, careOf, district, landmark, house, location, pincode, postOffice, state, street, subDistrict, vtc]
  const ref=p(1),addr=[p(8),p(13),p(7),p(9),p(15),p(14)].filter(Boolean).join(', ');return {fullName:p(2),dob:iso(p(3)),ageYears:age(p(3)),gender:G[p(4).toUpperCase()]||undefined,address:addr||undefined,city:p(6)||undefined,state:p(12)||undefined,pincode:p(10)||undefined,idLast4:ref.slice(0,4)||undefined,source:'aadhaar-secure-qr'}}
 if(t.startsWith('<')){const a=(k:string)=>{const m=t.match(new RegExp(k+'="([^"]*)"','i'));return m?m[1].trim():''};const dob=a('dob')||a('yob');const uid=a('uid')
  return {fullName:a('name'),gender:G[a('gender').toUpperCase()],dob:iso(a('dob'))||undefined,ageYears:a('dob')?age(a('dob')):(a('yob')?new Date().getFullYear()-Number(a('yob')):undefined),address:[a('house'),a('street'),a('lm'),a('loc'),a('vtc')].filter(Boolean).join(', ')||undefined,city:a('dist')||undefined,state:a('state')||undefined,pincode:a('pc')||undefined,idLast4:uid?uid.slice(-4):undefined,source:dob?'aadhaar-xml-qr':'xml-qr'}}
 try{const j=JSON.parse(t);return {fullName:j.name||j.fullName,gender:G[String(j.gender||'').toUpperCase()],dob:iso(j.dob),ageYears:age(j.dob),address:j.address,pincode:j.pincode||j.pc,source:'json-qr'}}catch{}
 const kv:any={};t.split(/[\n;|]/).forEach(l=>{const m=l.match(/^\s*([A-Za-z ]+)\s*[:=]\s*(.+)$/);if(m)kv[m[1].trim().toLowerCase()]=m[2].trim()})
 if(kv.name)return {fullName:kv.name,gender:G[String(kv.gender||kv.sex||'').toUpperCase()],dob:iso(kv.dob),ageYears:age(kv.dob),address:kv.address,pincode:kv.pincode||kv.pin,source:'text-qr'}
 throw new HttpError(400,'QR does not look like an ID card')}
/** Best-effort OCR text → fields (text comes from on-device OCR or AI vision). */
export function parseIdText(text:string):IdFields{const t=String(text||'');const lines=t.split(/\n/).map(s=>s.trim()).filter(Boolean)
 const dob=(t.match(/(?:DOB|Date of Birth|जन्म)[^0-9]*(\d{2}[/-]\d{2}[/-]\d{4})/i)||[])[1];const yob=(t.match(/Year of Birth[^0-9]*(\d{4})/i)||[])[1]
 const gender=/\bFEMALE\b|महिला/i.test(t)?'Female':/\bMALE\b|पुरुष/i.test(t)?'Male':undefined
 const di=lines.findIndex(l=>/DOB|Date of Birth|Year of Birth/i.test(l));const name=di>0?lines.slice(0,di).reverse().find(l=>/^[A-Za-z .]{3,60}$/.test(l)&&!/government|india|aadhaar/i.test(l)):undefined
 const num=(t.match(/\b\d{4}\s?\d{4}\s?(\d{4})\b/)||[])[1];const pin=(t.match(/\b(\d{6})\b/)||[])[1]
 return {fullName:name,gender,dob:iso(dob),ageYears:dob?age(dob):yob?new Date().getFullYear()-Number(yob):undefined,pincode:pin,idLast4:num,source:'ocr'}}
