-- Avisos de seguridad del linter de Supabase (supabase db advisors, 9 oct): limpiar antes del lanzamiento.
--
-- 1. Funciones de trigger SECURITY DEFINER expuestas como /rest/v1/rpc/… a anon y authenticated.
--    Un trigger no se puede llamar por RPC con sentido, y Postgres solo revisa EXECUTE al CREAR el
--    trigger, no al dispararlo: quitar el permiso no cambia nada de lo que hacen. Se barre todo
--    public (incluye los *_guard, *_abierta, cofre_al_salir, rockie_turns_prune…).
-- 2. Funciones con search_path mutable: se fija a public (lo único que usan).
--
-- Se quedan públicas A PROPÓSITO: invite_info (la invitación se ve antes de entrar), registrar_reclamo
-- (Libro de Reclamaciones sin cuenta) y username_available (registro). Las RPC de equipo/planes son
-- para authenticated y validan auth.uid() por dentro.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;

alter function public.agenda_items_guard() set search_path = public;
alter function public.profiles_guard() set search_path = public;
alter function public.touch_updated_at() set search_path = public;
alter function public.hq_norm(text) set search_path = public;
alter function public.cofre_ruta_sellada(text, text) set search_path = public;
alter function public.planes_limite_error(text, text) set search_path = public;
alter function public.planes_vigente(timestamptz, timestamptz) set search_path = public;
