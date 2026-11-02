import {Role} from './auth'
export const allowedPaths:Record<Role,string[]>={
 admin:['/','/patients','/appointments','/opd','/queue','/clinical','/laboratory','/billing','/pharmacy','/ipd','/insurance','/admin','/clearance'],
 reception:['/patients','/appointments','/opd','/laboratory','/billing','/ipd','/clearance'],
 doctor:['/opd','/queue','/patients','/clinical','/ipd','/appointments','/clearance'],
 nurse:['/opd','/ipd','/patients','/clearance'],
 lab:['/laboratory','/clearance'],
 pharmacy:['/pharmacy','/clearance'],
 billing:['/billing','/insurance','/patients','/ipd','/clearance'],
 patient:[]
}
export function canAccess(role:Role,path:string){return (allowedPaths[role]||[]).some(p=>path===p||path.startsWith(p+'/'))}
