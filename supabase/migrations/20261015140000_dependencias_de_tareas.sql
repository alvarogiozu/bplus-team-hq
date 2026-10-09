-- Dependencias entre tareas: «esta tarea espera a aquella». Una fila = task_id no puede empezar hasta que depende_de
-- esté hecha. Solo ids (nada que cifrar: ver task_dependencies en src/lib/cofre/privacidad.json).
--  - space_id lo pone el trigger (el de la tarea): sirve para la RLS y para leer todo un proyecto de una vez.
--  - las dos tareas tienen que ser del mismo proyecto, sin ciclos (A→B→A) y sin depender de sí misma.
--  - si se borra cualquiera de las dos tareas, la dependencia se va con ella.
--  - «bloqueada» = alguna de sus depende_de no está en status 'done'. No se guarda: se calcula al leer.
-- La app lee y escribe directo (RLS por miembro del proyecto); el conector de Claude por mcp_dependencias.

create table if not exists public.task_dependencies (
  task_id    uuid not null references public.tasks(id) on delete cascade,
  depende_de uuid not null references public.tasks(id) on delete cascade,
  space_id   uuid not null references public.spaces(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (task_id, depende_de),
  constraint task_dependencies_no_a_si_misma check (task_id <> depende_de)
);
create index if not exists task_dependencies_depende_idx on public.task_dependencies (depende_de);
create index if not exists task_dependencies_space_idx on public.task_dependencies (space_id);

alter table public.task_dependencies enable row level security;
drop policy if exists task_dependencies_members on public.task_dependencies;
create policy task_dependencies_members on public.task_dependencies for all to authenticated
  using (public.is_member(space_id)) with check (public.is_member(space_id));
revoke all on public.task_dependencies from anon;
grant select, insert, delete on public.task_dependencies to authenticated;

-- mismo proyecto, space_id fijo y sin ciclos
create or replace function public.task_dependencies_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s_tarea uuid;
  s_otra  uuid;
begin
  select space_id into s_tarea from tasks where id = new.task_id;
  select space_id into s_otra from tasks where id = new.depende_de;
  if s_tarea is null or s_otra is null then
    raise exception 'No existe esa tarea' using errcode = '23503';
  end if;
  if s_tarea <> s_otra then
    raise exception 'Una tarea solo puede depender de otra del mismo proyecto' using errcode = '23514';
  end if;
  new.space_id := s_tarea;
  -- de a una por proyecto: dos dependencias a la vez podrían cerrar un ciclo entre las dos
  perform pg_advisory_xact_lock(hashtextextended('task_dependencies:' || s_tarea::text, 0));
  if exists (
    with recursive cadena(id) as (
      select new.depende_de
      union
      select d.depende_de from task_dependencies d join cadena c on d.task_id = c.id
    )
    select 1 from cadena where id = new.task_id
  ) then
    raise exception 'Eso haría un ciclo: esa tarea ya espera (directa o indirectamente) a esta' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.task_dependencies_guard() from public, anon, authenticated;
drop trigger if exists task_dependencies_guard on public.task_dependencies;
create trigger task_dependencies_guard before insert or update on public.task_dependencies
  for each row execute function public.task_dependencies_guard();

-- si una tarea cambia de proyecto, sus dependencias (que eran del proyecto viejo) se van
create or replace function public.tasks_dependencias_al_mover() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.space_id is distinct from old.space_id then
    delete from task_dependencies where task_id = new.id or depende_de = new.id;
  end if;
  return null;
end $$;
revoke execute on function public.tasks_dependencias_al_mover() from public, anon, authenticated;
drop trigger if exists tasks_dependencias_al_mover on public.tasks;
create trigger tasks_dependencias_al_mover after update of space_id on public.tasks
  for each row execute function public.tasks_dependencias_al_mover();

-- ——— el conector de Claude: reemplaza la lista de una tarea, como la persona que lo conectó ———
-- p_depende_de = la lista completa (vacía = ninguna). Devuelve cuántas quedaron.
create or replace function public.mcp_dependencias(p_uid uuid, p_task uuid, p_depende_de uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  lista uuid[] := coalesce(p_depende_de, '{}');
  n integer;
begin
  select space_id into sid from tasks where id = p_task;
  if sid is null then raise exception 'No existe esa tarea'; end if;
  perform public.mcp_como(p_uid, sid);
  if exists (select 1 from unnest(lista) x left join tasks t on t.id = x where t.id is null or t.space_id <> sid or not t.abierta) then
    raise exception 'Alguna de esas tareas no está en este proyecto abierto para Claude';
  end if;
  delete from task_dependencies where task_id = p_task and not (depende_de = any (lista));
  insert into task_dependencies (task_id, depende_de, space_id, created_by)
    select p_task, x, sid, p_uid from unnest(lista) x
    on conflict (task_id, depende_de) do nothing;
  select count(*) into n from task_dependencies where task_id = p_task;
  return n;
end $$;
revoke all on function public.mcp_dependencias(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.mcp_dependencias(uuid, uuid, uuid[]) to service_role;
