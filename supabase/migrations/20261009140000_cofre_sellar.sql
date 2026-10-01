-- ============================================================
-- El Cofre — ajustes de la tanda 2
-- · El enlace de un material va cifrado: ya no puede exigirse que empiece con http(s) en la base
--   (lo valida la app antes de cifrar).
-- · Sellar filas que nadie puede editar (actividad, avances de metas): una sola función, con lista cerrada
--   de tablas y columnas, que solo acepta cambiar texto en claro por su versión cifrada (cf1/cj1).
-- ============================================================

alter table public.materials drop constraint if exists materials_url_check;
alter table public.materials add constraint materials_url_check
  check (url is null or url ~* '^https?://' or url like 'cf1.%');

create or replace function public.cofre_sellar(p_tabla text, p_id uuid, p_campos jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  permitidas constant jsonb := '{"activity": ["summary", "data"], "goal_checkins": ["note"]}';
  col text;
  tipo text;
  sid uuid;
  actual jsonb;
  nuevo jsonb;
  sets text[] := '{}';
begin
  if p_campos is null or not (permitidas ? p_tabla) then return false; end if;
  execute format('select space_id, to_jsonb(t) from public.%I t where id = $1', p_tabla) into sid, actual using p_id;
  if sid is null or not public.is_member(sid) then return false; end if;
  for col in select jsonb_array_elements_text(permitidas -> p_tabla) loop
    nuevo := p_campos -> col;
    continue when nuevo is null or jsonb_typeof(nuevo) <> 'string';
    continue when not ((nuevo #>> '{}') like 'cf1.%' or (nuevo #>> '{}') like 'cj1.%');
    -- solo la primera vez: lo que ya está cifrado no se toca
    continue when jsonb_typeof(actual -> col) = 'string'
              and ((actual ->> col) like 'cf1.%' or (actual ->> col) like 'cj1.%');
    select format_type(a.atttypid, a.atttypmod) into tipo
      from pg_attribute a where a.attrelid = ('public.' || p_tabla)::regclass and a.attname = col;
    sets := sets || case when tipo in ('jsonb', 'json')
                         then format('%I = %L::jsonb', col, nuevo::text)
                         else format('%I = %L', col, nuevo #>> '{}') end;
  end loop;
  if cardinality(sets) = 0 then return false; end if;
  execute format('update public.%I set %s where id = $1', p_tabla, array_to_string(sets, ', ')) using p_id;
  return true;
end $$;
revoke all on function public.cofre_sellar(text, uuid, jsonb) from public, anon;
grant execute on function public.cofre_sellar(text, uuid, jsonb) to authenticated;

drop function if exists public.cofre_sellar_actividad(uuid, jsonb);
