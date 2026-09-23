-- ============================================================
-- seed.sql — SOLO desarrollo local (`supabase db reset`). Nunca en producción.
-- 5 usuarios (contraseña: bplus-dev-1234), el espacio B+, 8 áreas y datos
-- vivos con fechas relativas a hoy (los rellena public.demo_fill).
-- ============================================================
do $$
declare
  names   text[] := array['alvaro', 'mariana', 'sebastian', 'fabricio', 'angel'];
  display text[] := array['Álvaro', 'Mariana', 'Sebastián', 'Fabricio', 'Ángel'];
  colors  text[] := array['#2a82ad', '#b4637a', '#8aa54a', '#eaa545', '#a573a5'];
  ids uuid[] := '{}';
  uid uuid;
  sid uuid;
begin
  for i in 1..5 loop
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
            names[i] || '@hq.rockie.plus', extensions.crypt('bplus-dev-1234', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}',
            jsonb_build_object('username', names[i], 'display_name', display[i], 'color', colors[i]),
            now() + make_interval(secs => i), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text,
            jsonb_build_object('sub', uid::text, 'email', names[i] || '@hq.rockie.plus'), 'email', now(), now(), now());
    ids := ids || uid;
  end loop;

  insert into public.spaces (name, tagline, about, created_by)
  values ('B+', 'Turn habits into real-life wins together',
          'Una app de hábitos donde Rockie crece contigo y cada hábito se demuestra con una foto. Este cuartel usa las mismas reglas: una tarea, un dueño, una fecha. Todo se valida.',
          ids[1])
  returning id into sid;

  insert into public.space_members (space_id, user_id, role, created_at)
  select sid, ids[i], case when i = 1 then 'owner' else 'member' end, now() + make_interval(secs => i)
  from generate_subscripts(ids, 1) as i;

  insert into public.areas (space_id, name, color, position) values
    (sid, 'App', '#2e88aa', 0), (sid, 'PCB', '#b4637a', 1), (sid, 'Firmware', '#8aa54a', 2),
    (sid, '3D', '#659ca5', 3), (sid, 'Kickstarter', '#eaa545', 4), (sid, 'Video', '#bd6c56', 5),
    (sid, 'Diseño', '#a573a5', 6), (sid, 'Gestión', '#4a6fa5', 7);

  perform public.demo_fill(sid);
end $$;
