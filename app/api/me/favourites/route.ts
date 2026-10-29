import {api,body} from '@/lib/api'
import {listFavourites,recordHit,setFavourite} from '@/lib/services/favourites'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const GET=api(async(c,db)=>listFavourites(db,c))
export const POST=api(async(c,db,r)=>recordHit(db,c,(await body(r)).path))
export const PUT=api(async(c,db,r)=>setFavourite(db,c,await body(r)))
