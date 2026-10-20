-- TV token display + near-turn notification
alter table hospitals add column if not exists display_key text not null default encode(gen_random_bytes(12),'hex');
alter table hospitals add column if not exists near_turn_ahead int not null default 2;
