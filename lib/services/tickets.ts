/** Hospital-admin support tickets → incidents(source=admin_ticket), tenant-scoped. Platform owner sees all; other hospital roles cannot. */
import crypto from 'node:crypto'
import {Ctx,Db,HttpError,audit,opt,required,requireRole} from './core'

const SEV=['low','medium','high','critical'] as const
const CAT=['bug','billing','access','feature','other'] as const

export async function raiseTicket(db:Db,ctx:Ctx,b:any){
 requireRole(ctx,['admin'])
 const title=required(b.title,'Title').slice(0,160)
 const description=required(b.description,'Description').slice(0,4000)
 const severity=opt(b.severity)||'medium'
 if(!(SEV as readonly string[]).includes(severity))throw new HttpError(400,'Invalid severity.')
 const category=opt(b.category)||'other'
 if(!(CAT as readonly string[]).includes(category))throw new HttpError(400,'Invalid category.')
 const fp='ticket:'+crypto.randomUUID()
 const r=(await db.query(
  `insert into incidents(fingerprint,source,message,title,severity,category,route,hospital_id,role,created_by,count,status)
   values($1,'admin_ticket',$2,$3,$4,$5,'/admin/settings#support',$6,'admin',$7,1,'open')
   returning id,fingerprint,source,title,message,severity,category,status,first_seen,last_seen,created_by`,
  [fp,description,title,severity,category,ctx.hospitalId,ctx.userId])).rows[0]
 await audit(db,ctx,'raise_ticket','incident',r.id,{severity,category})
 return {ticket:r}
}

export async function listHospitalTickets(db:Db,ctx:Ctx){
 requireRole(ctx,['admin'])
 return (await db.query(
  `select i.id,i.title,i.message,i.severity,i.category,i.status,i.first_seen,i.last_seen,i.created_by,u.full_name created_by_name
   from incidents i left join users u on u.id=i.created_by
   where i.hospital_id=$1 and i.source='admin_ticket'
   order by (i.status='open') desc,i.last_seen desc limit 100`,[ctx.hospitalId])).rows
}

export async function listPlatformIncidents(db:Db,opts:{kind?:string}={}){
 const kind=opts.kind||'all'
 const where=kind==='tickets'?"i.source='admin_ticket'":kind==='errors'?"i.source in ('server','client')":'true'
 const rows=(await db.query(
  `select i.id,i.fingerprint,i.source,i.message,i.title,i.severity,i.category,i.route,i.role,i.count,
    i.first_seen,i.last_seen,i.status,i.github_issue_url,i.notified_at,i.notify_error,i.created_by,
    h.code hospital_code,h.name hospital_name,u.full_name created_by_name,u.email created_by_email
   from incidents i
   left join hospitals h on h.id=i.hospital_id
   left join users u on u.id=i.created_by
   where ${where}
   order by (i.status='open') desc,i.last_seen desc limit 200`)).rows
 return rows
}
