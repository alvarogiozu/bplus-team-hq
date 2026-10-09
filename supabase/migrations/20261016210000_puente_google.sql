-- Puente de Google (Hábitos → Rockie OS) del lado del servidor. Antes la app abría la cuenta de Rockie OS de quien entra
-- con Google con una contraseña predecible (Bp!us_SSO_<id de Hábitos>): cualquiera que viera ese id (amigos, grupos)
-- podía entrar a su cuenta. Ahora lo hace la función puente-google (verifica el token de Hábitos con su JWKS) y las
-- contraseñas viejas se cambian por otras al azar. Esta función le dice a puente-google qué cuenta es.
create or replace function public.cuenta_por_correo(p_email text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where email = lower(trim(p_email)) limit 1
$$;
revoke all on function public.cuenta_por_correo(text) from public, anon, authenticated;
grant execute on function public.cuenta_por_correo(text) to service_role;
