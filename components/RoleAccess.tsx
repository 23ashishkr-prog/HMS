'use client'
import {useEffect,useState} from 'react'
import {call} from '@/lib/client'
import {toast,toastErr} from '@/lib/toast'
import {PageSkeleton} from './Tabs'
import {useI18n} from './I18n'
const GROUPS:[string,string][]=[['daily','Daily desks'],['more','More'],['settings','Settings']]
/** Settings → Roles & access: menu items × staff roles. Each toggle saves at once; changed cells are marked. Admin only. */
export default function RoleAccess(){const {t}=useI18n();const[m,setM]=useState<any>(null),[err,setErr]=useState(''),[busy,setBusy]=useState('')
 useEffect(()=>{call('/api/settings/roles').then(setM).catch(e=>setErr(e.message))},[])
 if(!m)return <div className="panel modulePanel">{err?<p className="err">{err}</p>:<PageSkeleton/>}</div>
 const set=async(role:string,path:string,allowed:boolean)=>{const k=role+path;setBusy(k);try{const x=await call('/api/settings/roles','PUT',{role,path,allowed});setM(x);toast(x.warning||t('Saved'),x.warning?'info':'ok')}catch(e){toastErr(e)}finally{setBusy('')}}
 const reset=async(role?:string)=>{const label=role?m.roles.find((r:any)=>r.role===role)?.label:'every role';if(!confirm(`Reset ${label} to the default menu?`))return;try{const x=await call('/api/settings/roles'+(role?'?role='+role:''),'DELETE');setM(x);toast(x.removed?`Reset ${label} (${x.removed} change${x.removed===1?'':'s'} removed)`:'Already on the default')}catch(e){toastErr(e)}}
 return <div className="panel modulePanel roleAccess">
 <div className="actionRow"><p className="muted" style={{margin:0,flex:1}}>{t('Choose which menu items each role sees. Changes save at once and apply the next time staff open a page.')} <span className="raMark" aria-hidden>●</span> {t('= changed from the default.')} {t('Admin always sees everything; Home stays on for everyone.')}</p><button className="ghost" disabled={!m.overrides} onClick={()=>reset()}>{t('Reset all to default')}</button></div>
 <div className="raScroll"><table className="dataTable raTable"><thead><tr><th>{t('Menu item')}</th><th>{t('Admin')}</th>{m.roles.map((r:any)=><th key={r.role}>{t(r.label)}{r.overrides>0&&<button className="ghost raReset" title={`Reset ${r.label} to default`} onClick={()=>reset(r.role)}>{t('Reset')}</button>}</th>)}</tr></thead>
 {GROUPS.map(([g,label])=>{const rows=m.items.filter((i:any)=>i.group===g);if(!rows.length)return null;return <tbody key={g}><tr className="raGroup"><th colSpan={m.roles.length+2}>{t(label)}</th></tr>
  {rows.map((i:any)=><tr key={i.path}><th scope="row">{t(i.name)}{i.narrowOnly&&<small className="muted" title="Backed by admin-only actions: can be turned off, not given to new roles"> · {t('turn off only')}</small>}</th><td className="raCell"><input type="checkbox" checked disabled aria-label={`${i.name} for Admin (always on)`}/></td>
  {m.roles.map((r:any)=>{const c=i.cells[r.role];const off=i.locked||busy===r.role+i.path||(i.narrowOnly&&!c.default&&!c.allowed);return <td key={r.role} className={'raCell'+(c.overridden?' ovr':'')}><label className="raToggle" title={c.overridden?`Changed (default: ${c.default?'on':'off'})`:i.locked?'Always on':''}><input type="checkbox" checked={c.allowed} disabled={off} aria-label={`${i.name} for ${r.label}`} onChange={e=>set(r.role,i.path,e.target.checked)}/>{c.overridden&&<span className="raMark" aria-label="changed">●</span>}</label></td>})}</tr>)}</tbody>})}
 </table></div>
 <p className="muted"><small>{t('Turning an item off hides it from the menu, shows a “no access” page, and blocks that desk’s main data. Turning an item on for a new role shows the page, but some actions may still be limited to the roles that normally use it.')}</small></p>
 </div>}
