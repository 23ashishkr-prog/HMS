import type {IconName} from '@/components/Icon3D'
export type Role='admin'|'reception'|'doctor'|'nurse'|'lab'|'pharmacy'|'billing'|'patient'
export type NavItem={name:string;icon:IconName;path:string;roles:Role[];more?:boolean;module?:string}
/** Primary = the handful of daily-use desks; "more" = secondary menu.
 *  module = plan entitlement required (omit = always shown when role matches). */
export const NAV:NavItem[]=[
 {name:'Home',icon:'dashboard',path:'/',roles:['admin','reception','doctor','nurse','lab','pharmacy','billing']},
 {name:'Front desk',icon:'frontdesk',path:'/frontdesk',roles:['admin','reception'],module:'queue'},
 {name:'Doctor desk',icon:'doctor',path:'/opd',roles:['admin','doctor','nurse'],module:'opd'},
 {name:'Billing',icon:'billing',path:'/billing',roles:['admin','billing','reception'],module:'billing'},
 {name:'Pharmacy',icon:'pharmacy',path:'/pharmacy',roles:['admin','pharmacy'],module:'pharmacy'},
 {name:'Lab worklist',icon:'lab',path:'/laboratory',roles:['admin','lab'],module:'lab'},
 {name:'IPD beds',icon:'ipd',path:'/ipd',roles:['admin','reception','doctor','nurse','billing'],module:'ipd'},
 {name:'Patients',icon:'patients',path:'/patients',roles:['admin','reception','doctor','nurse','billing'],more:true,module:'patients'},
 {name:'Appointments',icon:'calendar',path:'/appointments',roles:['admin','reception','doctor'],more:true,module:'appointments'},
 {name:'Doctor schedules',icon:'calendar',path:'/schedules',roles:['admin','doctor','reception'],more:true,module:'appointments'},
 {name:'Follow-ups',icon:'calendar',path:'/followups',roles:['admin','reception','doctor'],more:true,module:'appointments'},
 {name:'Insurance / TPA',icon:'insurance',path:'/insurance',roles:['admin','billing'],more:true,module:'insurance'},
 {name:'Users & access',icon:'patients',path:'/admin/users',roles:['admin'],more:true},
 {name:'Settings',icon:'settings',path:'/admin/settings',roles:['admin'],more:true},
 {name:'Integrations',icon:'settings',path:'/admin/integrations',roles:['admin'],more:true},
 {name:'Setup wizard',icon:'settings',path:'/admin/setup',roles:['admin'],more:true},
 {name:'Bulk import',icon:'audit',path:'/admin/import',roles:['admin'],more:true,module:'bulk'},
 {name:'Audit log',icon:'audit',path:'/admin/audit',roles:['admin'],more:true,module:'audit'}]
export const HOME:Record<Role,string>={admin:'/',reception:'/frontdesk',doctor:'/opd',nurse:'/opd',lab:'/laboratory',pharmacy:'/pharmacy',billing:'/billing',patient:'/auth/login'}
/** Filter by role + plan modules. Locked items returned separately for upgrade CTA. */
export function navFor(role:Role,modules?:string[]|null){const mods=modules||null;const open:NavItem[]=[],locked:NavItem[]=[]
 for(const n of NAV){if(!n.roles.includes(role))continue;if(n.module&&mods&&!mods.includes(n.module))locked.push(n);else open.push(n)}
 return {open,locked}}
