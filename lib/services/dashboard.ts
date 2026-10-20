import {Ctx,Db,requireRole,today} from './core'
export async function dashboard(db:Db,ctx:Ctx){requireRole(ctx,['admin']);const d=today();const r=await db.query(`select
 (select count(*)::int from patients where hospital_id=$1) patients,
 (select count(*)::int from patients where hospital_id=$1 and (created_at at time zone 'Asia/Kolkata')::date=$2::date) registered_today,
 (select count(*)::int from doctor_queue where hospital_id=$1 and visit_date=$2) opd_today,
 (select count(*)::int from doctor_queue where hospital_id=$1 and visit_date=$2 and status='waiting') waiting,
 (select count(*)::int from appointments where hospital_id=$1 and (scheduled_at at time zone 'Asia/Kolkata')::date=$2::date and status<>'cancelled') appointments_today,
 (select count(*)::int from admissions where hospital_id=$1 and status='admitted') inpatients,
 (select count(*)::int from beds where hospital_id=$1 and active) beds,
 (select count(*)::int from diagnostic_orders where hospital_id=$1 and status in ('ordered','sample_collected')) pending_orders,
 (select coalesce(sum(amount),0)::float from payments where hospital_id=$1 and (received_at at time zone 'Asia/Kolkata')::date=$2::date) collections_today`,[ctx.hospitalId,d]);return r.rows[0]}
export async function auditLog(db:Db,ctx:Ctx){requireRole(ctx,['admin']);return (await db.query('select a.*,u.full_name,u.role from audit_log a left join users u on u.id=a.user_id where a.hospital_id=$1 order by a.created_at desc limit 200',[ctx.hospitalId])).rows}
