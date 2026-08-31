-- ============================================================
--  EveLatro! — ANTI-TRICHE  (à lancer UNE fois dans Supabase >
--  SQL Editor, après supabase-setup.sql). Re-lançable sans risque.
--
--  Principe : le solde n'est PLUS écrit par le client. Il ne change
--  que via les fonctions ci-dessous (wallet_state / wallet_commit),
--  qui valident chaque mouvement et tiennent un JOURNAL infalsifiable
--  (wallet_ledger). Un mouvement impossible => le compte est "flagged"
--  et le jeu se réinitialise tout seul au prochain contrôle.
-- ============================================================

-- ---- 1) wallet : colonnes de flag + on RETIRE l'écriture client ----
alter table public.wallet add column if not exists flagged      boolean     not null default false;
alter table public.wallet add column if not exists flag_reason  text;
alter table public.wallet add column if not exists flagged_at   timestamptz;
alter table public.wallet add column if not exists last_commit  timestamptz;

drop policy if exists wallet_insert on public.wallet;   -- plus d'insert client
drop policy if exists wallet_update on public.wallet;   -- plus d'update client
-- il reste seulement wallet_select (lecture de SON solde)


-- ---- 2) JOURNAL infalsifiable ----
create table if not exists public.wallet_ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  seq           bigint not null,
  delta         bigint not null,
  reason        text   not null,          -- start|refill|bet|win|push|purchase|sell|adjust
  game          text,
  balance_after bigint not null,
  created_at    timestamptz not null default now(),
  unique (user_id, seq)
);
alter table public.wallet_ledger enable row level security;
drop policy if exists wl_select on public.wallet_ledger;
create policy wl_select on public.wallet_ledger
  for select to authenticated using (auth.uid() = user_id);
-- aucune policy insert/update/delete : seules les fonctions (definer) écrivent


-- ---- 3) FICHES DE TRICHE  (bot / service_role uniquement) ----
create table if not exists public.cheat_flags (
  id          bigint generated always as identity primary key,
  user_id     uuid,
  discord_id  text,
  pseudo      text,
  severity    text not null,              -- 'auto' (reset déjà fait) | 'review'
  reason      text not null,
  details     jsonb not null default '{}'::jsonb,
  snapshot    jsonb,                      -- solde+skins+score AVANT reset (pour restaurer)
  status      text not null default 'open',  -- open | confirmed | cleared
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);
alter table public.cheat_flags enable row level security;   -- aucune policy => client bloqué


-- ---- 4) helper interne : ajoute une ligne au journal ----
create or replace function public._wl_add(p_uid uuid, p_delta bigint, p_reason text, p_game text, p_bal bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.wallet_ledger (user_id, seq, delta, reason, game, balance_after)
  select p_uid, coalesce(max(seq), 0) + 1, p_delta, p_reason, p_game, p_bal
  from public.wallet_ledger where user_id = p_uid;
end $$;


-- ---- interrupteur de sécurité ----
--   Pour passer TOUT l'anti-triche en "signalement seul" (aucun reset auto),
--   mets  {"anticheat_auto": false}  dans bot_config (key = 'anticheat').
--   Table Editor Supabase, ou : insert into bot_config(key,value)
--      values('anticheat', '{"anticheat_auto": false}') on conflict (key) do update set value = excluded.value;
create or replace function public._ac_auto_on()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (value->>'anticheat_auto')::boolean
                   from public.bot_config where key = 'anticheat'), true);
$$;


