-- Libro de Reclamaciones virtual (INDECOPI), integrado en rockie.plus (/libro-de-reclamaciones).
-- Lo puede llenar cualquiera (con o sin cuenta). Las hojas NO son contenido privado de una persona: están dirigidas
-- al comercio, que por ley tiene que leerlas y responder en un plazo máximo de 15 días hábiles. Nadie las puede leer
-- desde la app (sin políticas de lectura): el comercio las ve en el panel de Supabase.

create sequence public.libro_reclamaciones_numero;

create table public.libro_reclamaciones (
  id               uuid primary key default gen_random_uuid(),
  numero           bigint not null unique default nextval('public.libro_reclamaciones_numero'),
  created_at       timestamptz not null default now(),
  user_id          uuid references public.profiles(id) on delete set null,
  tipo             text not null check (tipo in ('reclamo', 'queja')),
  nombre           text not null check (char_length(nombre) between 3 and 120),
  documento_tipo   text not null check (documento_tipo in ('DNI', 'CE', 'Pasaporte', 'RUC')),
  documento_numero text not null check (char_length(documento_numero) between 6 and 20),
  domicilio        text not null check (char_length(domicilio) between 5 and 200),
  telefono         text not null default '' check (char_length(telefono) <= 20),
  correo           text not null check (correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(correo) <= 120),
  menor_de_edad    boolean not null default false,
  apoderado        text not null default '' check (char_length(apoderado) <= 160),
  bien_tipo        text not null check (bien_tipo in ('producto', 'servicio')),
  monto_centimos   integer check (monto_centimos is null or monto_centimos >= 0),
  descripcion_bien text not null check (char_length(descripcion_bien) between 3 and 500),
  detalle          text not null check (char_length(detalle) between 10 and 3000),
  pedido           text not null check (char_length(pedido) between 3 and 1500),
  respuesta        text,
  respondido_en    timestamptz
);
alter table public.libro_reclamaciones enable row level security; -- sin políticas: se escribe solo con registrar_reclamo

/** Registrar una hoja. Devuelve el número correlativo y la fecha (la constancia que ve la persona). */
create or replace function public.registrar_reclamo(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fila libro_reclamaciones;
  v_correo text := lower(trim(p->>'correo'));
begin
  -- freno contra el spam: hasta 5 hojas por correo al día
  if (select count(*) from libro_reclamaciones where libro_reclamaciones.correo = v_correo and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Ya registraste varias hojas hoy con este correo. Si es urgente, escríbenos directamente.';
  end if;
  insert into libro_reclamaciones (
    user_id, tipo, nombre, documento_tipo, documento_numero, domicilio, telefono, correo, menor_de_edad, apoderado,
    bien_tipo, monto_centimos, descripcion_bien, detalle, pedido
  ) values (
    auth.uid(),
    p->>'tipo',
    trim(p->>'nombre'),
    p->>'documento_tipo',
    trim(p->>'documento_numero'),
    trim(p->>'domicilio'),
    coalesce(trim(p->>'telefono'), ''),
    v_correo,
    coalesce((p->>'menor_de_edad')::boolean, false),
    coalesce(trim(p->>'apoderado'), ''),
    p->>'bien_tipo',
    nullif(p->>'monto_centimos', '')::integer,
    trim(p->>'descripcion_bien'),
    trim(p->>'detalle'),
    trim(p->>'pedido')
  ) returning * into fila;
  return jsonb_build_object('numero', fila.numero, 'fecha', fila.created_at);
end $$;

revoke all on function public.registrar_reclamo(jsonb) from public;
grant execute on function public.registrar_reclamo(jsonb) to anon, authenticated;
