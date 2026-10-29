import {test} from 'node:test';import assert from 'node:assert/strict';import {freshDb} from './helpers';import {onboardHospital,codeCandidates} from '../lib/services/tenancy'
test('hospital code auto-generated from name, unique, 3-10 uppercase',async()=>{const db=await freshDb();assert.equal(codeCandidates('Sunrise Multispeciality Hospital')[0],'SUNRISE')
 const mk=(n:string,i:number)=>onboardHospital(db,{hospitalName:n,adminName:'A',adminEmail:`a${i}@x.in`,password:'S3cure-pass!',planCode:'basic',paid:true})
 const codes:string[]=[];for(let i=0;i<5;i++)codes.push((await mk('Sunrise Hospital',i)).code)
 assert.equal(new Set(codes).size,5);for(const c of codes)assert.match(c,/^[A-Z0-9]{3,10}$/);assert.equal(codes[0],'SUNRISE')
 assert.match((await mk('AB',9)).code,/^[A-Z0-9]{3,10}$/)
 assert.equal((await onboardHospital(db,{hospitalName:'Legacy',code:'legacy1',adminName:'A',adminEmail:'l@x.in',password:'S3cure-pass!'})).code,'LEGACY1')})
