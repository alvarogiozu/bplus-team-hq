-- El número de las hojas del Libro de Reclamaciones es correlativo: la prueba inicial gastó el 1 (y se borró).
-- Se reinicia para que la primera hoja real sea la 000001 (o la siguiente a la última que exista).
select setval(
  'public.libro_reclamaciones_numero',
  coalesce((select max(numero) from public.libro_reclamaciones), 0) + 1,
  false
);
