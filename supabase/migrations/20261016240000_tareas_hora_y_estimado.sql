-- Vista «Hoy» de Tareas (Interfaz PC): a qué hora se planea hacer una tarea y cuánto se estima.
-- start_time: hora local de quien la fija (el día sigue siendo start_date/due_date); la app la muestra «HH:MM».
-- estimate_min: minutos, de 5 a 24 h. Sin texto de nadie: no se cifran (tasks.publico en privacidad.json).
alter table public.tasks
  add column if not exists start_time time,
  add column if not exists estimate_min integer check (estimate_min is null or estimate_min between 5 and 1440);
