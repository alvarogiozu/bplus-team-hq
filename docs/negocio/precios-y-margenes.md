# Precios, márgenes y cómo cobramos — v1 (9 oct 2026)

> Decisiones tomadas con Álvaro el 9 oct 2026. **Los precios nuevos se activan el día que Culqi apruebe la tienda**, no antes (no mover precios mientras el revisor mira la página). Complementa a `modelo-de-negocio.md` (sección 5 y 8): donde choquen, manda este archivo.
>
> **Ojo con los números:** son estimaciones. IGV 18 %, comisión de Culqi (3.44 % + US$ 0.20, mínimo ~S/ 2.99 por pago), IA típica de `modelo-de-negocio.md` (Plus ~US$ 1/mes, Pro ~US$ 2.70/mes, gratis ~US$ 0.08/mes) y S/ 3.70 por dólar. Se reemplazan por datos reales a las 3 semanas del lanzamiento.

## 1. Precios

| Plan | Hoy | **Nuevo (lista)** | Fundador (de por vida) |
|---|---|---|---|
| Gratis | S/ 0 | S/ 0 | — |
| Plus mensual | S/ 19.90 | **S/ 24.90** | S/ 19.90 |
| Plus anual (−20 %) | S/ 191 | **S/ 239** | S/ 191 |
| Plus estudiante mensual | S/ 12.90 | **S/ 14.90** | — |
| Plus estudiante ciclo (4 meses) | S/ 44.90 | **S/ 49.90** (≈ S/ 12.48/mes, ahorra 16 %) | — |
| Pro mensual | S/ 34.90 | **S/ 39.90** | S/ 34.90 |
| Pro anual | S/ 335 | **S/ 383** | S/ 335 |
| Club (por equipo) | S/ 99 | S/ 99 · anual S/ 950 | — |
| Plus Dúo (2 personas) — *por construir* | — | **S/ 39.90** (S/ 19.95 c/u) · anual S/ 383 | — |
| Plus Grupo (hasta 5, amigos o familia) — *por construir* | — | **S/ 79.90** (S/ 15.98 c/u) · anual S/ 767 | — |

- **Fundador:** quien ya paga o se registra antes del cambio mantiene el precio de hoy para siempre (la tarifa `fundador` ya existe).
- **Estudiante:** sigue bajo el escalón mental de S/ 15 y es 40 % menos que el Plus normal. Se muestra **primero el ciclo**.
- **Dúo y Grupo:** un solo pago (una sola comisión), cada miembro con su propio cupo de IA. El estudiante no se combina con el Grupo. Se construyen **después del lanzamiento**.

## 2. Cuánto deja cada plan (al mes, antes del impuesto a la renta)

| Plan | Te queda típico | Margen | Si agota toda su IA |
|---|---|---|---|
| Plus mensual S/ 24.90 | S/ 14.40 | 68 % | S/ 7.00 |
| Plus anual S/ 239 | S/ 12.40 | 74 % | S/ 5.00 |
| Plus fundador S/ 19.90 | S/ 10.20 | 60 % | S/ 2.80 |
| Estudiante mensual S/ 14.90 | S/ 5.90 | 47 % | **−S/ 1.50** |
| Estudiante ciclo S/ 49.90 | S/ 6.10 | 58 % | **−S/ 1.30** |
| Pro mensual S/ 39.90 | S/ 20.80 | 62 % | S/ 2.30 |
| Dúo S/ 39.90 | S/ 23.40 (total) | 69 % | S/ 8.60 |
| Grupo S/ 79.90 | S/ 45.70 (total) | 68 % | S/ 8.70 |
| Club S/ 99 | ~S/ 74 | ~88 % | ~S/ 69 |
| Cualquier plan + **conector propio** (su Claude/ChatGPT) | +S/ 3.50 sobre la fila de arriba | — | sin pérdida posible |

**Promedio por persona que paga** (40 % Plus normal, 15 % fundador, 35 % estudiante, 10 % Pro; mitad mensual, mitad anual/ciclo): se cobran ~S/ 20.00 y quedan **~S/ 10.80 al mes** (antes: S/ 8.40).

## 3. Escenarios (5 % de los registrados paga)

