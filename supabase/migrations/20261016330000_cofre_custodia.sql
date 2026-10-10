-- ============================================================
-- Cofre automático («protección estándar»), 9 oct 2026.
-- Pedido de Álvaro: seguridad sin fricción, sin códigos como puerta. Como el modo estándar de Apple:
--   estandar  la llave maestra tiene una copia custodiada por el servidor (cofre_custodia), cerrada con una llave
--             que no está en la base ni en sus respaldos (secret COFRE_CUSTODIA_KEK de las funciones). El Cofre se
--             abre solo al entrar con la cuenta, en cualquier dispositivo. Todo sigue cifrado en la base.
--   avanzada  el modelo original: solo los dispositivos y el código de recuperación abren el Cofre; no hay copia.
-- Las cuentas que ya existían quedan en «avanzada» (así nacieron); las nuevas nacen en «estandar».
-- ============================================================

alter table public.cofre_cuentas
  add column if not exists modo text not null default 'avanzada' check (modo in ('estandar', 'avanzada'));

create table if not exists public.cofre_custodia (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  kid         text not null check (char_length(kid) between 6 and 40),
  envuelto    text not null,
  kek_version int  not null default 1,
  creado      timestamptz not null default now()
);
-- sin políticas: solo la función cofre-custodia (service role) la lee y la escribe
alter table public.cofre_custodia enable row level security;
revoke all on public.cofre_custodia from anon, authenticated;
