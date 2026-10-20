import {Role} from './auth'
export const allowedPaths:Record<Role,string[]>={
 admin:['/','/patients','/appointments','/opd','/queue','/clinical','/laboratory','/billing','/pharmacy','/ipd','/insurance','/admin'],
 reception:['/patients','/appointments','/opd','/laboratory','/billing','/ipd'],
 doctor:['/opd','/queue','/patients','/clinical','/ipd','/appointments'],
 nurse:['/opd','/ipd','/patients'],
 lab:['/laboratory'],
 pharmacy:['/pharmacy'],
 billing:['/billing','/insurance','/patients','/ipd'],
 patient:[]
}
export function canAccess(role:Role,path:string){return (allowedPaths[role]||[]).some(p=>path===p||path.startsWith(p+'/'))}
