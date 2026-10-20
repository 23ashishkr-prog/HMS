import type {IconName} from '@/components/Icon3D'
export type Role='admin'|'reception'|'doctor'|'nurse'|'lab'|'pharmacy'|'billing'|'patient'
export type NavItem={name:string;icon:IconName;path:string;roles:Role[];more?:boolean}
/** Primary = the handful of daily-use desks; "more" = secondary menu. */
export const NAV:NavItem[]=[
 {name:'Dashboard',icon:'dashboard',path:'/',roles:['admin']},
 {name:'Front desk',icon:'frontdesk',path:'/frontdesk',roles:['admin','reception']},
 {name:'Doctor desk',icon:'doctor',path:'/opd',roles:['admin','doctor','nurse']},
 {name:'Billing',icon:'billing',path:'/billing',roles:['admin','billing','reception']},
 {name:'Pharmacy',icon:'pharmacy',path:'/pharmacy',roles:['admin','pharmacy']},
 {name:'Lab worklist',icon:'lab',path:'/laboratory',roles:['admin','lab']},
 {name:'IPD beds',icon:'ipd',path:'/ipd',roles:['admin','reception','doctor','nurse','billing']},
 {name:'Patients',icon:'patients',path:'/patients',roles:['admin','reception','doctor','nurse','billing'],more:true},
 {name:'Appointments',icon:'calendar',path:'/appointments',roles:['admin','reception','doctor'],more:true},
 {name:'Follow-ups',icon:'calendar',path:'/followups',roles:['admin','reception','doctor'],more:true},
 {name:'Insurance / TPA',icon:'insurance',path:'/insurance',roles:['admin','billing'],more:true},
 {name:'Settings & staff',icon:'settings',path:'/admin/settings',roles:['admin'],more:true},
 {name:'Audit log',icon:'audit',path:'/admin/audit',roles:['admin'],more:true}]
export const HOME:Record<Role,string>={admin:'/',reception:'/frontdesk',doctor:'/opd',nurse:'/opd',lab:'/laboratory',pharmacy:'/pharmacy',billing:'/billing',patient:'/auth/login'}
