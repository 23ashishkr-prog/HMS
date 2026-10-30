/** Per-user page favourites. Usage counts and stars are stored for the signed-in user only. */
import {Ctx,Db,HttpError} from './core'
import {Role,navFor} from '../nav'
import {getSubscription} from './tenancy'

export const AUTO_MIN_HITS=5
export const AUTO_MIN_DAYS=2
export const AUTO_LIMIT=4
export const MANUAL_LIMIT=8
/** Home is one click from the logo, so it is not auto-starred. A manual star still keeps it. */
const AUTO_SKIP=new Set(['/dashboard'])

export function cleanNavPath(raw:unknown){
 const s=String(raw??'').trim()
 if(!s.startsWith('/')||s.length>80)return null
 if(/[?#]|\/\/|\.\./.test(s))return null
 return s
}

async function allowed(db:Db,ctx:Ctx){
 const sub=await getSubscription(db,ctx.hospitalId)
 const {open}=navFor(ctx.role as Role,sub?.modules||null)
 return new Map(open.map(n=>[n.path,n]))
}

export async function recordHit(db:Db,ctx:Ctx,raw:unknown){
 const path=cleanNavPath(raw)
 if(!path)return {ok:true,ignored:true}
 const menu=await allowed(db,ctx)
 if(!menu.has(path))return {ok:true,ignored:true}
 await db.query(
  `insert into user_nav_usage(hospital_id,user_id,path,hits,last_opened_at,days,last_day)
   values($1,$2,$3,1,now(),1,(now() at time zone 'Asia/Kolkata')::date)
   on conflict(user_id,path) do update set
     hits=user_nav_usage.hits+1,last_opened_at=now(),updated_at=now(),
     days=user_nav_usage.days+case when user_nav_usage.last_day is distinct from (now() at time zone 'Asia/Kolkata')::date then 1 else 0 end,
     last_day=(now() at time zone 'Asia/Kolkata')::date`,
  [ctx.hospitalId,ctx.userId,path])
 return {ok:true}
}

export async function listFavourites(db:Db,ctx:Ctx){
 const menu=await allowed(db,ctx)
 const rows=(await db.query(
  `select path,hits,days,starred,dismissed,last_opened_at,updated_at
   from user_nav_usage where user_id=$1 and hospital_id=$2`,
  [ctx.userId,ctx.hospitalId])).rows
 const manual:any[]=[]
 const auto:any[]=[]
 for(const r of rows){
  const n=menu.get(r.path)
  if(!n)continue
  const item={path:r.path,name:n.name,icon:n.icon,hits:Number(r.hits)||0,starred:!!r.starred,auto:false,updatedAt:r.updated_at,lastOpenedAt:r.last_opened_at}
  if(r.starred)manual.push(item)
  else if(!r.dismissed&&item.hits>=AUTO_MIN_HITS&&(Number(r.days)||0)>=AUTO_MIN_DAYS&&!AUTO_SKIP.has(r.path))auto.push({...item,auto:true})
 }
 manual.sort((a,b)=>new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime())
 auto.sort((a,b)=>b.hits-a.hits||new Date(b.lastOpenedAt||0).getTime()-new Date(a.lastOpenedAt||0).getTime())
 const items=[...manual.slice(0,MANUAL_LIMIT),...auto.slice(0,AUTO_LIMIT)].map(({updatedAt:_,lastOpenedAt:__,...rest})=>rest)
 return {items}
}

export async function setFavourite(db:Db,ctx:Ctx,b:any){
 const path=cleanNavPath(b?.path)
 const menu=await allowed(db,ctx)
 if(!path||!menu.has(path))throw new HttpError(400,'That page is not on your menu.')
 if(b?.starred===true){
  await db.query(
   `insert into user_nav_usage(hospital_id,user_id,path,hits,starred,dismissed) values($1,$2,$3,0,true,false)
    on conflict(user_id,path) do update set starred=true,dismissed=false,updated_at=now()`,
   [ctx.hospitalId,ctx.userId,path])
 }else if(b?.dismissed===true){
  await db.query(
   `insert into user_nav_usage(hospital_id,user_id,path,hits,starred,dismissed) values($1,$2,$3,0,false,true)
    on conflict(user_id,path) do update set starred=false,dismissed=true,updated_at=now()`,
   [ctx.hospitalId,ctx.userId,path])
 }else if(b?.starred===false){
  await db.query(
   `insert into user_nav_usage(hospital_id,user_id,path,hits,starred,dismissed) values($1,$2,$3,0,false,false)
    on conflict(user_id,path) do update set starred=false,updated_at=now()`,
   [ctx.hospitalId,ctx.userId,path])
 }else if(b?.dismissed===false){
  await db.query(
   `insert into user_nav_usage(hospital_id,user_id,path,hits,starred,dismissed) values($1,$2,$3,0,false,false)
    on conflict(user_id,path) do update set dismissed=false,updated_at=now()`,
   [ctx.hospitalId,ctx.userId,path])
 }else throw new HttpError(400,'Say whether to star or dismiss this page.')
 return listFavourites(db,ctx)
}

/** Paths a role can star. */
export function menuPaths(role:Role,modules?:string[]|null){return navFor(role,modules).open.map(n=>n.path)}
