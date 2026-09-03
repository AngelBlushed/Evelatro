-- ============================================================
--  EveLatro! — COMPTOIR D'ÉCHANGE (skins CS entre joueurs)
--  À lancer UNE fois dans Supabase > SQL Editor, après
--  supabase-setup.sql et supabase-anticheat.sql. Re-lançable.
--
--  Ce que ça crée :
--   * cs_inventories : miroir public de l'inventaire de caisses
--     de chaque joueur (pour pouvoir regarder celui des autres)
--   * cs_trades      : les demandes d'échange
--   * cs_trade_respond(id, accept) : accepter = échange atomique
--     (revérifie skins + crédits), refuser = ferme la demande
-- ============================================================

-- ---- 1) inventaires publics -------------------------------------------------
create table if not exists public.cs_inventories (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  pseudo     text,
  avatar_url text,
  items      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.cs_inventories enable row level security;

drop policy if exists csinv_select on public.cs_inventories;
create policy csinv_select on public.cs_inventories
  for select to authenticated using (true);

drop policy if exists csinv_insert on public.cs_inventories;
create policy csinv_insert on public.cs_inventories
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists csinv_update on public.cs_inventories;
create policy csinv_update on public.cs_inventories
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ---- 2) demandes d'échange ------------------------------------------------
create table if not exists public.cs_trades (
  id            bigint generated always as identity primary key,
  from_id       uuid not null references auth.users(id) on delete cascade,
  from_pseudo   text,
  to_id         uuid not null references auth.users(id) on delete cascade,
  to_pseudo     text,
  offer_skin    jsonb  not null,          -- le skin que l'émetteur donne
  offer_credits bigint not null default 0,
  want_skin     jsonb  not null,          -- le skin du destinataire que l'émetteur veut
  status        text   not null default 'pending',  -- pending|accepted|declined|cancelled|failed
  fail_reason   text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
alter table public.cs_trades enable row level security;

drop policy if exists cstr_select on public.cs_trades;
create policy cstr_select on public.cs_trades
  for select to authenticated using (auth.uid() = from_id or auth.uid() = to_id);

drop policy if exists cstr_insert on public.cs_trades;
create policy cstr_insert on public.cs_trades
  for insert to authenticated with check (auth.uid() = from_id);

-- l'émetteur peut seulement ANNULER sa demande en attente ;
-- l'acceptation/refus passe par la fonction cs_trade_respond (definer).
drop policy if exists cstr_update on public.cs_trades;
create policy cstr_update on public.cs_trades
  for update to authenticated
  using (auth.uid() = from_id and status = 'pending')
  with check (status in ('cancelled', 'pending'));

create index if not exists cstr_to_pending  on public.cs_trades (to_id)   where status = 'pending';
create index if not exists cstr_from_recent on public.cs_trades (from_id, created_at desc);


-- ---- 3) répondre à une demande ------------------------------------------
--   accept = false -> status 'declined'
--   accept = true  -> revérifie que chacun a bien son skin (par id) et que
--   l'émetteur a assez de crédits, puis échange skins + crédits en une fois.
create or replace function public.cs_trade_respond(p_id bigint, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  t      public.cs_trades%rowtype;
  a_inv  jsonb;
  b_inv  jsonb;
  a_cred bigint;
  a_flag boolean;
  b_flag boolean;
  give   jsonb;
  want   jsonb;
  a_new  jsonb;
  b_new  jsonb;
  cr     bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into t from public.cs_trades where id = p_id for update;
  if not found then raise exception 'demande introuvable'; end if;
  if t.to_id <> uid then raise exception 'pas ta demande'; end if;
  if t.status <> 'pending' then return jsonb_build_object('status', t.status); end if;

  if not coalesce(p_accept, false) then
    update public.cs_trades set status = 'declined', resolved_at = now() where id = p_id;
    return jsonb_build_object('status', 'declined');
  end if;

  cr := greatest(0, coalesce(t.offer_credits, 0));

  select items into a_inv  from public.cs_inventories where user_id = t.from_id;
  select items into b_inv  from public.cs_inventories where user_id = t.to_id;
  select credits, flagged into a_cred, a_flag from public.wallet where user_id = t.from_id for update;
  select flagged into b_flag from public.wallet where user_id = t.to_id for update;

  if coalesce(a_flag, false) or coalesce(b_flag, false) then
    update public.cs_trades set status='failed', fail_reason='compte_bloque', resolved_at=now() where id=p_id;
    return jsonb_build_object('status','failed','reason','compte_bloque');
  end if;

  if a_inv is null or not exists (
      select 1 from jsonb_array_elements(a_inv) x where x->>'id' = t.offer_skin->>'id') then
    update public.cs_trades set status='failed', fail_reason='skin_donneur_absent', resolved_at=now() where id=p_id;
    return jsonb_build_object('status','failed','reason','skin_donneur_absent');
  end if;

  if b_inv is null or not exists (
      select 1 from jsonb_array_elements(b_inv) x where x->>'id' = t.want_skin->>'id') then
    update public.cs_trades set status='failed', fail_reason='skin_receveur_absent', resolved_at=now() where id=p_id;
    return jsonb_build_object('status','failed','reason','skin_receveur_absent');
  end if;

  if cr > coalesce(a_cred, 0) then
    update public.cs_trades set status='failed', fail_reason='credits_insuffisants', resolved_at=now() where id=p_id;
    return jsonb_build_object('status','failed','reason','credits_insuffisants');
  end if;

  select x into give from jsonb_array_elements(a_inv) x where x->>'id' = t.offer_skin->>'id' limit 1;
  select x into want from jsonb_array_elements(b_inv) x where x->>'id' = t.want_skin->>'id'  limit 1;

  -- A : retire le skin donné, ajoute celui reçu
  select coalesce(jsonb_agg(x), '[]'::jsonb) into a_new
    from jsonb_array_elements(a_inv) x where x->>'id' <> t.offer_skin->>'id';
  a_new := jsonb_build_array(want) || a_new;

  -- B : retire le skin donné, ajoute celui reçu
  select coalesce(jsonb_agg(x), '[]'::jsonb) into b_new
    from jsonb_array_elements(b_inv) x where x->>'id' <> t.want_skin->>'id';
  b_new := jsonb_build_array(give) || b_new;

  update public.cs_inventories set items = a_new, updated_at = now() where user_id = t.from_id;
  update public.cs_inventories set items = b_new, updated_at = now() where user_id = t.to_id;
  update public.wallet set cs_inv = a_new where user_id = t.from_id;
  update public.wallet set cs_inv = b_new where user_id = t.to_id;

  if cr > 0 then
    update public.wallet set credits = credits - cr, updated_at = now() where user_id = t.from_id;
    update public.wallet set credits = credits + cr, updated_at = now() where user_id = t.to_id;
    perform public._wl_add(t.from_id, -cr, 'trade', 'comptoir',
                           (select credits from public.wallet where user_id = t.from_id));
    perform public._wl_add(t.to_id,    cr, 'trade', 'comptoir',
                           (select credits from public.wallet where user_id = t.to_id));
  end if;

  update public.cs_trades set status = 'accepted', resolved_at = now() where id = p_id;
  return jsonb_build_object('status', 'accepted');
end $$;

grant execute on function public.cs_trade_respond(bigint, boolean) to authenticated;


-- ---- 4) temps réel -------------------------------------------------------
--  (ignore l'erreur "already member of publication" si tu relances)
do $$ begin
  alter publication supabase_realtime add table public.cs_trades;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.cs_inventories;
exception when duplicate_object then null;
end $$;
