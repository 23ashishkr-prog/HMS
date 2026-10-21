'use client'
import {useEffect,useMemo,useState} from 'react';import ModuleShell from '@/components/ModuleShell';import {call,dt} from '@/lib/client';import {NAV,Role} from '@/lib/nav';import {toast} from '@/lib/toast'
const ROLES=['admin','reception','doctor','nurse','lab','pharmacy','billing'] as const
const LABEL:Record<string,string>={admin:'Admin',reception:'Reception',doctor:'Doctor',nurse:'Nurse',lab:'Lab',pharmacy:'Pharmacy',billing:'Billing'}
const access=(r:string)=>NAV.filter(n=>n.roles.includes(r as Role)).map(n=>n.name)
const initials=(n:string)=>n.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase()
async function shrink(f:File):Promise<string>{const img=await createImageBitmap(f);const s=Math.min(1,256/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d')!.drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.82)}
export default function Users(){const[users,setUsers]=useState<any[]>([]),[err,setErr]=useState(''),[edit,setEdit]=useState<any|null>(null),[pw,setPw]=useState<any|null>(null),[q,setQ]=useState(''),[role,setRole]=useState('all'),[busy,setBusy]=useState(false)
 const load=()=>call('/api/staff').then(x=>setUsers(x.users)).catch(e=>setErr(e.message));useEffect(()=>{load()},[])
 const list=useMemo(()=>users.filter(u=>(role==='all'||u.role===role)&&(!q||(u.full_name+' '+u.email+' '+(u.department||'')).toLowerCase().includes(q.toLowerCase()))),[users,q,role])
 const counts=useMemo(()=>Object.fromEntries(ROLES.map(r=>[r,users.filter(u=>u.role===r&&u.active).length])),[users])
 async function save(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const b:any={};for(const k of ['fullName','email','role','phone','department','designation','registrationNo'])b[k]=String(f.get(k)||'');if(edit.photoUrl!==undefined)b.photoUrl=edit.photoUrl;setBusy(true);try{if(edit.id){await call('/api/staff/'+edit.id,'PATCH',b);toast('User updated')}else{b.password=String(f.get('password')||'');await call('/api/staff','POST',b);toast('User added. They must change the password at first login.')}setEdit(null);load()}catch(x:any){toast(x.message,'err')}finally{setBusy(false)}}
 return <ModuleShell title="Users & access" eyebrow="ADMINISTRATION" description="Add staff, set their role and profile, reset passwords and deactivate leavers. Each role only sees its own modules." actions={<button className="primary" onClick={()=>setEdit({role:'reception'})}>+ Add user</button>}>
 {err&&<p className="err">{err}</p>}
 <div className="roleChips">{ROLES.map(r=><button key={r} className={'chip'+(role===r?' on':'')} onClick={()=>setRole(role===r?'all':r)}>{LABEL[r]} <b>{counts[r]||0}</b></button>)}</div>
 <div className="panel modulePanel"><div className="actionRow"><input className="moduleInput" placeholder="Search name, email or department" value={q} onChange={e=>setQ(e.target.value)}/></div>
 <table className="dataTable userTable"><thead><tr><th>User</th><th>Role</th><th>Department</th><th>Phone</th><th>Last login</th><th>Status</th><th></th></tr></thead><tbody>{list.map(u=><tr key={u.id} className={u.active?'':'inactive'}>
 <td><div className="userCell">{u.photo_url?<img src={u.photo_url} alt=""/>:<span className="ava">{initials(u.full_name)}</span>}<span><b>{u.full_name}</b><small>{u.email}{u.registration_no?' · Reg '+u.registration_no:''}</small></span></div></td>
 <td><span className="pill">{LABEL[u.role]||u.role}</span></td><td>{u.department||'—'}</td><td>{u.phone||'—'}</td><td>{u.last_login_at?dt(u.last_login_at):'Never'}</td>
 <td>{u.active?<span className="pill okPill">Active</span>:<span className="pill warnPill">Inactive</span>}{u.must_change_password&&u.active&&<small className="muted"> · temp password</small>}</td>
 <td><div className="rowActions"><button className="ghost" onClick={()=>setEdit({...u,photoUrl:undefined})}>Edit</button><button className="ghost" onClick={()=>setPw(u)}>Reset password</button><button className="ghost" onClick={async()=>{if(u.active&&!confirm('Deactivate '+u.full_name+'? They will be signed out and cannot log in.'))return;try{await call('/api/staff/'+u.id,'PATCH',{active:!u.active});toast(u.active?'User deactivated':'User re-activated');load()}catch(x:any){toast(x.message,'err')}}}>{u.active?'Deactivate':'Activate'}</button></div></td></tr>)}</tbody></table>
 {list.length===0&&<p className="emptyState">No users match.</p>}</div>
 {edit&&<div className="modalBackdrop" onClick={()=>setEdit(null)}><div className="modal wide" onClick={e=>e.stopPropagation()}><div className="sheetHead"><h2>{edit.id?'Edit '+edit.full_name:'Add user'}</h2><button className="ghost" aria-label="Close" onClick={()=>setEdit(null)}>✕</button></div>
 <form className="formGrid" onSubmit={save}>
 <label>Full name *<input name="fullName" defaultValue={edit.full_name||''} required/></label>
 <label>Email (login) *<input name="email" type="email" defaultValue={edit.email||''} required/></label>
 <label>Role *<select name="role" defaultValue={edit.role} onChange={e=>setEdit({...edit,role:e.target.value})}>{ROLES.map(r=><option key={r} value={r}>{LABEL[r]}</option>)}</select></label>
 <label>Phone<input name="phone" inputMode="tel" defaultValue={edit.phone||''}/></label>
 <label>Department<input name="department" defaultValue={edit.department||''} placeholder="e.g. General Medicine"/></label>
 <label>Designation<input name="designation" defaultValue={edit.designation||''} placeholder="e.g. Consultant"/></label>
 {edit.role==='doctor'&&<label>Medical registration no.<input name="registrationNo" defaultValue={edit.registration_no||''} placeholder="e.g. DMC/12345"/></label>}
 <label>Photo (optional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{const f=e.target.files?.[0];if(f)setEdit({...edit,photoUrl:await shrink(f)})}}/></label>
 {!edit.id&&<label>Temporary password (10+) *<input name="password" type="password" minLength={10} autoComplete="new-password" required/></label>}
 <div className="accessBox"><b>Modules this role can open</b><div>{access(edit.role).map(n=><span key={n} className="pill">{n}</span>)}</div></div>
 <button className="primary" disabled={busy}>{busy?'Saving…':edit.id?'Save changes':'Add user'}</button></form></div></div>}
 {pw&&<div className="modalBackdrop" onClick={()=>setPw(null)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="sheetHead"><h2>Reset password</h2><button className="ghost" aria-label="Close" onClick={()=>setPw(null)}>✕</button></div><p className="muted">Set a temporary password for <b>{pw.full_name}</b>. They must choose a new one at next login. Share it privately.</p>
 <form className="formGrid" onSubmit={async e=>{e.preventDefault();const p=String(new FormData(e.currentTarget).get('password')||'');try{await call('/api/admin/users/'+pw.id+'/password','PUT',{password:p});toast('Temporary password set');setPw(null);load()}catch(x:any){toast(x.message,'err')}}}><label>Temporary password (10+)<input name="password" type="password" minLength={10} autoComplete="new-password" required/></label><button className="primary">Set password</button></form></div></div>}
 </ModuleShell>}
