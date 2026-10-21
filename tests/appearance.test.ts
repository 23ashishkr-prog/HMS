import {test} from 'node:test';import assert from 'node:assert/strict'
import {freshDb,tenant} from './helpers'
import {getAppearance,setMyAppearance,setHospitalAppearance} from '../lib/services/appearance'
test('appearance: per-user prefs over hospital default; admin-only default; validation',async()=>{const db:any=await freshDb();const t=await tenant(db,'AP '+Math.random(),'enterprise');const u=await t.mk('reception','R')
 assert.equal((await getAppearance(db,u)).effective.theme,'light')
 await setHospitalAppearance(db,t.admin,{theme:'soft',accent:'teal'});assert.equal((await getAppearance(db,u)).effective.accent,'teal')
 await assert.rejects(setHospitalAppearance(db,u,{theme:'dark'}),/admin/)
 await setMyAppearance(db,u,{theme:'dark',font:'lg'});const e=(await getAppearance(db,u)).effective;assert.equal(e.theme,'dark');assert.equal(e.accent,'teal');assert.equal(e.font,'lg')
 await assert.rejects(setMyAppearance(db,u,{theme:'neon'}),/Invalid/)
 await setMyAppearance(db,u,{reset:true});assert.equal((await getAppearance(db,u)).effective.theme,'soft')})
