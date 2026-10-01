-- ============================================================
-- El Cofre — tanda 4: Agenda (docs/privacidad.md)
-- Tus actividades se cifran con tu llave. Las que muestras a tu equipo (Buscar hueco: «con título»)
-- se cifran con tu llave de AGENDA, que reciben solo las personas con las que compartes un equipo:
-- así ellos leen el título y nadie más (tampoco el dueño de Rockie).
-- Google Calendar: el servidor ya no lee la agenda; la app le pasa lo que hay que subir y aplica ella
-- misma lo que llega de Google (ver functions/agenda-google).
-- ============================================================

-- ——— un ámbito más: «agenda» = la agenda compartible de una persona (ambito_id = su user_id) ———

alter table public.cofre_ambitos drop constraint if exists cofre_ambitos_ambito_check;
alter table public.cofre_ambitos add constraint cofre_ambitos_ambito_check check (ambito in ('espacio', 'nota', 'agenda'));
alter table public.cofre_sobres drop constraint if exists cofre_sobres_ambito_check;
alter table public.cofre_sobres add constraint cofre_sobres_ambito_check check (ambito in ('espacio', 'nota', 'agenda'));

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
    -- la agenda de p_id la ven quienes comparten algún equipo con esa persona (y ella misma)
    when 'agenda' then p_uid = p_id or exists (
      select 1 from space_members a join space_members b on b.space_id = a.space_id
       where a.user_id = p_id and b.user_id = p_uid)
    else false
  end
$$;

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
    union
    -- la agenda solo la reparte su dueña, a quienes comparten algún equipo con ella
    select m.ambito, m.ambito_id, m.kid, b.user_id
      from mias m
      join space_members a on m.ambito = 'agenda' and m.ambito_id = auth.uid() and a.user_id = m.ambito_id
      join space_members b on b.space_id = a.space_id
  )
  select mi.ambito, mi.ambito_id, mi.kid, c.user_id, c.publica
    from miembros mi
    join cofre_cuentas c on c.user_id = mi.user_id
   where not exists (select 1 from cofre_sobres s2 where s2.kid = mi.kid and s2.para = mi.user_id)
   limit 300
$$;

-- si alguien sale de todos los equipos que compartía contigo, tu llave de agenda se cambia también
create or replace function public.cofre_al_salir() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update cofre_ambitos set rotar = true where ambito = 'espacio' and ambito_id = old.space_id;
  delete from cofre_sobres where para = old.user_id and ambito = 'espacio' and ambito_id = old.space_id;
  update cofre_ambitos a set rotar = true
   where a.ambito = 'agenda'
     and a.ambito_id in (select user_id from space_members where space_id = old.space_id)
     and a.ambito_id <> old.user_id;
  delete from cofre_sobres s
   where s.para = old.user_id and s.ambito = 'agenda' and s.ambito_id <> old.user_id
     and not public.cofre_es_miembro('agenda', s.ambito_id, old.user_id);
  return old;
end;
$$;

-- ——— techos de largo ———

create or replace function pg_temp.cofre_ampliar(p_tabla text, p_col text, p_min int, p_max int) returns void
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
       and (pg_get_constraintdef(c.oid) ilike '%char_length%' or pg_get_constraintdef(c.oid) ilike '%jsonb_typeof%')
  loop
    execute format('alter table public.%I drop constraint %I', p_tabla, r.conname);
  end loop;
  if p_max > 0 then
    execute format('alter table public.%I add constraint %I check (char_length(%I) between %s and %s)',
                   p_tabla, p_tabla || '_' || p_col || '_largo', p_col, p_min, p_max);
  end if;
end;
$$;

select pg_temp.cofre_ampliar('agenda_items', 'title', 1, 2000);
select pg_temp.cofre_ampliar('agenda_items', 'subtasks', 0, 0);
alter table public.agenda_items add constraint agenda_items_subtasks_forma
  check (jsonb_typeof(subtasks) in ('array', 'string'));
