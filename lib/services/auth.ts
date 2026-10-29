import {Db,HttpError} from './core'
/** bcrypt cost 10 (~100ms). Cost 12 was fine for one row and far too slow when the planner hashed every user. */
const BCRYPT_COST=10
/** Credential check shared by the login route and tests. Email is trimmed + case-insensitive; hospital code optional unless the email exists in several tenants.
 *  Look up by lower(email) first so idx_users_email is used, then crypt only those rows. */
export async function authenticate(db:Db,email:unknown,password:unknown,hospitalCode?:unknown){const e=String(email||'').trim().toLowerCase(),pw=String(password||''),code=String(hospitalCode||'').trim().toUpperCase()||null;if(!e||!pw)throw new HttpError(400,'Email and password are required.')
 const active=`u.active=true and coalesce(h.status,'active')='active' and ($2::text is null or h.code=$2)`
 let ids=(await db.query(`select u.id from users u join hospitals h on h.id=u.hospital_id where lower(u.email)=$1 and ${active}`,[e,code])).rows
 if(!ids.length)ids=(await db.query(`select u.id from users u join hospitals h on h.id=u.hospital_id where lower(trim(u.email))=$1 and lower(u.email)<>$1 and ${active}`,[e,code])).rows
 if(!ids.length)throw new HttpError(401,'Invalid email or password.')
 const q=await db.query(`select u.id,u.hospital_id,u.email,u.full_name,u.role,u.password_hash from users u where u.id=any($1::uuid[]) and u.password_hash=crypt($2,u.password_hash)`,[ids.map((r:any)=>r.id),pw])
 if(!q.rows.length)throw new HttpError(401,'Invalid email or password.');if(q.rows.length>1)throw Object.assign(new HttpError(409,'This email is registered with more than one hospital. Enter your hospital code.'),{needHospitalCode:true})
 const row=q.rows[0];const cost=Number(String(row.password_hash||'').split('$')[2]||0)
 if(cost>BCRYPT_COST)await db.query(`update users set password_hash=crypt($2,gen_salt('bf',${BCRYPT_COST})) where id=$1`,[row.id,pw]).catch(()=>{})
 const {password_hash:_hash,...user}=row;return user}
/** Run fn inside one transaction on a dedicated connection (pg Pool) or the same handle (PGlite). */
export async function tx<T>(pool:any,fn:(db:Db)=>Promise<T>):Promise<T>{const c=pool.connect?await pool.connect():pool;try{await c.query('begin');const r=await fn(c);await c.query('commit');return r}catch(e){await c.query('rollback').catch(()=>{});throw e}finally{c.release?.()}}

/** Self-service password change. Clears the temporary-password flag so the rest of the app unlocks. */
export async function changeOwnPassword(db:Db,userId:string,hospitalId:string,current:unknown,next:unknown){const pw=String(next||'');if(pw.length<10)throw new HttpError(400,'New password must be at least 10 characters.');if(pw===String(current||''))throw new HttpError(400,'New password must be different from the temporary one.')
 const ok=(await db.query('select (password_hash=crypt($3,password_hash)) ok from users where id=$1 and hospital_id=$2 and active',[userId,hospitalId,String(current||'')])).rows[0];if(!ok?.ok)throw new HttpError(400,'Current password is incorrect.')
 await db.query("update users set password_hash=crypt($2,gen_salt('bf',10)),must_change_password=false,password_changed_at=now(),updated_at=now() where id=$1",[userId,pw]);await db.query("insert into audit_log(hospital_id,user_id,action,entity,entity_id) values($1,$2,'password_change','user',$2::text)",[hospitalId,userId]).catch(()=>{})}
/** Users holding a temporary password may only call routes that opt in (allowPasswordChange). */
export const passwordLocked=(u:{must_change_password?:boolean}|null|undefined,opts:{allowPasswordChange?:boolean}={})=>!!u?.must_change_password&&!opts.allowPasswordChange
