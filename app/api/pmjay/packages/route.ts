import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {listPackages,importPackages,specialties} from '@/lib/services/pmjay'
export const GET=api(async(c,db,r)=>({packages:await listPackages(db,c,qs(r,'q')||'',qs(r,'specialty')||''),specialties:await specialties(db,c)}),{module:'insurance'})
export const POST=api(async(c,db,r)=>importPackages(db,c,String((await body(r)).csv||'')),{module:'insurance'})
