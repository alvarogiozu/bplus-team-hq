# Rockie OS (bplus-hq)

## 🔒 Privacidad primero (NO negociable)
Rockie cifra de extremo a extremo con **el Cofre**: lo de cada persona se cifra en su dispositivo y el dueño de Rockie
NO puede leerlo. Antes de tocar datos, lee `docs/privacidad.md`. En corto:

- Toda columna nueva de texto/JSON va en `src/lib/cofre/privacidad.json` (por defecto en `cifrar`; en `publico` solo con
  motivo). `npm run build` falla si falta.
- El cifrado vive SOLO en `src/lib/cofre/fetchCifrado.ts` (el fetch de Supabase): no cifres a mano en pantallas.
- El servidor (Edge Functions, SQL) no lee contenido de personas: el cliente manda lo que haga falta, ya descifrado, en
  el pedido; nada de guardarlo ni loguearlo.
- No filtres/ordenes en la base por columnas cifradas; hazlo en el cliente.
- Archivos de personas: subir cifrados y mostrar vía blob URL.
- Nunca un «modo admin» que lea datos de usuarios, ni un atajo que salte el Cofre (tampoco «solo para pruebas»).
