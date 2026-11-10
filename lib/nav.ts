import type {IconName} from '@/components/Icon3D'
export type Role='admin'|'reception'|'doctor'|'nurse'|'lab'|'pharmacy'|'billing'|'patient'
export type NavGroup='front'|'clinical'|'diagnostics'|'billing'|'manage'
export type NavItem={name:string;icon:IconName;path:string;roles:Role[];more?:boolean;module?:string;inSettings?:boolean;group?:NavGroup}
/** Sections of the admin's side menu (and the phone "All modules" sheet), in display order. */
export const NAV_GROUPS:[NavGroup,string][]=[['front','Front office'],['clinical','Clinical'],['diagnostics','Lab & pharmacy'],['billing','Billing'],['manage','Management']]
/** Items split into NAV_GROUPS; items without a group (Home) come back in `top`. */
export function groupNav<T extends {group?:NavGroup}>(items:T[]){return {top:items.filter(n=>!n.group),groups:NAV_GROUPS.map(([key,label])=>({key,label,items:items.filter(n=>n.group===key)})).filter(g=>g.items.length)}}
/** Primary = the handful of daily-use desks; "more" = secondary menu.
 *  module = plan entitlement required (omit = always shown when role matches).
 *  inSettings = opened from Settings for admins, so it is not repeated in the admin's side menu. */
export const NAV:NavItem[]=[
 {name:'Home',icon:'dashboard',path:'/dashboard',roles:['admin','reception','doctor','nurse','lab','pharmacy','billing']},
 {name:'Reception',icon:'frontdesk',path:'/frontdesk',roles:['admin','reception'],module:'queue',group:'front'},
 {name:'Doctor',icon:'doctor',path:'/opd',roles:['admin','doctor','nurse'],module:'opd',group:'clinical'},
 {name:'Bills',icon:'billing',path:'/billing',roles:['admin','billing','reception'],module:'billing',group:'billing'},
 {name:'Pharmacy',icon:'pharmacy',path:'/pharmacy',roles:['admin','pharmacy'],module:'pharmacy',group:'diagnostics'},
 {name:'Lab',icon:'lab',path:'/laboratory',roles:['admin','lab'],module:'lab',group:'diagnostics'},
 {name:'Radiology',icon:'lab',path:'/radiology',roles:['admin','lab','doctor'],module:'lab',group:'diagnostics'},
 {name:'Beds',icon:'ipd',path:'/ipd',roles:['admin','reception','doctor','nurse','billing'],module:'ipd',group:'clinical'},
 {name:'Operation theatre',icon:'beds',path:'/ot',roles:['admin','doctor','nurse'],module:'ipd',group:'clinical'},
 {name:'Emergency',icon:'queue',path:'/emergency',roles:['admin','doctor','nurse','reception'],module:'opd',group:'clinical'},
 {name:'Ready to leave',icon:'audit',path:'/clearance',roles:['admin','billing','reception','doctor','nurse','lab','pharmacy'],module:'billing',group:'billing'},
 {name:'Patients',icon:'patients',path:'/patients',roles:['admin','reception','doctor','nurse','billing'],more:true,module:'patients',group:'front'},
 {name:'Appointments',icon:'calendar',path:'/appointments',roles:['admin','reception','doctor'],more:true,module:'appointments',group:'front'},
 {name:'Patient flow',icon:'dashboard',path:'/admin/flow',roles:['admin'],more:true,group:'manage'},
 {name:'AI agents',icon:'audit',path:'/agents',roles:['admin','pharmacy'],more:true,group:'manage'},
 {name:'ABDM',icon:'patients',path:'/abdm',roles:['admin'],more:true,module:'patients',group:'manage'},
 {name:'Staff roster',icon:'calendar',path:'/schedules',roles:['admin','doctor','nurse','reception','lab','pharmacy','billing'],more:true,group:'manage'},
 {name:'Follow-ups',icon:'calendar',path:'/followups',roles:['admin','reception','doctor'],more:true,module:'appointments',group:'front'},
 {name:'Insurance',icon:'insurance',path:'/insurance',roles:['admin','billing'],more:true,module:'insurance',group:'billing'},
 {name:'Check-in code',icon:'queue',path:'/checkin-qr',roles:['admin','reception'],more:true,module:'queue',inSettings:true,group:'front'},
 {name:'End of day',icon:'money',path:'/admin/closeout',roles:['admin'],more:true,module:'billing',inSettings:true,group:'billing'},
 {name:'Settings',icon:'settings',path:'/admin/settings',roles:['admin','billing'],more:true,group:'manage'},
 {name:'Import records',icon:'audit',path:'/admin/import',roles:['admin'],more:true,module:'bulk',inSettings:true,group:'manage'},
 {name:'Activity',icon:'audit',path:'/admin/audit',roles:['admin'],more:true,module:'audit',inSettings:true,group:'manage'}]
export const HOME:Record<Role,string>={admin:'/dashboard',reception:'/frontdesk',doctor:'/opd',nurse:'/opd',lab:'/laboratory',pharmacy:'/pharmacy',billing:'/billing',patient:'/auth/login'}
/** Filter by role + plan modules. Locked items returned separately for upgrade CTA. */
/** Role access with the hospital's overrides (Settings → Roles & access): path → allowed. Admin and Home are fixed. */
export type Access=Record<string,boolean>|null|undefined
export const ALWAYS_ON='/dashboard'
export function canSee(role:Role,path:string,access?:Access){const n=NAV.find(x=>x.path===path);if(!n)return true;if(role==='admin'||path===ALWAYS_ON||!access||access[path]==null)return n.roles.includes(role);return !!access[path]}
export function navFor(role:Role,modules?:string[]|null,access?:Access){const mods=modules||null;const open:NavItem[]=[],locked:NavItem[]=[]
 for(const n of NAV){if(!canSee(role,n.path,access))continue;if(n.inSettings&&role==='admin')continue;if(n.module&&mods&&!mods.includes(n.module))locked.push(n);else open.push(n)}
 return {open,locked}}
