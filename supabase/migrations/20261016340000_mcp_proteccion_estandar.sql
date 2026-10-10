-- El conector (mcp_*) con el Cofre automático (20261016330000): quien está en protección estándar no necesita abrir
-- cada proyecto para Claude. Conectar su asistente es el permiso: el servidor abre sus llaves desde la copia
-- custodiada, solo en memoria y solo para su pedido, y escribe cifrado. Sigue valiendo lo anterior para quien está en
-- protección avanzada: una llave temporal vigente o, mientras dure la migración, el proyecto «abierto para Claude».

create or replace function public.mcp_como(p_uid uuid, p_space uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from space_members where space_id = p_space and user_id = p_uid) then
    raise exception 'No eres miembro de ese proyecto';
  end if;
  if not (
    coalesce((select abierto_claude from spaces where id = p_space), false)
    or exists (select 1 from claude_llaves l where l.user_id = p_uid and l.vence > now() and (l.ambito = 'todo' or l.space_id = p_space))
    or exists (
      select 1 from cofre_cuentas c join cofre_custodia k on k.user_id = c.user_id and k.kid = c.kid
       where c.user_id = p_uid and c.modo = 'estandar'
    )
  ) then
    raise exception 'Ese proyecto no está abierto para Claude';
  end if;
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;
revoke all on function public.mcp_como(uuid, uuid) from public, anon, authenticated;
