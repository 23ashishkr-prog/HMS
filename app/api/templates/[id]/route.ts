import {api,body} from '@/lib/api';import {saveTemplate,deleteTemplate,useTemplate} from '@/lib/services/templates';export const runtime='nodejs';export const dynamic='force-dynamic'
export const POST=api(async(c,db,r,p)=>useTemplate(db,c,p.id),{module:'opd'})
export const PUT=api(async(c,db,r,p)=>saveTemplate(db,c,await body(r),p.id),{module:'opd'})
export const DELETE=api(async(c,db,r,p)=>deleteTemplate(db,c,p.id),{module:'opd'})
