-- Offline mode (30 days without internet). Admin setting: "offline" (default) or "live" (internet required).
alter table hospitals add column if not exists offline_enabled boolean not null default true;
