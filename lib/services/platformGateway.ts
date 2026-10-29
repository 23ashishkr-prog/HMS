/** Platform SaaS-owner Razorpay gateway settings.
 *  Encrypted at rest with the same AES-256-GCM helpers as hospital WhatsApp (INTEGRATIONS_ENC_KEY).
 *  Prefer platform-stored keys over env; never expose raw secrets to hospital JWTs or hospital UI. */
import {Db,HttpError} from './core'
import {encrypt,decrypt,mask} from './integrations'
import {basePath} from '../basePath'

export type RzpMode='test'|'live'
export type RzpCreds={
  configured:boolean
  source:'platform'|'env'|'none'
  mode:RzpMode
  keyId:string
  keySecret:string
  webhookSecret:string
}

const KEY='razorpay'
/** Public path Razorpay should call. Includes basePath so greynova.in/hms proxies it. */
export const PLATFORM_WEBHOOK_PATH=basePath+'/api/subscription/razorpay/webhook'
const s=(v:unknown,max=500)=>String(v??'').trim().slice(0,max)

function envCreds():RzpCreds|null{
  const keyId=process.env.RAZORPAY_KEY_ID||''
  const keySecret=process.env.RAZORPAY_KEY_SECRET||''
  const webhookSecret=process.env.RAZORPAY_WEBHOOK_SECRET||''
  if(!keyId||!keySecret||!webhookSecret)return null
  const mode:RzpMode=keyId.startsWith('rzp_live')?'live':'test'
  return {configured:true,source:'env',mode,keyId,keySecret,webhookSecret}
}

async function platformRow(db:Db){
  return (await db.query('select key,config,secrets,updated_at,updated_by from platform_settings where key=$1',[KEY])).rows[0]||null
}

/** Resolve Razorpay credentials: platform DB first, then env. */
export async function getRazorpayCreds(db:Db):Promise<RzpCreds>{
  const row=await platformRow(db)
  if(row){
    let sec:Record<string,string>={}
    try{sec=decrypt(row.secrets)}catch{sec={}}
    const cfg=row.config||{}
    const keyId=s(sec.keyId||cfg.keyId)
    const keySecret=s(sec.keySecret,4000)
    const webhookSecret=s(sec.webhookSecret,4000)
    const mode:RzpMode=(cfg.mode==='live'||keyId.startsWith('rzp_live'))?'live':'test'
    if(keyId&&keySecret&&webhookSecret){
      return {configured:true,source:'platform',mode,keyId,keySecret,webhookSecret}
    }
  }
  return envCreds()||{configured:false,source:'none',mode:'test',keyId:'',keySecret:'',webhookSecret:''}
}

export async function paymentsConfiguredAsync(db:Db){
  return (await getRazorpayCreds(db)).configured
}

/** Sync env-only check (tests / fallback). Prefer paymentsConfiguredAsync when DB is available. */
export function envPaymentsConfigured(){
  return !!(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET&&process.env.RAZORPAY_WEBHOOK_SECRET)
}

/** Masked view for /platform settings — never returns raw secrets. */
export async function getGatewayView(db:Db){
  const row=await platformRow(db)
  let sec:Record<string,string>={}
  let cfg:any={}
  if(row){
    cfg=row.config||{}
    try{sec=decrypt(row.secrets)}catch{sec={}}
  }
  const creds=await getRazorpayCreds(db)
  const showEnvFallback=creds.source==='env'&&!sec.keyId
  return {
    key:'razorpay',
    mode:(cfg.mode==='live'||creds.mode==='live'?'live':'test') as RzpMode,
    keyId:mask(sec.keyId||(showEnvFallback?creds.keyId:'')),
    keySecret:mask(sec.keySecret||(showEnvFallback?creds.keySecret:'')),
    webhookSecret:mask(sec.webhookSecret||(showEnvFallback?creds.webhookSecret:'')),
    configured:creds.configured,
    source:creds.source,
    hasPlatformRow:!!(row&&row.secrets),
    updatedAt:row?.updated_at||null,
    encryption:process.env.INTEGRATIONS_ENC_KEY?'INTEGRATIONS_ENC_KEY':'derived from SESSION_SECRET (set INTEGRATIONS_ENC_KEY)',
    webhookPath:PLATFORM_WEBHOOK_PATH,
    note:'Hospital plan subscriptions only (Clinic / Basic / AI+). Patient bills stay cash/UPI/card in-app.',
  }
}

/** Save Razorpay keys from platform console. Blank / masked fields keep previous values. */
export async function saveGateway(db:Db,adminId:string,b:any){
  const cur=await platformRow(db)
  let sec:Record<string,string>={}
  try{sec=decrypt(cur?.secrets)}catch{sec={}}
  const cfg:any={...(cur?.config||{})}
  if(b?.mode==='live'||b?.mode==='test')cfg.mode=b.mode

  const incoming:Record<string,string>={}
  for(const k of ['keyId','keySecret','webhookSecret'] as const){
    const v=b?.[k]
    if(typeof v==='string'&&v.trim()&&!v.includes('••••'))incoming[k]=s(v,4000)
  }
  const next={
    keyId:incoming.keyId||sec.keyId||'',
    keySecret:incoming.keySecret||sec.keySecret||'',
    webhookSecret:incoming.webhookSecret||sec.webhookSecret||'',
  }
  if(!(next.keyId&&next.keySecret&&next.webhookSecret)){
    throw new HttpError(400,'Key ID, Key Secret and Webhook Secret are all required.')
  }
  if(!/^rzp_(test|live)_/.test(next.keyId))throw new HttpError(400,'Key ID should start with rzp_test_ or rzp_live_')
  if(!cfg.mode)cfg.mode=next.keyId.startsWith('rzp_live')?'live':'test'

  await db.query(
    `insert into platform_settings(key,config,secrets,updated_by,updated_at)
     values($1,$2,$3,$4,now())
     on conflict(key) do update set config=$2,secrets=$3,updated_by=$4,updated_at=now()`,
    [KEY,JSON.stringify(cfg),encrypt(next),adminId]
  )
  return getGatewayView(db)
}

export async function clearGateway(db:Db,adminId:string){
  await db.query(
    `insert into platform_settings(key,config,secrets,updated_by,updated_at) values($1,'{}'::jsonb,null,$2,now())
     on conflict(key) do update set config='{}'::jsonb,secrets=null,updated_by=$2,updated_at=now()`,
    [KEY,adminId]
  )
  return getGatewayView(db)
}
