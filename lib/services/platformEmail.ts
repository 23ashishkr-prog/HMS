/** Outgoing e-mail for TailDesk (sign-up codes, reminders), set by the platform owner in Platform → Settings with the TailDesk product selected.
 *  Stored in platform_settings under key 'email_taildesk'; the SMTP password is encrypted like the Razorpay secrets. */
import {Db,HttpError} from './core'
import {encrypt,decrypt} from './integrations'
import {mailboxFrom,smtpEmail} from './notify'

const KEY='email_taildesk'
const s=(v:unknown,max=300)=>String(v??'').trim().slice(0,max)

async function row(db:Db){
 return (await db.query('select key,config,secrets,updated_at from platform_settings where key=$1',[KEY])).rows[0]||null
}

export async function getTaildeskEmail(db:Db){
 const r=await row(db)
 if(!r)return {configured:false,fromEmail:'',fromName:'',host:'',port:587,username:'',password:''}
 let sec:Record<string,string>={}
 try{sec=decrypt(r.secrets)}catch{sec={}}
 if(r.secrets&&!sec.password)console.error('[smtp] mailbox secret unreadable')
 const c=r.config||{}
 const fromEmail=s(c.fromEmail),host=s(c.host)
 return {configured:!!(fromEmail&&host),fromEmail,fromName:s(c.fromName)||'TailDesk',host,port:Number(c.port||587),username:s(c.username),password:s(sec.password,1000)}
}

export async function taildeskEmailView(db:Db){
 const c=await getTaildeskEmail(db)
 const r=await row(db)
 return {configured:c.configured,fromEmail:c.fromEmail,fromName:c.fromName,host:c.host,port:c.port,username:c.username,password:c.password?'••••••••':'',updatedAt:r?.updated_at||null}
}

export async function saveTaildeskEmail(db:Db,adminId:string,b:any){
 const cur=await getTaildeskEmail(db)
 const fromEmail=s(b?.fromEmail).toLowerCase(),host=s(b?.host),port=Number(b?.port||587)
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromEmail))throw new HttpError(400,'Enter the sender e-mail address.')
 if(!host)throw new HttpError(400,'Enter the SMTP host.')
 if(!Number.isInteger(port)||port<1||port>65535)throw new HttpError(400,'Enter a valid port, usually 587 or 465.')
 const given=s(b?.password,1000)
 const password=given&&!given.includes('••••')?given:cur.password
 await db.query(
  `insert into platform_settings(key,config,secrets,updated_by,updated_at) values($1,$2,$3,$4,now())
   on conflict(key) do update set config=$2,secrets=$3,updated_by=$4,updated_at=now()`,
  [KEY,JSON.stringify({fromEmail,fromName:s(b?.fromName)||'TailDesk',host,port,username:s(b?.username)||fromEmail}),encrypt({password}),adminId])
 return taildeskEmailView(db)
}

export async function testTaildeskEmail(db:Db,to:string){
 const c=await getTaildeskEmail(db)
 if(!c.configured)throw new HttpError(400,'Save the e-mail settings first.')
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))throw new HttpError(400,'Enter the e-mail address to send the test to.')
 const p=smtpEmail({smtpHost:c.host,smtpPort:String(c.port),smtpUser:c.username,smtpPass:c.password,from:mailboxFrom(c.fromName||'TailDesk',c.fromEmail)})
 try{await p.send({channel:'email',to,subject:'TailDesk test e-mail',body:'This is a test from the platform settings. TailDesk e-mail is connected.'})}
 catch(e:any){throw new HttpError(502,'The mail server refused it: '+String(e?.message||'unknown error'))}
 return {sent:true}
}
