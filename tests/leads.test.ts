import {test} from 'node:test';import assert from 'node:assert/strict';import {freshDb} from './helpers';import {createLead,listLeads,updateLead} from '../lib/services/leads'
test('saas leads: validation, honeypot, per-IP rate limit, pipeline updates',async()=>{const db=await freshDb()
 await assert.rejects(createLead(db,{name:'A',hospitalName:'B',phone:'1'}),/name|mobile/i)
 await createLead(db,{name:'Dr Rao',hospitalName:'Rao Clinic',phone:'98765 43210',beds:'20'},'1.2.3.4');await createLead(db,{name:'Bot',hospitalName:'Spam',phone:'9999999999',website:'x'})
 let l=await listLeads(db);assert.equal(l.leads.length,1);assert.equal(l.leads[0].phone,'9876543210');assert.equal(l.counts.new,1);assert.ok(!JSON.stringify(l).includes('1.2.3.4'))
 for(let i=0;i<4;i++)await createLead(db,{name:'X'+i,hospitalName:'HH'+i,phone:'9876543210'},'5.5.5.5');await createLead(db,{name:'X5',hospitalName:'HH',phone:'9876543210'},'5.5.5.5');await assert.rejects(createLead(db,{name:'X6',hospitalName:'HH',phone:'9876543210'},'5.5.5.5'),/Too many/)
 await updateLead(db,l.leads[0].id,{status:'demo',notes:'Call Mon',nextFollowUp:'2026-10-26'});await assert.rejects(updateLead(db,l.leads[0].id,{status:'bogus'}),/stage/)
 l=await listLeads(db);const r=l.leads.find((x:any)=>x.name==='Dr Rao');assert.equal(r.status,'demo');assert.equal(r.notes,'Call Mon')})
