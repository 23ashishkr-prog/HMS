import {api,body,qs} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {listCatalog,addCatalogItem} from '@/lib/services/diagnostics'
export const GET=api(async(c,db,r)=>({services:await listCatalog(db,c,qs(r,'category')||undefined)}));export const POST=api(async(c,db,r)=>({service:await addCatalogItem(db,c,await body(r))}))
