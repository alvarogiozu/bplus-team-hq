-- ============================================================
-- El Cofre — cifrado de extremo a extremo (docs/privacidad.md)
--
-- Lo personal se cifra en el dispositivo con la llave maestra de cada persona; lo de un equipo o una
-- nota compartida, con la llave de ese ámbito. Este servidor guarda las llaves SOLO cerradas:
--   cofre_cuentas   la maestra envuelta con el código de recuperación + la identidad (pública en claro,
--                   privada cifrada con la maestra)
--   cofre_sobres    llaves de equipos/notas selladas para cada miembro con su llave pública
--   cofre_ambitos   qué llave está vigente en cada equipo/nota (y si toca cambiarla porque alguien salió)
--   cofre_traspasos la maestra cifrada con un código de un solo uso, para abrir el Cofre en otro dispositivo
-- Ni el servicio de Supabase ni el dueño de Rockie pueden abrir ninguna.
-- ============================================================

create table public.cofre_cuentas (
  user_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  kid          text not null check (char_length(kid) between 6 and 40),
  publica      jsonb not null check (jsonb_typeof(publica) = 'object'),
  privada      text not null check (privada like 'cj1.%'),
  recuperacion jsonb not null check (jsonb_typeof(recuperacion) = 'object'),
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);
alter table public.cofre_cuentas enable row level security;
create policy cofre_cuentas_ver on public.cofre_cuentas for select to authenticated using (user_id = auth.uid());
create policy cofre_cuentas_crear on public.cofre_cuentas for insert to authenticated with check (user_id = auth.uid());
create policy cofre_cuentas_cambiar on public.cofre_cuentas for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- una vez creado, solo cambia el código de recuperación (la maestra y la identidad no se pisan por error)
revoke update on public.cofre_cuentas from authenticated;
grant update (recuperacion, actualizado) on public.cofre_cuentas to authenticated;

create table public.cofre_ambitos (
  ambito     text not null check (ambito in ('espacio', 'nota')),
  ambito_id  uuid not null,
  kid        text not null check (char_length(kid) between 6 and 40),
  rotar      boolean not null default false,
  creado_por uuid default auth.uid() references auth.users(id) on delete set null,
  creado     timestamptz not null default now(),
  primary key (ambito, ambito_id)
);
alter table public.cofre_ambitos enable row level security;

create table public.cofre_sobres (
  kid       text not null check (char_length(kid) between 6 and 40),
  para      uuid not null references auth.users(id) on delete cascade,
  ambito    text not null check (ambito in ('espacio', 'nota')),
  ambito_id uuid not null,
  de        uuid default auth.uid() references auth.users(id) on delete set null,
  sellado   jsonb not null check (jsonb_typeof(sellado) = 'object'),
  creado    timestamptz not null default now(),
  primary key (kid, para)
);
create index cofre_sobres_ambito_idx on public.cofre_sobres (ambito, ambito_id);
alter table public.cofre_sobres enable row level security;

