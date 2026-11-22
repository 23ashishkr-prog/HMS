import {test} from 'node:test';import assert from 'node:assert/strict'
import {checkOfflineReplay,checkOfflineWrite,issueLicence,licenceKey,signLicence,verifyLicence,OFFLINE_DAYS} from '../lib/offlineLicence'
import {fromServer,offlineMode,touch} from '../lib/offline/licenceState'
const DAY=864e5,T0=Date.UTC(2026,10,1)
const key=licenceKey({SESSION_SECRET:'test-secret-test-secret-test-secret'})
const ok=(o:any)=>{if(!o.ok)throw new Error('expected a licence');return o}
const issue=(now=T0,extra:any={})=>issueLicence({hospitalId:'h1',userId:'u1',usable:true,status:'active',...extra},now,key)

test('licence: a usable plan gets 30 days, signed by the server',()=>{
 const r=ok(issue());assert.equal(r.licence.until-r.licence.iat,OFFLINE_DAYS*DAY)
 assert.equal(verifyLicence(r.token,{key,now:T0+DAY,tenantId:'h1'}).ok,true)})

test('licence: plan on hold → locked; Live mode → disabled',()=>{
 assert.deepEqual(issue(T0,{usable:false,status:'on_hold'}),{ok:false,locked:true,status:'on_hold',serverTime:T0})
 assert.deepEqual(issue(T0,{offlineEnabled:false}),{ok:false,disabled:true,serverTime:T0})})

test('licence: the client cannot extend or forge it',()=>{
 const r=ok(issue());const sig=r.token.split('.')[1]
 const longer=Buffer.from(JSON.stringify({...r.licence,until:r.licence.until+365*DAY})).toString('base64url')
 assert.deepEqual(verifyLicence(longer+'.'+sig,{key,now:T0}),{ok:false,reason:'bad_signature'})
 assert.deepEqual(verifyLicence(signLicence(r.licence,licenceKey({SESSION_SECRET:'some-other-secret-1234567'})),{key,now:T0}),{ok:false,reason:'bad_signature'})
 assert.deepEqual(verifyLicence(r.token,{key,now:T0,tenantId:'h2'}),{ok:false,reason:'wrong_tenant'})
 assert.deepEqual(verifyLicence('nonsense',{key}),{ok:false,reason:'malformed'})})

test('licence: expires after 30 days; renews only after the plan is re-checked',()=>{
 const r=ok(issue());assert.deepEqual(verifyLicence(r.token,{key,now:T0+31*DAY}),{ok:false,reason:'expired'})
 assert.equal(ok(issue(T0+31*DAY)).licence.until,T0+61*DAY)
 assert.equal(issue(T0+31*DAY,{usable:false,status:'expired'}).ok,false)})

test('licence on the device: days left, expiry, clock wound back, renewal',()=>{
 const r=ok(issue());let rec=fromServer({token:r.token,serverTime:T0},T0)
 assert.deepEqual(offlineMode(rec,T0+25.5*DAY),{mode:'ready',daysLeft:5,until:T0+30*DAY,now:T0+25.5*DAY})
 rec=touch(rec,T0+31*DAY);assert.equal(offlineMode(rec,T0+31*DAY).mode,'expired')
 assert.equal(offlineMode(rec,T0+DAY).mode,'expired') // device clock set back: still expired
 const again=ok(issue(T0+31*DAY));assert.equal(offlineMode(fromServer({token:again.token,serverTime:T0+31*DAY},T0+31*DAY,rec),T0+31*DAY).mode,'ready')
 assert.equal(offlineMode(fromServer({locked:true,status:'on_hold',serverTime:T0},T0),T0).mode,'locked')})

test('server: offline replays must fall inside their licence',()=>{
 const r=ok(issue());const req=(at:number,lic?:string|null)=>new Request('http://x/api/frontdesk',{method:'POST',headers:{'x-offline-queued-at':String(at),...(lic?{'x-offline-licence':lic}:{})}})
 const now=T0+31*DAY
 assert.doesNotThrow(()=>checkOfflineReplay(req(T0+29*DAY,r.token),'h1',now,key)) // made on day 29, synced on day 31
 assert.throws(()=>checkOfflineReplay(req(T0+30*DAY+1000,r.token),'h1',now,key),/ran out/)
 assert.throws(()=>checkOfflineReplay(req(T0+29*DAY,r.token),'h2',now,key),/no valid offline licence/)
 assert.throws(()=>checkOfflineReplay(req(T0+DAY,null),'h1',now,key),/too long ago/) // no licence, older than 7 days
 assert.doesNotThrow(()=>checkOfflineReplay(req(now-2*DAY,null),'h1',now,key)) // queued by the previous version, recent
 assert.doesNotThrow(()=>checkOfflineReplay(new Request('http://x/api/frontdesk',{method:'POST'}),'h1',now,key)) // normal online write
 assert.equal(checkOfflineWrite(r.token,'h1',new Date(T0-DAY),{key,now:T0}).ok,false)})

test('offline bill preview: items, discount, payment and cancel show before sync',async()=>{
 const {applyOffline}=await import('../lib/offline/billPreview')
 let inv:any={offline:true,invoice:{id:'x',status:'open'},items:[],totals:{gross:0,discount:0,net:0,paid:0,balance:0}}
 inv=applyOffline(inv,'item',{serviceId:'s1',quantity:'1'},[{id:'s1',name:'OPD consultation',price:'500'}])
 assert.equal(inv.totals.net,500);assert.equal(inv.items[0].description,'OPD consultation')
 inv=applyOffline(inv,'discount',{discount:'50'});assert.equal(inv.totals.balance,450)
 inv=applyOffline(inv,'payment',{amount:'450',mode:'cash'});assert.equal(inv.totals.balance,0);assert.equal(inv.invoice.status,'paid')
 assert.equal(applyOffline(inv,'cancel',{}).invoice.status,'cancelled')})