| Registrados | Pagan | Gratis | Fijos | Queda (Gemini para todos) | Queda (modelo barato para gratis) |
|---|---|---|---|---|---|
| 1 000 | 50 | 950 | S/ 250 | ~S/ 0 | S/ 190 |
| 2 000 | 100 | 1 900 | S/ 250 | S/ 260 | S/ 640 |
| 6 000 | 300 | 5 700 | S/ 400 | S/ 1 120 | S/ 2 260 |
| 20 000 | 1 000 | 19 000 | S/ 800 | S/ 4 270 | S/ 8 070 |

Con 3 % de conversión y Gemini para todos **no se llega a empatar**: el costo de los gratis es la variable que más pesa. Margen bruto total (contando gratis): ~30 % con Gemini para todos, ~52 % con modelo barato en lo gratis (referencias: apps de IA de consumo ~45–50 %, Duolingo ~72 %).

## 4. Reglas para cuidar el margen

1. **Cada plan ≥ 40 % de margen en el uso típico y sin pérdida en el peor caso.** Si a las 3 semanas un plan no cumple, se ajusta su **cupo** antes que su precio.
2. Gratis: 30 mensajes de Rockie al mes (100 la primera semana). No subirlo.
3. Bajar un poco el cupo de IA del **estudiante mensual** (es el único que pierde en el peor caso).
4. Medir el costo de IA **por usuario, plan y función** desde el día 1, con alerta si un plan baja del 40 %.
5. Límites anti-abuso por hora y por mes en el servidor (chat, voz y conector).

## 5. Palancas para ganar más (por impacto)

1. **Modelo barato para los gratis** (abierto, alojado en EE. UU./UE, nunca la API directa de DeepSeek por privacidad). Antes, prueba con 30 pedidos reales: costo por tarea bien hecha, errores, **acciones inventadas** y latencia.
2. **Empujar el conector** (su Claude/ChatGPT): casi cero costo de IA. Primera opción en el onboarding de Plus.
3. **Retención:** cada mes que alguien se queda deja ~S/ 10; anual primero, pausa por vacaciones, recordatorios de Rockie.
4. **Menos costo por mensaje:** caché de contexto de Gemini (instrucciones + herramientas) y Flash-Lite para lo simple.
5. **Acciones sin IA:** botones Hecho / En curso / Agendar en el chat.
6. **Dúo, Grupo y Club:** una sola comisión y poca IA extra.
7. **Comisión:** pedir a Culqi tarifa sin mínimo para suscripciones; con ~300 pagos mensuales, Izipay (3.44 % + S/ 0.69, posible mensualidad S/ 30) ahorra ~S/ 400/mes.
8. **Referidos** (ya construidos) en vez de anuncios.

No hacer: quitar funciones gratis que retienen (Gantt, logros, Cofre); subir precios otra vez sin datos de conversión.

## 6. Cómo cobramos

- **Web (rockie.plus) = canal principal:** Culqi (Yape con código de aprobación + tarjeta con 3DS + tarjeta guardada para renovar). Pendiente: aprobación de Culqi y llaves live.
- **Yape «como PedidosYa»:** es **Yape On File** / **Yape One Shot**, productos de Yape (feb 2026) que se ofrecen vía pasarelas: **PagoEfectivo** y **ProntoPaga** (y EBANX, para grandes). On File = vincular Yape una vez y **cobrar suscripciones sin pedir código** (renovación automática por Yape). Culqi y Mercado Pago hoy: solo código de aprobación. Pendiente: cotizar PagoEfectivo y ProntoPaga (persona natural RUC 10, comisión, mínimo, recurrencia) y preguntar a Culqi.
- **Yape a mano (QR/número):** 0 % pero manual, sin renovación ni tarjeta, riesgo de capturas falsas. Solo como puente con códigos de fundador.
- **App Store / Play Store:** dentro de las apps, las suscripciones digitales **deben** cobrarse con Apple/Google (15 % con el Small Business Program; Google 15 % en suscripciones). En Perú no se puede poner botón ni link a la web (en EE. UU. sí). B+ **no** es app «lectora» como Spotify, y la excepción «app gratuita acompañante» (3.1.3(f)) se interpreta muy estrecha para apps de productividad.
  - **Android:** app «solo de uso» (sin compras), con el texto «También puedes mejorar tu plan en rockie.plus» **sin enlace**: 0 %.
  - **iPhone:** compras de Apple dentro de la app (RevenueCat) + **Iniciar sesión con Apple** (obligatorio porque hay «Entrar con Google»). Mientras tanto, iPhone puede ir como app web instalable (0 %).
  - **Club:** se vende directo a organizaciones (3.1.3(c)), sin Apple.
  - Siempre: correo de bienvenida con link a los planes (permitido fuera de la app).
  - En ventas por tienda, la tienda emite el comprobante y cobra el IGV de servicios digitales; confirmar con el contador que no hay doble IGV.

