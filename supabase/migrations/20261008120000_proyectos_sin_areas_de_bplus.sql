-- Un proyecto nuevo (spaces) nace SIN áreas: las de B+ (App, PCB, Firmware, 3D, Kickstarter…) no
-- tienen sentido para una tesis, un curso o un proyecto personal. Cada quien crea las suyas en Ajustes.
-- (La app ya borra esas áreas al crear un proyecto; esto lo arregla en el origen.)
create or replace function public.create_space(p_name text default 'Mi proyecto') returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Necesitas iniciar sesión'; end if;
  insert into spaces (name, created_by) values (left(coalesce(nullif(trim(p_name), ''), 'Mi proyecto'), 60), uid)
  returning id into sid;
  insert into space_members (space_id, user_id, role) values (sid, uid, 'owner');
  return sid;
end $$;