-- ---- 5) helper interne : lève un flag + snapshot + (option) reset ----
--   Renvoie TRUE si un reset auto a bien été fait, FALSE si c'était un simple
--   signalement (soit demandé, soit parce que l'interrupteur global est coupé).
create or replace function public._wl_flag(p_uid uuid, p_reason text, p_details jsonb, p_auto boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_snap jsonb;
  v_prof record;
begin
  -- interrupteur global : si l'auto-reset est coupé, on ne fait que signaler
  if p_auto and not public._ac_auto_on() then p_auto := false; end if;
  select p.discord_id, p.pseudo into v_prof from public.profiles p where p.user_id = p_uid;
  select jsonb_build_object(
    'credits', (select credits from public.wallet where user_id = p_uid),
    'skins',   (select to_jsonb(s) from public.user_skins s where s.user_id = p_uid),
    'score',   (select best_score from public.scores where user_id = p_uid),
    'at',      now()
  ) into v_snap;

  insert into public.cheat_flags (user_id, discord_id, pseudo, severity, reason, details, snapshot)
  values (p_uid, v_prof.discord_id, v_prof.pseudo, case when p_auto then 'auto' else 'review' end, p_reason, coalesce(p_details,'{}'::jsonb), v_snap);

  if p_auto then
    update public.wallet
       set flagged = true, flag_reason = p_reason, flagged_at = now(), credits = 0
     where user_id = p_uid;
    delete from public.user_skins where user_id = p_uid;
    delete from public.scores     where user_id = p_uid;
    perform public._wl_add(p_uid, 0, 'flag:' || p_reason, null, 0);
    return true;
  end if;
  update public.wallet set flag_reason = coalesce(flag_reason, p_reason) where user_id = p_uid;
  return false;
end $$;


-- ---- 6) wallet_state()  : lecture + création + recharge à 200 ----
create or replace function public.wallet_state()
returns table (credits bigint, flagged boolean, flag_reason text)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  w public.wallet%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into w from public.wallet where user_id = uid for update;
  if not found then
    insert into public.wallet (user_id, credits) values (uid, 200)
      on conflict (user_id) do nothing;
    select * into w from public.wallet where user_id = uid for update;
    if not exists (select 1 from public.wallet_ledger where user_id = uid) then
      perform public._wl_add(uid, 200, 'start', null, 200);
    end if;
    return query select w.credits, false, null::text;
    return;
  end if;

  -- joueur d'avant l'anti-triche : on amorce son journal avec son solde actuel
  if not exists (select 1 from public.wallet_ledger where user_id = uid) then
    perform public._wl_add(uid, w.credits, 'start', null, w.credits);
  end if;

  -- compte flaggé : on le signale UNE fois au client (qui va se réinitialiser),
  -- puis on baisse le flag (la fiche reste dans cheat_flags).
  if w.flagged then
    update public.wallet set flagged = false where user_id = uid;
    return query select 0::bigint, true, w.flag_reason;
    return;
  end if;

  if w.credits <= 0 then
    update public.wallet set credits = 200, updated_at = now(), last_commit = now()
      where user_id = uid returning * into w;
    perform public._wl_add(uid, 200, 'refill', null, 200);
  end if;

  return query select w.credits, false, w.flag_reason;
end $$;


-- ---- 7) wallet_commit(entries)  : applique un lot de mouvements ----
--    entries = '[{"delta":-50,"reason":"bet","game":"slots"}, {"delta":80,"reason":"win","game":"slots"}]'
--    Renvoie {credits, flagged, flag_reason, rejected:[indices]}.
create or replace function public.wallet_commit(p_entries jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  w public.wallet%rowtype;
  e jsonb;
  i int := 0;
  d bigint;
  r text;
  g text;
  bal bigint;
  last_bet bigint := 0;
  net_gain bigint := 0;
  rejected int[] := '{}';
  HARD_MULT   constant int := 340;      -- au-delà = IMPOSSIBLE (poker royal = 250x)
  REVIEW_MULT constant int := 60;       -- au-delà (et > 40k) = à examiner, mais pas de reset
  MAX_BATCH_GAIN constant bigint := 80000000;  -- garde-fou lot (très large)
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(p_entries) <> 'array' then raise exception 'entries must be an array'; end if;
  if jsonb_array_length(p_entries) > 200 then raise exception 'batch too large'; end if;

  select * into w from public.wallet where user_id = uid for update;
  if not found then
    insert into public.wallet (user_id, credits) values (uid, 200) returning * into w;
    perform public._wl_add(uid, 200, 'start', null, 200);
  end if;

  if w.flagged then
    update public.wallet set flagged = false where user_id = uid;
    return jsonb_build_object('credits', 0, 'flagged', true, 'flag_reason', w.flag_reason, 'rejected', '[]'::jsonb);
  end if;

  bal := w.credits;

  -- dernière mise connue (pour borner les gains même si le lot commence par un "win")
  select coalesce(abs((select delta from public.wallet_ledger
                        where user_id = uid and reason = 'bet' order by id desc limit 1)), 0)
    into last_bet;

  for e in select * from jsonb_array_elements(p_entries)
  loop
    d := coalesce((e->>'delta')::bigint, 0);
    r := coalesce(e->>'reason', '');
    g := e->>'game';

    -- mouvements réservés au serveur : tricherie évidente si le client les envoie
    if r in ('start','refill','adjust') or r like 'flag:%' then
      if public._wl_flag(uid, 'reason_interdit:' || r, jsonb_build_object('entry', e), true) then
        select * into w from public.wallet where user_id = uid;
        return jsonb_build_object('credits', 0, 'flagged', true, 'flag_reason', w.flag_reason, 'rejected', to_jsonb(rejected));
      end if;
      rejected := rejected || i; i := i + 1; continue;   -- interrupteur coupé : on ignore
    end if;

    if r = 'bet' then
      if d >= 0 then rejected := rejected || i; i := i + 1; continue; end if;
      if abs(d) > bal then d := -bal; end if;         -- on ne mise jamais plus que le solde
      last_bet := abs(d);
      bal := bal + d;

    elsif r = 'win' then
      -- un gain sans mise connue = lot malformé : on l'ignore (pas de reset)
      if d < 0 or last_bet = 0 then rejected := rejected || i; i := i + 1; continue; end if;
      -- IMPOSSIBLE : au-delà de 340x la mise -> reset auto (ou signalement si interrupteur coupé)
      if d > last_bet * HARD_MULT then
        if public._wl_flag(uid, 'gain_impossible', jsonb_build_object('delta', d, 'last_bet', last_bet), true) then
          select * into w from public.wallet where user_id = uid;
          return jsonb_build_object('credits', 0, 'flagged', true, 'flag_reason', w.flag_reason, 'rejected', to_jsonb(rejected));
        end if;
        rejected := rejected || i; i := i + 1; continue;   -- signalement seul : gain non appliqué
      end if;
      -- RARE mais possible (quinte flush royale sur grosse mise) : on APPLIQUE, on signale.
      if d > last_bet * REVIEW_MULT and d > 40000 then
        declare v_cnt int; v_reset boolean;
        begin
          select count(*) into v_cnt from public.cheat_flags
           where user_id = uid and reason = 'gros_gain_a_verifier'
             and created_at > now() - interval '2 days';
          if v_cnt >= 3 then
            v_reset := public._wl_flag(uid, 'gros_gains_repetes',
              jsonb_build_object('delta', d, 'last_bet', last_bet, 'occurences', v_cnt + 1), true);
            if v_reset then
              select * into w from public.wallet where user_id = uid;
              return jsonb_build_object('credits', 0, 'flagged', true, 'flag_reason', w.flag_reason, 'rejected', to_jsonb(rejected));
            end if;
          elsif not exists (select 1 from public.cheat_flags
                            where user_id = uid and reason = 'gros_gain_a_verifier'
                              and created_at > now() - interval '25 minutes') then
            perform public._wl_flag(uid, 'gros_gain_a_verifier', jsonb_build_object('delta', d, 'last_bet', last_bet), false);
          end if;
        end;
      end if;
      net_gain := net_gain + d;
      bal := bal + d;

    elsif r = 'push' then
      if d < 0 or d > last_bet then rejected := rejected || i; i := i + 1; continue; end if;
      bal := bal + d;

    elsif r = 'purchase' then
      if d >= 0 or abs(d) > bal or abs(d) > 1000000 then rejected := rejected || i; i := i + 1; continue; end if;
      bal := bal + d;

    elsif r = 'sell' then
      -- vente de skins de caisses : pas liée à une mise, plafond généreux,
      -- hors du plafond "gains de session" (économie à part)
      if d < 0 or d > 3000000 then rejected := rejected || i; i := i + 1; continue; end if;
      bal := bal + d;

    else
      rejected := rejected || i; i := i + 1; continue;
    end if;

    if bal < 0 then bal := 0; end if;
    perform public._wl_add(uid, d, r, g, bal);
    i := i + 1;
  end loop;

  if net_gain > MAX_BATCH_GAIN then
    if public._wl_flag(uid, 'gain_lot_impossible', jsonb_build_object('net_gain', net_gain), true) then
      select * into w from public.wallet where user_id = uid;
      return jsonb_build_object('credits', 0, 'flagged', true, 'flag_reason', w.flag_reason, 'rejected', to_jsonb(rejected));
    end if;
    -- signalement seul : on cape le solde à ce qu'il était avant le lot
    bal := w.credits;
  end if;

  update public.wallet set credits = bal, updated_at = now(), last_commit = now() where user_id = uid;
  return jsonb_build_object('credits', bal, 'flagged', false, 'flag_reason', null, 'rejected', to_jsonb(rejected));
end $$;


-- ---- 8) scan d'anomalie (appelé par le bot toutes les ~10 min) ----
--    Repère les comptes dont les GAINS dépassent trop les MISES sur la durée.
--    Ne reset PAS : pose un flag 'review' pour que tu décides.
create or replace function public.anticheat_scan()
returns int language plpgsql security definer set search_path = public as $$
declare
  rec record;
  n int := 0;
