/** Admin-controlled role access: which staff role sees which menu item. A role_access row overrides the built-in
 *  default in lib/nav.ts (NAV[].roles). Admin always sees everything and Home stays on for everyone.
 *  Pages under /admin/ are backed by admin-only services, so they can be turned off for a role but not given to a new one. */
import {Ctx,Db,HttpError,audit} from './core'
import {NAV,ALWAYS_ON,Role,canSee} from '../nav'
export const STAFF_ROLES=['doctor','nurse','reception','lab','pharmacy','billing'] as const
export type StaffRole=typeof STAFF_ROLES[number]
const isStaff=(r:unknown):r is StaffRole=>STAFF_ROLES.includes(r as StaffRole)
const item=(path:unknown)=>NAV.find(n=>n.path===path)
export const narrowOnly=(path:string)=>path.startsWith('/admin/')
const groupOf=(n:typeof NAV[number])=>n.inSettings||n.path==='/admin/settings'?'settings':n.more?'more':'daily'
const ROLE_LABEL:Record<string,string>={doctor:'Doctor',nurse:'Nurse',reception:'Reception',lab:'Lab',pharmacy:'Pharmacy',billing:'Billing',admin:'Admin'}
function adminOnly(ctx:Ctx){if(ctx.role!=='admin')throw new HttpError(403,'Only the hospital admin can change who sees what.')}
async function overrides(db:Db,hospitalId:string,role?:string){const r=await db.query('select role,path,allowed from role_access where hospital_id=$1'+(role?' and role=$2':''),role?[hospitalId,role]:[hospitalId]);return r.rows as {role:string;path:string;allowed:boolean}[]}

/** The signed-in user's overrides (path → allowed), for the menu and page checks. Empty for admin. */
export async function accessFor(db:Db,ctx:Ctx):Promise<Record<string,boolean>>{if(!isStaff(ctx.role))return {};const o:Record<string,boolean>={};for(const x of await overrides(db,ctx.hospitalId,ctx.role))o[x.path]=x.allowed;return o}

/** API guard for an area's main routes: 403 when the admin turned that menu item off for this role. */
export async function requirePath(db:Db,ctx:Ctx,path:string){const n=item(path);if(!n||ctx.role==='admin'||path===ALWAYS_ON)return;if(canSee(ctx.role as Role,path,await accessFor(db,ctx)))return
 throw new HttpError(403,`${n.name} is turned off for the ${ROLE_LABEL[ctx.role]||ctx.role} role. Ask your hospital admin to turn it on in Settings → Roles & access.`,{noAccess:true,path})}

export async function accessMatrix(db:Db,ctx:Ctx){adminOnly(ctx);const ov=new Map((await overrides(db,ctx.hospitalId)).map(x=>[x.role+' '+x.path,x.allowed]))
 const items=NAV.map(n=>{const fixed=n.path===ALWAYS_ON;const cells:Record<string,{default:boolean;allowed:boolean;overridden:boolean}>={}
  for(const r of STAFF_ROLES){const d=n.roles.includes(r);const o=fixed?undefined:ov.get(r+' '+n.path);cells[r]={default:d,allowed:o==null?d:o,overridden:o!=null&&o!==d}}
  return {path:n.path,name:n.name,icon:n.icon,group:groupOf(n),module:n.module||null,locked:fixed,narrowOnly:narrowOnly(n.path),defaultRoles:n.roles.filter(r=>r!=='admin'),cells}})
 return {roles:STAFF_ROLES.map(r=>({role:r,label:ROLE_LABEL[r],overrides:items.filter(i=>i.cells[r].overridden).length})),items,overrides:items.reduce((s,i)=>s+STAFF_ROLES.filter(r=>i.cells[r].overridden).length,0)}}

export async function setAccess(db:Db,ctx:Ctx,b:{role?:unknown;path?:unknown;allowed?:unknown}){adminOnly(ctx)
 if(b.role==='admin')throw new HttpError(400,'Admin always sees every page, including Settings and Roles & access.')
 if(!isStaff(b.role))throw new HttpError(400,'Choose a staff role.');const n=item(b.path);if(!n)throw new HttpError(400,'Unknown menu item.')
 if(typeof b.allowed!=='boolean')throw new HttpError(400,'allowed must be true or false.')
 if(n.path===ALWAYS_ON)throw new HttpError(400,'Home stays on for everyone.')
 const role=b.role,allowed=b.allowed,def=n.roles.includes(role)
 if(allowed&&!def&&narrowOnly(n.path))throw new HttpError(400,`${n.name} only works for ${n.roles.filter(r=>r!=='admin').map(r=>ROLE_LABEL[r]).join(', ')||'the admin'}. It can be turned off, but not given to ${ROLE_LABEL[role]}.`,{narrowOnly:true})
 if(allowed===def)await db.query('delete from role_access where hospital_id=$1 and role=$2 and path=$3',[ctx.hospitalId,role,n.path])
 else await db.query('insert into role_access(hospital_id,role,path,allowed,updated_by) values($1,$2,$3,$4,$5) on conflict(hospital_id,role,path) do update set allowed=excluded.allowed,updated_by=excluded.updated_by,updated_at=now()',[ctx.hospitalId,role,n.path,allowed,ctx.userId])
 await audit(db,ctx,'role_access_set','role_access',null,{role,path:n.path,allowed,default:def})
 const warning=allowed&&!def?`${ROLE_LABEL[role]} now sees ${n.name}. Some actions on that page may still be limited to ${n.roles.filter(r=>r!=='admin').map(r=>ROLE_LABEL[r]).join(', ')||'the admin'}.`:null
 return {...await accessMatrix(db,ctx),warning}}

/** Back to the built-in defaults: one role, or every role when none is given. */
export async function resetAccess(db:Db,ctx:Ctx,b:{role?:unknown}={}){adminOnly(ctx);if(b.role!=null&&b.role!==''&&!isStaff(b.role))throw new HttpError(400,'Choose a staff role.')
 const role=b.role?String(b.role):null
 const r=await db.query('delete from role_access where hospital_id=$1'+(role?' and role=$2':'')+' returning path',role?[ctx.hospitalId,role]:[ctx.hospitalId])
 await audit(db,ctx,'role_access_reset','role_access',null,{role:role||'all',removed:r.rows.length})
 return {...await accessMatrix(db,ctx),removed:r.rows.length}}
