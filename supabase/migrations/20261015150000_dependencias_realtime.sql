-- Las flechas de dependencia se ven al instante en los demás (Interfaz PC/móvil escuchan task_dependencies
-- filtrando por space_id). replica identity full: el borrado también trae space_id, para que el filtro lo deje pasar.
-- Realtime respeta la RLS (is_member) de cada quien que escucha.
alter table public.task_dependencies replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_dependencies') then
    alter publication supabase_realtime add table public.task_dependencies;
  end if;
end $$;
