/** Per-user dismissal of nagging lines. Private to the signed-in user. */
import {Ctx,Db,HttpError} from './core'
const KEYS=new Set(['ai_upsell'])
export async function listDismissals(db:Db,ctx:Ctx){const rows=(await db.query('select key from user_dismissals where user_id=$1 and hospital_id=$2 order by key',[ctx.userId,ctx.hospitalId])).rows;return {keys:rows.map((r:any)=>r.key as string)}}
export async function setDismissal(db:Db,ctx:Ctx,b:any){const key=String(b?.key||'');if(!KEYS.has(key))throw new HttpError(400,'Unknown notice.')
 if(b?.dismissed===false)await db.query('delete from user_dismissals where user_id=$1 and hospital_id=$2 and key=$3',[ctx.userId,ctx.hospitalId,key])
 else await db.query('insert into user_dismissals(user_id,hospital_id,key) values($1,$2,$3) on conflict (user_id,key) do nothing',[ctx.userId,ctx.hospitalId,key])
 return listDismissals(db,ctx)}
