-- Límites anti-abuso por hora y por mes, en el servidor (docs/negocio/precios-y-margenes.md, regla 4.5).
-- Chat y voz ya tienen los suyos (agenda_agent_bump: 60 por hora; usar_cupo: el cupo del mes de cada plan).
-- Esto es el tope genérico para lo que no tenía ninguno, empezando por el conector (su Claude o ChatGPT):
-- no gasta nuestra IA salvo la búsqueda por significado, pero sin tope un script podría martillar la base.
-- Solo cuenta (quién, qué tope, desde cuándo, cuántas): nunca el contenido.

create table public.ia_topes (
  user_id uuid not null references auth.users (id) on delete cascade,
  clave   text not null,          -- p. ej. conector:h (la hora) o conector:m (el mes)
  inicio  timestamptz not null,
  cuenta  integer not null default 0,
  primary key (user_id, clave, inicio)
);
alter table public.ia_topes enable row level security; -- sin políticas: solo el servidor
revoke all on public.ia_topes from anon, authenticated;

/** Cuenta un uso y dice si pasa: ok false con la ventana (hora o mes) que se llenó. Solo la llave de servicio. */
create or replace function public.ia_tope(p_user uuid, p_clave text, p_por_hora integer, p_por_mes integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  h integer;
  m integer;
begin
  if p_clave !~ '^[a-z_]{3,30}$' then raise exception 'Tope desconocido'; end if;
  insert into ia_topes (user_id, clave, inicio, cuenta) values (p_user, p_clave || ':h', date_trunc('hour', now()), 1)
    on conflict (user_id, clave, inicio) do update set cuenta = ia_topes.cuenta + 1 returning cuenta into h;
  insert into ia_topes (user_id, clave, inicio, cuenta) values (p_user, p_clave || ':m', date_trunc('month', now()), 1)
    on conflict (user_id, clave, inicio) do update set cuenta = ia_topes.cuenta + 1 returning cuenta into m;
  -- limpieza de vez en cuando: las horas viejas ya no sirven
  if random() < 0.01 then delete from ia_topes where clave like '%:h' and inicio < now() - interval '2 days'; end if;
  if h > p_por_hora then return jsonb_build_object('ok', false, 'ventana', 'hora', 'limite', p_por_hora); end if;
  if m > p_por_mes then return jsonb_build_object('ok', false, 'ventana', 'mes', 'limite', p_por_mes); end if;
  return jsonb_build_object('ok', true, 'hora', h, 'mes', m);
end $$;
revoke all on function public.ia_tope(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.ia_tope(uuid, text, integer, integer) to service_role;
