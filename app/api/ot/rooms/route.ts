import {api,body} from '@/lib/api';export const runtime='nodejs';export const dynamic='force-dynamic';import {addRoom,listRooms,setRoomActive} from '@/lib/services/ot'
export const GET=api(async(c,db)=>({rooms:await listRooms(db,c,true)}),{module:'ipd'})
/** Add a room ({name}) or switch one on/off ({id,active}). */
export const POST=api(async(c,db,r)=>{const b=await body(r);return {room:b.id?await setRoomActive(db,c,b.id,b.active):await addRoom(db,c,b)}},{module:'ipd'})
