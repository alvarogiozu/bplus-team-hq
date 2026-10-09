-- El aviso del límite del conector ya no promete ChatGPT (sin confirmar, precios-y-margenes §7): solo Claude.
create or replace function public.planes_tg_conector() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.limite_de(new.user_id, 'conector_ia'), 1) = 0 then
    perform public.planes_limite_error('conector_ia',
      'Conectar tu IA al Cuaderno es parte de Plus. Con Plus conectas tu Claude y trabaja con tus notas.');
  end if;
  return new;
end $$;
