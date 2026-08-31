-- ==========================================================
--  EveLatro! - base multijoueur
--  Supabase  >  SQL Editor  >  New query  >  coller ceci  >  Run
--  Peut etre relance autant de fois qu'on veut (idempotent).
-- ==========================================================


-- ----------------------------------------------------------
-- 1) CLASSEMENT
-- ----------------------------------------------------------
create table if not exists public.scores (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  pseudo      text not null,
  avatar_url  text,
  best_score  integer not null default 0,
  updated_at  timestamptz not null default now()
);

alter table public.scores enable row level security;

drop policy if exists scores_select on public.scores;
create policy scores_select on public.scores
  for select to authenticated using (true);

drop policy if exists scores_insert on public.scores;
create policy scores_insert on public.scores
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists scores_update on public.scores;
create policy scores_update on public.scores
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists scores_best_idx on public.scores (best_score desc);


-- ----------------------------------------------------------
-- 2) ACTIONS EN DIRECT
-- ----------------------------------------------------------
create table if not exists public.activity (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  pseudo      text not null,
  avatar_url  text,
  game        text,
  detail      text,
  bet         integer,
  gain        integer,
  balance     integer,
  tone        text,
  created_at  timestamptz not null default now()
);

alter table public.activity add column if not exists balance integer;
alter table public.activity enable row level security;

drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity
  for select to authenticated using (true);

drop policy if exists activity_insert on public.activity;
create policy activity_insert on public.activity
  for insert to authenticated with check (auth.uid() = user_id);

create index if not exists activity_created_idx on public.activity (created_at desc);


-- ----------------------------------------------------------
-- 3) CHAT
-- ----------------------------------------------------------
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  pseudo      text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

alter table public.messages enable row level security;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated using (true);

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated with check (auth.uid() = user_id);

create index if not exists messages_created_idx on public.messages (created_at desc);


-- ----------------------------------------------------------
-- 4) DUELS (mode VS)
-- ----------------------------------------------------------
create table if not exists public.duels (
  id             bigint generated always as identity primary key,
  challenger_id  uuid not null references auth.users(id) on delete cascade,
  challenger     text not null,
  opponent_id    uuid not null references auth.users(id) on delete cascade,
  opponent       text not null,
  pct            integer not null default 50,
  status         text not null default 'pending',
  chal_stake     integer,
  opp_stake      integer,
  chal_bal       integer,
  opp_bal        integer,
  chal_rounds    integer not null default 0,
  opp_rounds     integer not null default 0,
  winner_id      uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.duels enable row level security;

drop policy if exists duels_select on public.duels;
create policy duels_select on public.duels
  for select to authenticated
  using (auth.uid() = challenger_id or auth.uid() = opponent_id);

drop policy if exists duels_insert on public.duels;
create policy duels_insert on public.duels
  for insert to authenticated with check (auth.uid() = challenger_id);

drop policy if exists duels_update on public.duels;
create policy duels_update on public.duels
  for update to authenticated
  using (auth.uid() = challenger_id or auth.uid() = opponent_id)
  with check (auth.uid() = challenger_id or auth.uid() = opponent_id);


alter table public.duels add column if not exists chal_version text;

-- Mode VS "combat" : best-of-N manches d'un jeu, 20 s par manche.
-- chal_rounds / opp_rounds servent de compteur de MANCHES GAGNEES.
alter table public.duels add column if not exists game             text    default 'blackjack';
alter table public.duels add column if not exists rounds_target    integer default 5;
alter table public.duels add column if not exists round_no         integer default 1;
alter table public.duels add column if not exists round_started_at timestamptz;
alter table public.duels add column if not exists chal_score       numeric;
alter table public.duels add column if not exists opp_score        numeric;
alter table public.duels add column if not exists chal_dq          boolean default false;
alter table public.duels add column if not exists opp_dq           boolean default false;
alter table public.duels add column if not exists slot_machine     integer default 0;


-- ----------------------------------------------------------
-- 3bis) PROFILS  (fait le lien  discord_id  <->  user_id Supabase)
--    Le JEU ecrit ici a la connexion. Le BOT lit ici pour savoir
--    quel solde/skins appartiennent a quel membre Discord.
-- ----------------------------------------------------------
create table if not exists public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  discord_id  text unique,
  pseudo      text,
  avatar_url  text,
  updated_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ----------------------------------------------------------
-- 4ter) SKINS DES CROUPIERS  (partages, ne se perdent jamais)
--    owned = { men:[0,2], women:[0,1] }   worn = { men:2, women:0 }
-- ----------------------------------------------------------
create table if not exists public.user_skins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  owned       jsonb not null default '{}'::jsonb,
  worn        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.user_skins enable row level security;

drop policy if exists user_skins_select on public.user_skins;
create policy user_skins_select on public.user_skins
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists user_skins_insert on public.user_skins;
create policy user_skins_insert on public.user_skins
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists user_skins_update on public.user_skins;
create policy user_skins_update on public.user_skins
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ----------------------------------------------------------
-- 4bis) PORTE-MONNAIE PARTAGE  (meme solde sur PC / Android / Web)
--    Le jeu lit/ecrit ici quand on est connecte. Temps reel -> si tu
--    gagnes sur le tel, ton .exe se met a jour tout seul.
-- ----------------------------------------------------------
create table if not exists public.wallet (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  credits     bigint not null default 200,
  updated_at  timestamptz not null default now()
);
alter table public.wallet enable row level security;

drop policy if exists wallet_select on public.wallet;
create policy wallet_select on public.wallet
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists wallet_insert on public.wallet;
create policy wallet_insert on public.wallet
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists wallet_update on public.wallet;
create policy wallet_update on public.wallet
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ----------------------------------------------------------
-- 5) NEWS  (le panneau "Quoi de neuf ?" du jeu, editable a chaud)
--    Une seule ligne (id = 1). Modifie-la dans le Table Editor
--    quand tu veux, ou avec la commande /news du bot.
--    Change "tag" pour re-afficher le panneau a tout le monde.
-- ----------------------------------------------------------
create table if not exists public.news (
  id          integer primary key default 1,
  tag         text,               -- ex "1.1" : change-le pour re-montrer le panneau
  title       text default 'Quoi de neuf ?',
  patch       text,               -- ce qui vient de changer
  coming      text,               -- ce qui arrive
  images      text[] default '{}', -- URLs d'images
  cta_label   text default 'Mettre a jour',
  cta_url     text,
  updated_at  timestamptz not null default now(),
  constraint news_single check (id = 1)
);
insert into public.news (id) values (1) on conflict (id) do nothing;

alter table public.news enable row level security;
drop policy if exists news_read on public.news;
create policy news_read on public.news for select to anon, authenticated using (true);


-- ----------------------------------------------------------
-- 6) CONFIG DU BOT  (salons choisis, etc. — interne au bot)
--    Le bot ecrit ici avec la cle service_role. Personne d'autre
--    n'y touche (RLS active, aucune policy).
-- ----------------------------------------------------------
create table if not exists public.bot_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.bot_config enable row level security;


-- ----------------------------------------------------------
-- 7) TEMPS REEL  (diffuse les nouvelles lignes)
-- ----------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['activity', 'messages', 'duels', 'wallet', 'user_skins'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
