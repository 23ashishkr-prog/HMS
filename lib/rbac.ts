import {Role} from './auth'
export const allowedPaths:Record<Role,string[]>={
 admin:['/','/patients','/appointments','/queue','/clinical','/laboratory','/billing','/pharmacy'],
 reception:['/patients','/appointments','/queue','/laboratory'],
 doctor:['/queue','/patients','/clinical'],
 lab:['/laboratory'],
 pharmacy:['/pharmacy'],
 patient:['/patient-status']
}
export function canAccess(role:Role,path:string){return allowedPaths[role].some(p=>path===p||path.startsWith(p+'/'))}