begin
  for rec in
    -- on ne regarde QUE les jeux misés (bet/win), pas les caisses (économie à part)
    select l.user_id,
           sum(case when l.reason = 'bet' then abs(l.delta) else 0 end) as bets,
           sum(case when l.reason = 'win' then l.delta else 0 end) as wins,
           count(*) filter (where l.reason in ('bet','win')) as rounds
    from public.wallet_ledger l
    join public.wallet w on w.user_id = l.user_id and not w.flagged
    where l.created_at > now() - interval '2 days'
    group by l.user_id
    having count(*) filter (where l.reason in ('bet','win')) >= 120
       and sum(case when l.reason = 'bet' then abs(l.delta) else 0 end) > 0
  loop
    if rec.wins::numeric / greatest(rec.bets, 1) > 1.35 then
      if not exists (select 1 from public.cheat_flags
                     where user_id = rec.user_id and status = 'open' and severity = 'review') then
        perform public._wl_flag(rec.user_id, 'ratio_gains_anormal',
          jsonb_build_object('bets', rec.bets, 'wins', rec.wins, 'rounds', rec.rounds,
                             'ratio', round(rec.wins::numeric / greatest(rec.bets,1), 3)), false);
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $$;

-- ---- 9) le classement ne peut pas dépasser le solde réel ----
create or replace function public._score_clamp()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  real_bal bigint;
begin
  select credits into real_bal from public.wallet where user_id = new.user_id;
  if real_bal is not null and new.best_score > real_bal then
    new.best_score := real_bal;
  end if;
  if new.best_score < 0 then new.best_score := 0; end if;
  return new;
end $$;
drop trigger if exists score_clamp on public.scores;
create trigger score_clamp before insert or update on public.scores
  for each row execute function public._score_clamp();


grant execute on function public.wallet_state()          to authenticated;
grant execute on function public.wallet_commit(jsonb)     to authenticated;
-- anticheat_scan : appelé par le bot en service_role, pas besoin de grant authenticated