create table public.cofre_traspasos (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  kid     text not null,
  paquete jsonb not null check (jsonb_typeof(paquete) = 'object'),
  expira  timestamptz not null
);
alter table public.cofre_traspasos enable row level security;
create policy cofre_traspasos_propio on public.cofre_traspasos for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ¿Esta persona es parte del ámbito? (equipo: miembro; nota: dueña o miembro del equipo donde se compartió)
create or replace function public.cofre_es_miembro(p_ambito text, p_id uuid, p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_ambito
    when 'espacio' then exists (select 1 from space_members where space_id = p_id and user_id = p_uid)
    when 'nota' then exists (
      select 1 from cuaderno_notes n
       where n.id = p_id
         and (n.user_id = p_uid
              or (n.space_id is not null and exists (
                    select 1 from space_members m where m.space_id = n.space_id and m.user_id = p_uid))))
    else false
  end
$$;
revoke all on function public.cofre_es_miembro(text, uuid, uuid) from public, anon;
grant execute on function public.cofre_es_miembro(text, uuid, uuid) to authenticated;

create policy cofre_ambitos_ver on public.cofre_ambitos for select to authenticated
  using (public.cofre_es_miembro(ambito, ambito_id, auth.uid()));

create policy cofre_sobres_ver on public.cofre_sobres for select to authenticated using (para = auth.uid());
-- un miembro le entrega la llave a otro miembro del mismo ámbito (o a sí mismo)
create policy cofre_sobres_entregar on public.cofre_sobres for insert to authenticated
  with check (
    de = auth.uid()
    and public.cofre_es_miembro(ambito, ambito_id, auth.uid())
    and public.cofre_es_miembro(ambito, ambito_id, para)
  );
create policy cofre_sobres_borrar on public.cofre_sobres for delete to authenticated using (para = auth.uid());

-- Fija la llave vigente de un ámbito. Si ya hay una, gana la que estaba (salvo que toque rotarla y quien
-- llama haya visto la misma anterior). Devuelve la vigente.
create or replace function public.cofre_reclamar(p_ambito text, p_ambito_id uuid, p_kid text, p_anterior text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  vigente text;
begin
  if not public.cofre_es_miembro(p_ambito, p_ambito_id, auth.uid()) then
    raise exception 'No eres parte de esto';
  end if;
  if not exists (select 1 from cofre_sobres where kid = p_kid and para = auth.uid()) then
    raise exception 'Primero guarda tu propio sobre de esta llave';
  end if;
  insert into cofre_ambitos (ambito, ambito_id, kid) values (p_ambito, p_ambito_id, p_kid)
  on conflict (ambito, ambito_id) do update
    set kid = excluded.kid, rotar = false, creado_por = auth.uid(), creado = now()
    where cofre_ambitos.rotar and cofre_ambitos.kid is not distinct from p_anterior;
  select kid into vigente from cofre_ambitos where ambito = p_ambito and ambito_id = p_ambito_id;
  return vigente;
end;
$$;
revoke all on function public.cofre_reclamar(text, uuid, text, text) from public, anon;
grant execute on function public.cofre_reclamar(text, uuid, text, text) to authenticated;

-- Llaves que quien llama tiene y que a otro miembro del mismo ámbito le faltan (con su llave pública).
create or replace function public.cofre_pendientes()
returns table (ambito text, ambito_id uuid, kid text, para uuid, publica jsonb)
language sql stable security definer set search_path = public as $$
  with mias as (
    select distinct s.ambito, s.ambito_id, s.kid from cofre_sobres s where s.para = auth.uid()
  ),
  miembros as (
    select m.ambito, m.ambito_id, m.kid, sm.user_id
      from mias m join space_members sm on m.ambito = 'espacio' and sm.space_id = m.ambito_id
    union
    select m.ambito, m.ambito_id, m.kid, n.user_id
      from mias m join cuaderno_notes n on m.ambito = 'nota' and n.id = m.ambito_id
    union
    select m.ambito, m.ambito_id, m.kid, sm.user_id
      from mias m
      join cuaderno_notes n on m.ambito = 'nota' and n.id = m.ambito_id
      join space_members sm on sm.space_id = n.space_id
  )
  select mi.ambito, mi.ambito_id, mi.kid, c.user_id, c.publica
    from miembros mi
    join cofre_cuentas c on c.user_id = mi.user_id
   where not exists (select 1 from cofre_sobres s2 where s2.kid = mi.kid and s2.para = mi.user_id)
   limit 300
$$;
revoke all on function public.cofre_pendientes() from public, anon;
grant execute on function public.cofre_pendientes() to authenticated;

-- Si alguien sale de un equipo: lo nuevo se cifra con otra llave (la que se lleva ya no abre lo que viene)
create or replace function public.cofre_al_salir() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update cofre_ambitos set rotar = true where ambito = 'espacio' and ambito_id = old.space_id;
  delete from cofre_sobres where para = old.user_id and ambito = 'espacio' and ambito_id = old.space_id;
  return old;
end;
$$;
create trigger cofre_al_salir after delete on public.space_members
  for each row execute function public.cofre_al_salir();

-- ——— columnas que ya se cifran (tanda 1): el texto cifrado es más largo que el original ———
-- El largo de lo que escribe la persona lo controla la app; aquí solo se pone un techo amplio.

create or replace function pg_temp.cofre_ampliar(p_tabla text, p_col text, p_max int) returns void
language plpgsql as $$
declare
  r record;
begin
  for r in
    select c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.conrelid = ('public.' || p_tabla)::regclass
       and c.contype = 'c'
       and a.attname = p_col
       and pg_get_constraintdef(c.oid) ilike '%char_length%'
  loop
    execute format('alter table public.%I drop constraint %I', p_tabla, r.conname);
  end loop;
  execute format('alter table public.%I add constraint %I check (char_length(%I) between 1 and %s)',
                 p_tabla, p_tabla || '_' || p_col || '_largo', p_col, p_max);
end;
$$;

select pg_temp.cofre_ampliar('rockie_turns', 'text', 12000);
select pg_temp.cofre_ampliar('agenda_calendars', 'name', 1000);
select pg_temp.cofre_ampliar('agenda_groups', 'name', 1000);
select pg_temp.cofre_ampliar('agenda_hobbies', 'name', 1000);
select pg_temp.cofre_ampliar('agenda_reserves', 'name', 1000);
