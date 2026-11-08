'use client'
import {useEffect,useState} from 'react';import {call} from '@/lib/client';import {toast,toastErr} from '@/lib/toast';import {viewerUrl} from '@/lib/radiology'
/** Admin: PACS viewer link template (OHIF / Orthanc style) with a live "test link" preview, plus the optional DICOMweb address. */
export default function PacsSettings(){const[x,setX]=useState<any>(null),[url,setUrl]=useState(''),[dw,setDw]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{call('/api/radiology/settings').then(r=>{setX(r);setUrl(r.viewerUrl);setDw(r.dicomwebUrl)}).catch(()=>setX({sample:null}))},[])
 if(!x?.sample)return null
 const preview=viewerUrl(url,x.sample)
 return <form className="panel modulePanel" onSubmit={async e=>{e.preventDefault();setBusy(true);try{setX(await call('/api/radiology/settings','PUT',{viewerUrl:url,dicomwebUrl:dw}));toast('PACS settings saved')}catch(er:any){toastErr(er)}finally{setBusy(false)}}}>
  <h3>PACS image viewer</h3><p className="muted"><small>“Open images” on the Radiology page and in the patient record opens this link in a new tab. Use the placeholders <code>{'{studyUid}'}</code>, <code>{'{accession}'}</code> and <code>{'{uhid}'}</code>. Example for OHIF: <code>{'https://pacs.example.in/viewer?StudyInstanceUIDs={studyUid}'}</code>. Images stay in your PACS; this app only stores the link details.</small></p>
  <div className="formGrid"><label style={{gridColumn:'1/-1'}}>Viewer link template<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://pacs.example.in/viewer?StudyInstanceUIDs={studyUid}&accession={accession}"/></label>
  <label style={{gridColumn:'1/-1'}}>DICOMweb base address (optional)<input value={dw} onChange={e=>setDw(e.target.value)} placeholder="https://pacs.example.in/dicom-web"/></label></div>
  <p><small>Test link: {preview?<a href={preview} target="_blank" rel="noreferrer">{preview}</a>:<span className="muted">{url?'needs https:// and at least one placeholder':'not set'}</span>}</small></p>
  <button className="primary" disabled={busy}>Save</button></form>}
