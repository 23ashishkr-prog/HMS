import type {IconName} from '@/components/Icon3D'
export type Role='admin'|'reception'|'doctor'|'nurse'|'lab'|'pharmacy'|'billing'|'patient'
export type NavItem={name:string;icon:IconName;path:string;roles:Role[];more?:boolean;module?:string;inSettings?:boolean}
/** Primary = the handful of daily-use desks; "more" = secondary menu.
 *  module = plan entitlement required (omit = always shown when role matches).
 *  inSettings = opened from Settings for admins, so it is not repeated in the admin's side menu. */
export const NAV:NavItem[]=[
 {name:'Home',icon:'dashboard',path:'/dashboard',roles:['admin','reception','doctor','nurse','lab','pharmacy','billing']},
 {name:'Reception',icon:'frontdesk',path:'/frontdesk',roles:['admin','reception'],module:'queue'},
 {name:'Doctor',icon:'doctor',path:'/opd',roles:['admin','doctor','nurse'],module:'opd'},
 {name:'Bills',icon:'billing',path:'/billing',roles:['admin','billing','reception'],module:'billing'},
 {name:'Pharmacy',icon:'pharmacy',path:'/pharmacy',roles:['admin','pharmacy'],module:'pharmacy'},
 {name:'Lab',icon:'lab',path:'/laboratory',roles:['admin','lab'],module:'lab'},
 {name:'Beds',icon:'ipd',path:'/ipd',roles:['admin','reception','doctor','nurse','billing'],module:'ipd'},
 {name:'Ready to leave',icon:'audit',path:'/clearance',roles:['admin','billing','reception','doctor','nurse','lab','pharmacy'],module:'billing'},
 {name:'Patients',icon:'patients',path:'/patients',roles:['admin','reception','doctor','nurse','billing'],more:true,module:'patients'},
 {name:'Appointments',icon:'calendar',path:'/appointments',roles:['admin','reception','doctor'],more:true,module:'appointments'},
 {name:'Doctor hours',icon:'calendar',path:'/schedules',roles:['admin','doctor','reception'],more:true,module:'appointments'},
 {name:'Follow-ups',icon:'calendar',path:'/followups',roles:['admin','reception','doctor'],more:true,module:'appointments'},
 {name:'Insurance',icon:'insurance',path:'/insurance',roles:['admin','billing'],more:true,module:'insurance'},
 {name:'Check-in code',icon:'queue',path:'/checkin-qr',roles:['admin','reception'],more:true,module:'queue',inSettings:true},
 {name:'End of day',icon:'money',path:'/admin/closeout',roles:['admin'],more:true,module:'billing',inSettings:true},
 {name:'Settings',icon:'settings',path:'/admin/settings',roles:['admin','billing'],more:true},
 {name:'Import records',icon:'audit',path:'/admin/import',roles:['admin'],more:true,module:'bulk',inSettings:true},
 {name:'Activity',icon:'audit',path:'/admin/audit',roles:['admin'],more:true,module:'audit',inSettings:true}]
export const HOME:Record<Role,string>={admin:'/dashboard',reception:'/frontdesk',doctor:'/opd',nurse:'/opd',lab:'/laboratory',pharmacy:'/pharmacy',billing:'/billing',patient:'/auth/login'}
/** Filter by role + plan modules. Locked items returned separately for upgrade CTA. */
export function navFor(role:Role,modules?:string[]|null){const mods=modules||null;const open:NavItem[]=[],locked:NavItem[]=[]
 for(const n of NAV){if(!n.roles.includes(role))continue;if(n.inSettings&&role==='admin')continue;if(n.module&&mods&&!mods.includes(n.module))locked.push(n);else open.push(n)}
 return {open,locked}}
