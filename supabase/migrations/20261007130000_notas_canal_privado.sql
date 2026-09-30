-- La edición a la vez de una nota viaja por un canal privado de Realtime ("nota:<id>"):
-- solo quien puede abrir la nota (su dueño o su equipo si está compartida) escucha y escribe ahí.
create policy nota_realtime_read on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'nota:%'
    and public.can_edit_note((substring(realtime.topic() from 6))::uuid)
  );

create policy nota_realtime_write on realtime.messages for insert to authenticated
  with check (
    realtime.topic() like 'nota:%'
    and public.can_edit_note((substring(realtime.topic() from 6))::uuid)
  );
