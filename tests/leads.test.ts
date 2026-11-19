import {test} from 'node:test';import assert from 'node:assert/strict';import {freshDb} from './helpers';import {createLead,ingestLead,listLeads,secretsMatch,updateLead} from '../lib/services/leads'
test('saas leads: validation, honeypot, per-IP rate limit, pipeline updates',async()=>{const db=await freshDb()
 await assert.rejects(createLead(db,{name:'A',hospitalName:'B',phone:'1'}),/name|mobile/i)
 await createLead(db,{name:'Dr Rao',hospitalName:'Rao Clinic',phone:'98765 43210',beds:'20'},'1.2.3.4');await createLead(db,{name:'Bot',hospitalName:'Spam',phone:'9999999999',website:'x'})
 let l=await listLeads(db);assert.equal(l.leads.length,1);assert.equal(l.leads[0].phone,'9876543210');assert.equal(l.counts.new,1);assert.ok(!JSON.stringify(l).includes('1.2.3.4'))
 for(let i=0;i<4;i++)await createLead(db,{name:'X'+i,hospitalName:'HH'+i,phone:'9876543210'},'5.5.5.5');await createLead(db,{name:'X5',hospitalName:'HH',phone:'9876543210'},'5.5.5.5');await assert.rejects(createLead(db,{name:'X6',hospitalName:'HH',phone:'9876543210'},'5.5.5.5'),/Too many/)
 await updateLead(db,l.leads[0].id,{status:'demo',notes:'Call Mon',nextFollowUp:'2026-10-26'});await assert.rejects(updateLead(db,l.leads[0].id,{status:'bogus'}),/stage/)
 l=await listLeads(db);const r=l.leads.find((x:any)=>x.name==='Dr Rao');assert.equal(r.status,'demo');assert.equal(r.notes,'Call Mon');assert.equal(r.product,'hospital_cloud')})
test('lead ingest: validation, product, dedupe, and rate limit',async()=>{const db=await freshDb()
 const body={name:'Ashish',email:'Lead@Example.com',product:'hospital_cloud',organisation:'Grey Nova',message:'Need a demo',source:'greynova.in',phone:'9876543210'}
 await assert.rejects(ingestLead(db,{...body,product:'pms'}),/product/i)
 await assert.rejects(ingestLead(db,{...body,email:'not-an-email'}),/email/i)
 await assert.rejects(ingestLead(db,{...body,organisation:'A'}),/organisation/i)
 const a=await ingestLead(db,body,'9.9.9.9')
 assert.equal(a.ok,true);assert.ok(a.id)
 const again=await ingestLead(db,{...body,name:'Someone else'},'9.9.9.9')
 assert.equal(again.id,a.id)
 const other=await ingestLead(db,{...body,message:'A different note',product:'taildesk'},'8.8.8.8')
 assert.notEqual(other.id,a.id)
 const listed=await listLeads(db)
 assert.equal(listed.leads.length,2)
 const first=listed.leads.find((x:any)=>x.id===a.id)
 assert.equal(first.email,'lead@example.com');assert.equal(first.product,'hospital_cloud');assert.equal(first.source,'greynova.in');assert.equal(first.hospital_name,'Grey Nova')
 assert.equal(listed.leads.find((x:any)=>x.id===other.id).product,'taildesk')
 for(let i=0;i<20;i++)await ingestLead(db,{...body,email:'n'+i+'@example.com',message:'note '+i},'7.7.7.7')
 await assert.rejects(ingestLead(db,{...body,email:'overflow@example.com',message:'one more'},'7.7.7.7'),/Too many/)
 assert.equal(secretsMatch('same','same'),true)
 assert.equal(secretsMatch('same','different'),false)
 assert.equal(secretsMatch('short','a-much-longer-secret'),false)})
test('lead ingest route refuses a missing or wrong secret',async()=>{
 const {POST}=await import('../app/api/platform/leads/ingest/route')
 const prev=process.env.LEAD_INGEST_SECRET
 delete process.env.LEAD_INGEST_SECRET
 const off=await POST(new Request('http://hms.local/api/platform/leads/ingest',{method:'POST',body:'{}'}))
 assert.equal(off.status,503)
 process.env.LEAD_INGEST_SECRET='unit-test-secret'
 const bad=await POST(new Request('http://hms.local/api/platform/leads/ingest',{method:'POST',headers:{'x-lead-ingest-secret':'wrong'},body:'{}'}))
 assert.equal(bad.status,401)
 if(prev===undefined)delete process.env.LEAD_INGEST_SECRET
 else process.env.LEAD_INGEST_SECRET=prev
})