## 7. IA: quién paga los tokens

| Vía | ¿Paga la persona? | Estado |
|---|---|---|
| Rockie (incluido) con Gemini de pago | No: lo pagamos con el cupo del plan | Base. **Activar facturación de Gemini** (la cuota gratis permite a Google usar los datos → choca con el Cofre) y revisar nivel/tope de gasto en AI Studio |
| Conector en **Claude** (rockie.plus/mcp) | Sí, su suscripción | Funciona (lee, crea, mueve, enlaza) |
| Conector en **ChatGPT** | Sí | Por confirmar: la escritura completa está documentada para Business/Enterprise/Edu; en Plus/Pro puede ser solo lectura. Probar en modo desarrollador |
| **«Continuar con ChatGPT»** (Sign in with ChatGPT, plan usage) | Sí, su plan Plus/Pro, **dentro de nuestro chat** | Prueba limitada para socios comerciales: hay que postular. Sin documentar si permite herramientas (plan B: respuesta con formato fijo que Rockie ejecuta). Si se acaba su límite: **no cambiar de cobro en silencio** (OpenAI lo pide): botón «Administrar uso» o «Seguir con Rockie» |
| Suscripción de **Claude** en nuestro chat | — | **Prohibido** por Anthropic desde feb 2026 (solo con API key) |
| Suscripción de **Gemini** en nuestro chat | — | No existe |

Diseño del chat: selector de motor «Rockie (incluido)» · «Continuar con ChatGPT» (cuando OpenAI apruebe) · «Usar Claude desde su app» (guía del conector dentro del chat). Todas las vías escriben por las mismas herramientas del servidor; **la respuesta se arma con lo que el servidor hizo de verdad**, no con lo que el modelo dice.

**Texto para el formulario de OpenAI** (openai.com/form/sign-in-with-chatgpt-interest — capacidades: *Sign in and ChatGPT plan use for AI requests*):

> Rockie OS is a web and mobile workspace for students, professionals, and student clubs. It combines habits, calendar, notes, and team projects behind one assistant (Rockie) in a chat with voice. Users are in Peru and Latin America. Users who already pay for ChatGPT Plus or Pro could choose "Continue with ChatGPT" inside the Rockie chat; their requests would run on their own plan, and Rockie would create notes, move tasks between boards, and schedule events through our own tools. We do not store or log message content: user data is encrypted on the device before it reaches our servers. If the usage limit is reached, we ask the user to choose between managing their ChatGPT usage or continuing with Rockie's built-in model; we never switch silently. We would like access to the commercial trial, and to know whether tool or function calling is supported under plan usage.

## 8. Fuentes principales

- Culqi: manuales de integración (Yape con código de aprobación). Comisión: `modelo-de-negocio.md` §8.
- Yape On File / One Shot: docs.prontopaga.com (yape-on-file-ocp, yape-on-file-recurrent, yape-one-shot); alianza PagoEfectivo–Yape (Latam Fintech, feb 2026).
- Apple: App Review Guidelines 3.1.1, 3.1.3(a)(b)(c)(f). Google Play: Payments policy (consumption-only) y lista de países de facturación alternativa (Perú no está).
- OpenAI: developers.openai.com/siwc (quickstart, models-and-inference, errors-and-recovery). Anthropic: términos de feb 2026 sobre OAuth de suscripción.
- Márgenes de referencia: resultados de Duolingo 2026 (SEC), encuestas ICONIQ / Benchmarkit 2026.
