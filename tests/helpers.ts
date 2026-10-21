import {PGlite} from '@electric-sql/pglite';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto'
// @ts-ignore - plain JS module
import {migrate} from '../scripts/migrate.mjs'
import {Ctx,Db} from '../lib/services/core';import {onboardHospital,createStaff} from '../lib/services/tenancy'
/** Real Postgres (PGlite, in-process) with all migrations applied. No fixtures are loaded. */
export async function freshDb():Promise<Db>{const pg=new PGlite({extensions:{pgcrypto}});await migrate(pg);return pg as unknown as Db}
export async function tenant(db:Db,name:string,plan='ai_engage'){const h=await onboardHospital(db,{hospitalName:name,adminName:name+' Admin',adminEmail:'admin@'+name.toLowerCase().replace(/\W/g,'')+'.in',password:'S3cure-pass!',planCode:plan});const admin:Ctx={hospitalId:h.hospitalId,userId:h.adminUserId,role:'admin'};const mk=async(role:Ctx['role'],n:string)=>{const u=await createStaff(db,admin,{role,fullName:n,email:n.toLowerCase().replace(/\W/g,'')+'@'+h.code.toLowerCase()+'.in',password:'S3cure-pass!'});return {hospitalId:h.hospitalId,userId:u.id,role} as Ctx};return {h,admin,mk}}
