/* HMS service worker — offline desks (front desk, doctor desk, billing). Data and queued writes live in the page
 * (localStorage copy + IndexedDB queue); whether offline use may start is decided by the signed 30-day licence.
 * Scope is /hms/ (not bare /hms). A navigate to exactly /hms opens the dashboard
 * so the installed app does not start on the GreyNova marketing page. */
const V='hms-v3',B='/hms',PAGES=[B+'/frontdesk',B+'/opd',B+'/billing',B+'/queue',B+'/dashboard'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(PAGES).catch(()=>{})).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/api/'))return;
 if(r.mode==='navigate'&&(u.pathname===B||u.pathname===B+'/')){e.respondWith(Response.redirect(B+'/dashboard',302));return}
 if(u.pathname.startsWith(B+'/_next/static/')||/\.(png|svg|ico|woff2?)$/.test(u.pathname)){e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(V).then(x=>x.put(r,c))}return res})));return}
 if(r.mode==='navigate'){e.respondWith(fetch(r).then(res=>{if(res.ok&&PAGES.includes(u.pathname)){const c=res.clone();caches.open(V).then(x=>x.put(u.pathname,c))}return res}).catch(()=>caches.match(u.pathname).then(m=>m||caches.match(B+'/frontdesk')).then(m=>m||new Response('<h1>Offline</h1><p>Open the Front desk, Doctor or Bills page once while online to use it offline.</p>',{headers:{'content-type':'text/html'}}))))}});
