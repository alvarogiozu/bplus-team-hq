-- Borrar la cuenta completa (Google Play y Apple: desde la app y desde rockie.plus/borrar-cuenta). La hace la función
-- borrar-cuenta; aquí lo que la base necesita para que el borrado no falle ni deje cosas mal:
--  1. Antes, admin.deleteUser fallaba para casi todos: members_guard no deja quitar al último dueño de un equipo y casi
--     todos son dueños de su propio proyecto. preparar_borrado_cuenta deja cada equipo bien antes de borrar:
--       - si hay más gente, el dueño pasa al miembro más antiguo;
--       - si estaba solo, el equipo se borra entero (con sus tareas, áreas, materiales…).
--  2. Los pagos se conservan sin dueño (la SUNAT pide guardar comprobantes 5 años): planes_pagos.user_id → null.
-- Solo la llave de servicio llama a preparar_borrado_cuenta.

-- ——— pagos: se quedan, anónimos ———
alter table public.planes_pagos alter column user_id drop not null;
do $$
declare r record;
begin
  for r in
    select c.conname from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.conrelid = 'public.planes_pagos'::regclass and a.attname = 'user_id'
  loop
    execute format('alter table public.planes_pagos drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.planes_pagos
  add constraint planes_pagos_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null;

-- ——— equipos: nadie se queda sin dueño; los que eran solo suyos se van ———
-- Devuelve los equipos borrados (para que la función borre sus archivos de materiales y pruebas).
create or replace function public.preparar_borrado_cuenta(p_uid uuid) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  s record;
  heredero uuid;
  borrados uuid[] := '{}';
begin
  -- members_guard pide que quien cambia roles sea dueño: se actúa como la persona que se va
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  for s in select space_id from space_members where user_id = p_uid and role = 'owner' loop
    if exists (select 1 from space_members where space_id = s.space_id and role = 'owner' and user_id <> p_uid) then
      continue; -- hay otro dueño: no hace falta nada
    end if;
    select user_id into heredero from space_members
      where space_id = s.space_id and user_id <> p_uid order by created_at limit 1;
    if heredero is not null then
      update space_members set role = 'owner' where space_id = s.space_id and user_id = heredero;
    else
      delete from spaces where id = s.space_id;
      borrados := borrados || s.space_id;
    end if;
  end loop;
  return borrados;
end $$;
revoke all on function public.preparar_borrado_cuenta(uuid) from public, anon, authenticated;
grant execute on function public.preparar_borrado_cuenta(uuid) to service_role;
