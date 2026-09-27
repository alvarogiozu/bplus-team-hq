-- ============================================================
-- Rockie Cuaderno como conector de Claude (servidor MCP remoto con inicio de sesión OAuth 2.1).
-- En Claude: Conectores → Agregar conector personalizado → la URL del cuaderno → "Permitir".
-- Cada conexión (Claude u otra app) es una fila de cuaderno_tokens: se guarda solo el hash de su
-- llave, puede ser de solo lectura y se revoca en Ajustes. Todo lo de OAuth lo toca solo el servidor.
-- ============================================================

alter table public.cuaderno_tokens
  add column if not exists kind text not null default 'llave' check (kind in ('llave', 'oauth')),
  add column if not exists client_id text check (client_id is null or char_length(client_id) <= 500),
  add column if not exists scope text not null default 'escribir' check (scope in ('leer', 'escribir')),
  add column if not exists refresh_hash text unique check (refresh_hash is null or char_length(refresh_hash) = 64),
  add column if not exists expires_at timestamptz,
  add column if not exists refresh_expires_at timestamptz;
create index if not exists cuaderno_tokens_user on public.cuaderno_tokens (user_id, created_at);

-- Una llave personal la crea la app (genera la llave en el navegador y guarda solo su hash);
-- las conexiones OAuth las crea el servidor. Tú solo ves y revocas las tuyas.
drop policy if exists cuaderno_tokens_own on public.cuaderno_tokens;
revoke all on public.cuaderno_tokens from authenticated;
grant select (id, user_id, name, kind, client_id, scope, hint, last_used_at, created_at, expires_at), delete on public.cuaderno_tokens to authenticated;
grant insert (name, token_hash, hint, scope) on public.cuaderno_tokens to authenticated;
create policy cuaderno_tokens_read on public.cuaderno_tokens for select to authenticated using (user_id = auth.uid());
create policy cuaderno_tokens_delete on public.cuaderno_tokens for delete to authenticated using (user_id = auth.uid());
create policy cuaderno_tokens_insert on public.cuaderno_tokens for insert to authenticated with check (user_id = auth.uid());

-- Apps que se registraron solas (registro dinámico, RFC 7591) o que se identifican con una URL
-- (Client ID Metadata Document, como Claude). Solo el servidor.
create table public.cuaderno_oauth_clients (
  client_id     text primary key check (char_length(client_id) between 8 and 500),
  client_name   text not null default '' check (char_length(client_name) <= 120),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  kind          text not null default 'dcr' check (kind in ('dcr', 'cimd')),
  created_at    timestamptz not null default now(),
  fetched_at    timestamptz not null default now()
);
alter table public.cuaderno_oauth_clients enable row level security;
revoke all on public.cuaderno_oauth_clients from anon, authenticated;

-- Códigos de autorización: de un solo uso, viven 10 minutos, atados a PKCE (S256). Solo el servidor.
create table public.cuaderno_oauth_codes (
  code_hash      text primary key check (char_length(code_hash) = 64),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  client_id      text not null,
  client_name    text not null default '',
  redirect_uri   text not null,
  code_challenge text not null check (char_length(code_challenge) between 43 and 128),
  scope          text not null check (scope in ('leer', 'escribir')),
  resource       text,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);
alter table public.cuaderno_oauth_codes enable row level security;
revoke all on public.cuaderno_oauth_codes from anon, authenticated;
create index cuaderno_oauth_codes_expires on public.cuaderno_oauth_codes (expires_at);

-- El viejo "¿de quién es esta llave?" queda reemplazado por la validación en el servidor MCP
drop function if exists public.cuaderno_token_user(text);
