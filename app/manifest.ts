import type {MetadataRoute} from 'next'
import {basePath,withBase} from '@/lib/basePath'
export default function manifest():MetadataRoute.Manifest{return {name:'HMS · Hospital Cloud',short_name:'HMS',start_url:basePath,display:'standalone',background_color:'#F2F2F2',theme_color:'#104176',icons:[{src:withBase('/icon.svg'),sizes:'any',type:'image/svg+xml'},{src:withBase('/icon-192.png'),sizes:'192x192',type:'image/png'},{src:withBase('/icon-512.png'),sizes:'512x512',type:'image/png',purpose:'any'}]}}
