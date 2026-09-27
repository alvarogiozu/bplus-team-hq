-- Subnotas: la regla "vive donde vive su tema" se aplica al crearla o al cambiarle de tema.
-- Si solo cambia su cuaderno (al borrar el cuaderno pasan todas a Sueltas, o el tema se mueve y la arrastra),
-- no se fuerza: evita que una subnota apunte al cuaderno que se está borrando.
drop trigger if exists cuaderno_notes_parent_guard on public.cuaderno_notes;
create trigger cuaderno_notes_parent_guard before insert or update of parent_note_id on public.cuaderno_notes
  for each row execute function public.cuaderno_notes_parent_guard();
