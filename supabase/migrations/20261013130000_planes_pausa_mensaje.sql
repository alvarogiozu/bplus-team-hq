-- Pausar un plan que ya está en pausa: decirlo así (antes decía «No tienes un plan activo para pausar»).
create or replace function public.pausar_plan(p_meses integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s planes_suscripciones;
  resta interval;
  fin timestamptz;
begin
  if uid is null then raise exception 'Necesitas iniciar sesión'; end if;
  if p_meses is null or p_meses not in (1, 2) then raise exception 'Puedes pausar 1 o 2 meses.'; end if;
  select * into s from planes_suscripciones where user_id = uid for update;
  if found and s.pausa_hasta is not null and s.pausa_hasta > now() then
    raise exception 'Tu plan ya está en pausa hasta el %.', to_char(s.pausa_hasta at time zone 'America/Lima', 'DD/MM/YYYY');
  end if;
  if not found or not public.planes_vigente(s.hasta, s.pausa_hasta) then raise exception 'No tienes un plan activo para pausar.'; end if;
  if s.hasta is null then raise exception 'Tu plan no vence: no necesitas pausarlo.'; end if;
  if s.hasta <= now() + interval '3 days' then
    raise exception 'A tu plan le quedan menos de 3 días: mejor renuévalo o déjalo vencer.';
  end if;
  if s.ultima_pausa is not null and s.ultima_pausa > now() - interval '12 months' then
    raise exception 'Puedes pausar una vez al año. La próxima vez podrás desde el %.',
      to_char((s.ultima_pausa + interval '12 months') at time zone 'America/Lima', 'DD/MM/YYYY');
  end if;
  resta := s.hasta - now();
  fin := now() + make_interval(months => p_meses);
  update planes_suscripciones
     set pausa_desde = now(), pausa_hasta = fin, pausa_restante = resta, hasta = fin + resta,
         ultima_pausa = now(), updated_at = now()
   where user_id = uid;
  return jsonb_build_object('pausa_hasta', fin, 'hasta', fin + resta);
end $$;
