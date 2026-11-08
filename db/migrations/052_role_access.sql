-- Admin-controlled menu access per role. A row overrides the built-in default from lib/nav.ts (NAV[].roles);
-- no row means the default. Admin is never stored (admin always sees everything); Home is always on.
create table if not exists role_access(
 hospital_id uuid not null references hospitals(id) on delete cascade,
 role text not null,
 path text not null,
 allowed boolean not null,
 updated_by uuid references users(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key(hospital_id,role,path));
