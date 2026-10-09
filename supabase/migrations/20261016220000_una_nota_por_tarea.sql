-- La nota de una tarea (Interfaz PC, parte 2: tarea ↔ nota del proyecto) es un material kind='note' con task_id.
-- Una tarea tiene como mucho UNA nota: si dos aparatos la crean a la vez, el segundo insert falla (23505) y la app
-- usa la que ya existe. Sin columnas nuevas: materials.task_id ya existe (FK a tasks, on delete set null).
create unique index if not exists materials_task_note on public.materials (task_id) where kind = 'note' and task_id is not null;
