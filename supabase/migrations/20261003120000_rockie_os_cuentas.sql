-- Rockie OS: una sola cuenta para Hábitos, Agenda, Equipo y Cuaderno.
-- Quien entra con Google no trae usuario ni nombre en los metadatos de registro: se arma un
-- usuario válido (a-z 0-9 . _, 3 a 20) y único a partir del correo, y el nombre sale de Google.
-- El registro con usuario y contraseña sigue igual (ese usuario ya viene validado y libre).

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := lower(coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(coalesce(new.email, ''), '@', 1)));
  u    text;
  n    int := 0;
  dn   text := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), '')
  );
  c    text := new.raw_user_meta_data->>'color';
begin
  base := regexp_replace(translate(base, 'áéíóúüñàèìòù', 'aeiouunaeiou'), '[^a-z0-9._]', '', 'g');
  if char_length(base) < 3 then
    base := rpad(coalesce(nullif(base, ''), 'rockie'), 3, '0');
  end if;
  base := left(base, 16);
  u := base;
  while exists (select 1 from public.profiles where lower(username) = u) loop
    n := n + 1;
    u := base || n::text;
  end loop;
  if dn is null then dn := u; end if;
  if c is null or c !~ '^#[0-9a-fA-F]{6}$' then c := '#2a82ad'; end if;
  insert into public.profiles (id, username, display_name, color)
  values (new.id, u, left(dn, 40), c);
  return new;
end $$;
