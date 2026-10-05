-- Pagos en modo prueba de Culqi (llave sk_test_): se registran, pero solo activan el plan a los usuarios de
-- prueba (qa.*). Así las tarjetas de prueba de Culqi, que son públicas, no regalan planes en rockie.plus.
alter table public.planes_pagos add column prueba boolean not null default false;
