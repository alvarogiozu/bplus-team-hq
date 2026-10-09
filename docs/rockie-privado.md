# Rockie privado — plan corto (9 oct 2026, sesión 5)

**Objetivo:** «nuestra propia IA» que trabaje sobre lo cifrado sin que nadie lo vea, ni Rockie ni el proveedor. El
navegador descifra lo que hace falta del Cofre, habla **directo con un enclave** (GPU con TEE y atestación
verificable), el modelo devuelve **acciones** y el navegador las aplica cifrando, como hoy.

**Estado:** sin construir. Primero, los números de la prueba (`node scripts/modelos-baratos.mjs tinfoil`, tarea 33).

## Cómo funciona hoy y qué cambia

Hoy (`agenda-agent`): el navegador manda el contexto **ya descifrado** a nuestra Edge Function. Ella arma el prompt
(`kit.ts`), llama a Gemini, valida las propuestas y las devuelve. No guarda nada, pero ve el contexto en memoria y
Google lo procesa.

Rockie privado:

1. **El agente se mueve al navegador.** `kit.ts` (instrucciones, herramientas, `valid`, posproceso) ya es puro: no usa
   Deno ni npm, y desde el 9 oct es un módulo aparte. Vite lo puede importar tal cual. El navegador arma el mismo
   pedido que hoy arma la función.
2. **Canal atestado con el SDK de Tinfoil** (`tinfoil` en npm). Según su documentación funciona en navegadores (ES2020
   + Web Crypto) con el transporte EHBP: cifra el cuerpo con HPKE **para el enclave verificado**, así que nadie en el
   medio lo lee. El fijado de TLS es solo de Node. Antes de mandar nada verifica la atestación: código del enclave y
   hardware.
3. **Relay ciego, no «ni eso».** La llave de API no puede ir en el navegador (el SDK lo marca como
   `dangerouslyAllowBrowser`). El SDK acepta un `baseURL` propio: una Edge Function nuestra reenvía los bytes
   cifrados con HPKE, que no puede abrir, y les pone nuestra llave. Ahí mismo se cuenta el cupo.
4. **Las acciones se aplican igual que hoy:** tarjetas que la persona confirma; el cliente escribe con `fetchCifrado`.
   No cambia el modelo de propuestas.
5. **Sin respaldo silencioso:** en modo privado, si el enclave falla no se cae a Gemini ni a Claude (eso rompería la
   promesa). Se avisa «Rockie privado no responde» y la persona elige reintentar o usar el Rockie normal.

## Cupos sin ver el contenido

- El relay cuenta **pedidos** por persona: `usar_cupo` y `ia_tope`, igual que hoy, porque sabe quién llama (su sesión)
  aunque no pueda leer el cuerpo.
- **Tokens y costo:** la respuesta también va cifrada, así que el relay no ve el `usage`. Opciones: el tamaño en bytes
  como aproximación, el total por llave del panel de Tinfoil para conciliar el mes, o que el navegador reporte su
  `usage` (no es confiable, solo sirve para estadística). `ia_uso` anota `proveedor = 'tinfoil'` con tokens
  estimados.

## Estimación

| Parte | Días |
|---|---|
| Relay `rockie-privado` (Edge Function: sesión, cupo, tope, reenvío ciego, `ia_uso`) | 0,5 |
| Cliente: `askRockiePrivado` en el hilo (SDK, verificación al iniciar, `kit.ts` en el navegador, sin respaldo) | 1–1,5 |
| UI: interruptor «Rockie privado» en el selector de motor + estado de la verificación (iframe de Tinfoil o el nuestro) | 0,5 |
| Batería de 56 frases y prueba de modelos contra el enclave, e2e con el agente simulado | 0,5 |
| **Chat (agenda, notas, hábitos, tareas)** | **≈ 3** |
| Cuaderno (preguntar, conversar, ordenar) sobre el mismo canal | +2 |
| «Aprender» con PDF y video (hoy es multimodal de Gemini) | fuera de la fase 1 |

## Riesgos

- **Calidad:** los modelos abiertos del enclave (Gemma 4 31B, DeepSeek V4.1 Flash, GPT-OSS 120B; hoy no hay Qwen con
  chat en Tinfoil) contra Gemini Flash-Lite, que hace 30/30 y 56/56. Lo decide la prueba.
- **Latencia:** la verificación al conectar más el transporte cifrado. Hay que medir el primer mensaje y los
  siguientes.
- **Costo:** Tinfoil no publica sus precios por token en la documentación; Phala dice ~US$ 0,32/M de entrada en Qwen
  27B. Hoy pagamos ~US$ 0,00045 por tarea con Gemini.
- **La voz no es privada:** el dictado usa el reconocimiento del navegador (Web Speech), que en Chrome manda el audio a
  Google. Para que todo sea privado hay que avisarlo o pasar a un reconocimiento en el dispositivo o en el enclave.
- **Proveedor joven:** depender de una startup. NEAR AI Cloud (compatible con OpenAI, prueba firmada por respuesta)
  queda como segundo proveedor, con la misma forma de relay.
- **Navegador:** el peso del SDK y del verificador, la CSP (`connect-src` al enclave o solo al relay) e iPhone Safari.
  Hay que probarlo en la tarea de voz y el celular.
- **Lo que el modelo ve:** el contexto de la persona dentro del enclave, en memoria. La garantía es la atestación
  (código y hardware), no la confianza en el proveedor. Hay que contarlo así en la política de privacidad.

## Próximo paso

Cuando estén las llaves de la tarea 33 (con `TINFOIL_API_KEY` y `TINFOIL_PRECIO`), corro la prueba y comparo con
Gemini. Si algún modelo del enclave hace ≥ 28/30 sin acciones inventadas y con p50 < 4 s, se construye la fase 1.
