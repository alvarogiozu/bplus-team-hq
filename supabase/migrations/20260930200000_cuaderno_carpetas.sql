-- ============================================================
-- Rockie Cuaderno v3 — carpetas.
-- Lo que eran "cuadernos" pasan a ser CARPETAS, y sus secciones, CUADERNOS:
--   carpeta → subcarpetas y cuadernos → secciones (cuaderno dentro de cuaderno) → páginas.
-- Como mucho 4 niveles, sin ciclos, y una carpeta nunca va dentro de un cuaderno.
-- El color se hereda (color null = el de quien lo contiene) y cada carpeta,
-- cuaderno o página puede tener su propio ícono.
-- Además: la hoja de un dibujo puede crecer hacia abajo (hasta 20 000 px).
-- ============================================================

alter table public.cuaderno_books
  add column kind text not null default 'cuaderno' check (kind in ('carpeta', 'cuaderno')),
  add column icon text check (icon is null or char_length(icon) between 1 and 40);
alter table public.cuaderno_books alter column color drop not null;
alter table public.cuaderno_books alter column color drop default;

-- lo de arriba ya era una carpeta; sus secciones heredan su color si era el mismo
update public.cuaderno_books set kind = 'carpeta' where parent_id is null;
update public.cuaderno_books c set color = null
  from public.cuaderno_books p
  where c.parent_id = p.id and c.color = p.color;

alter table public.cuaderno_notes
  add column color text check (color is null or color in ('coral', 'amber', 'green', 'accent', 'berry', 'olive', 'navy', 'title')),
  add column icon text check (icon is null or char_length(icon) between 1 and 40);

-- Reglas del árbol: del mismo dueño, sin ciclos, carpetas solo dentro de carpetas, máx. 4 niveles.
create or replace function public.cuaderno_books_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p_user uuid;
  p_kind text;
  cur uuid;
  lvl int := 1;
  below int := 0;
begin
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'No cambia de dueño';
  end if;
  if new.parent_id is not null then
    if new.parent_id = new.id then raise exception 'No puede ir dentro de sí mismo'; end if;
    select user_id, kind into p_user, p_kind from cuaderno_books where id = new.parent_id;
    if p_user is null or p_user <> new.user_id then
      raise exception 'Solo dentro de tus carpetas';
    end if;
    if new.kind = 'carpeta' and p_kind <> 'carpeta' then
      raise exception 'Una carpeta no va dentro de un cuaderno';
    end if;
    cur := new.parent_id;
    while cur is not null loop
      if cur = new.id then raise exception 'No puede ir dentro de sí mismo'; end if;
      lvl := lvl + 1;
      if lvl > 4 then raise exception 'Como mucho 4 niveles'; end if;
      select parent_id into cur from cuaderno_books where id = cur;
    end loop;
  end if;
  if tg_op = 'UPDATE' and (new.parent_id is distinct from old.parent_id or new.kind <> old.kind) then
    -- lo que ya tiene adentro también cuenta para los 4 niveles
    with recursive sub as (
      select id, 1 as d from cuaderno_books where parent_id = new.id
      union all
      select b.id, s.d + 1 from cuaderno_books b join sub s on b.parent_id = s.id where s.d < 8
    )
    select coalesce(max(d), 0) into below from sub;
    if lvl + below > 4 then raise exception 'Como mucho 4 niveles'; end if;
    if new.kind = 'cuaderno' and exists (select 1 from cuaderno_books where parent_id = new.id and kind = 'carpeta') then
      raise exception 'Un cuaderno no puede tener carpetas adentro';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.cuaderno_books_guard() from public, anon;

-- Hojas de dibujo más largas (para ejercicios): crecen hacia abajo
alter table public.cuaderno_drawings drop constraint if exists cuaderno_drawings_height_check;
alter table public.cuaderno_drawings add constraint cuaderno_drawings_height_check check (height between 100 and 20000);
