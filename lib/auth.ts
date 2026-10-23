import {cookies} from 'next/headers';import {SignJWT,jwtVerify} from 'jose';import {applySessionCookie} from './sessionCookie'
export type Role='admin'|'reception'|'doctor'|'nurse'|'lab'|'pharmacy'|'billing'|'patient'
export type Session={userId:string;hospitalId:string;email:string;name:string;role:Role}
const secret=()=>new TextEncoder().encode(process.env.SESSION_SECRET||'')
export async function createSession(res:Response,s:Session){if(!process.env.SESSION_SECRET)throw new Error('SESSION_SECRET is not configured');const token=await new SignJWT(s).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('12h').sign(secret());applySessionCookie(res,'hms_session',token,43200,'lax')}
export async function getSession():Promise<Session|null>{try{const token=(await cookies()).get('hms_session')?.value;if(!token||!process.env.SESSION_SECRET)return null;const {payload}=await jwtVerify(token,secret());return payload as unknown as Session}catch{return null}}
export function clearSession(res:Response){applySessionCookie(res,'hms_session','',0,'lax')}
export const homeForRole=(r:Role)=>({admin:'/',reception:'/frontdesk',doctor:'/opd',nurse:'/opd',lab:'/laboratory',pharmacy:'/pharmacy',billing:'/billing',patient:'/auth/login'} as Record<Role,string>)[r]