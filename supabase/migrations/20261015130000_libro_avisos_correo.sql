-- Libro de Reclamaciones: copia de la hoja al consumidor y aviso al dueño, por correo (función libro-aviso).
-- Al registrarse una hoja, un trigger llama a libro-aviso por pg_net (asíncrono: no frena ni hace fallar el registro).
-- Cada hora un cron vuelve a llamarla por si algo falló (Resend caído, llave aún sin poner). La función solo manda lo
-- pendiente y lo marca en estas columnas.

alter table public.libro_reclamaciones
  add column if not exists copia_enviada_en timestamptz,
  add column if not exists aviso_dueno_en timestamptz;

create extension if not exists pg_net with schema extensions;

create or replace function public.libro_reclamaciones_avisar() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://xhtxhmfohtkezhpobbcr.supabase.co/functions/v1/libro-aviso',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('origen', 'hoja', 'numero', new.numero),
    timeout_milliseconds := 30000
  );
  return new;
end $$;
revoke execute on function public.libro_reclamaciones_avisar() from public, anon, authenticated;

drop trigger if exists libro_reclamaciones_avisar on public.libro_reclamaciones;
create trigger libro_reclamaciones_avisar after insert on public.libro_reclamaciones
  for each row execute function public.libro_reclamaciones_avisar();

select cron.unschedule(jobid) from cron.job where jobname = 'libro-aviso';
select cron.schedule('libro-aviso', '17 * * * *', $cron$
  select net.http_post(
    url := 'https://xhtxhmfohtkezhpobbcr.supabase.co/functions/v1/libro-aviso',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"origen": "cron"}'::jsonb,
    timeout_milliseconds := 60000
  )
$cron$);
