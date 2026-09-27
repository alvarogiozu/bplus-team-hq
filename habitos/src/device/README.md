# Rockie Companion — interfaz del aparato

Prototipo navegable de la pantalla del companion fisico. Se ve en **`/device`**.

```bash
cd app && npm run dev
# http://localhost:5173/device
```

Hardware objetivo: **ILI9488 3.5" · 320×480 vertical · tactil RESISTIVO · ESP32-S3**.

---

## Que es y que no es

**Es** una especificacion ejecutable. Corre de verdad: lo que le dices a Rockie
crea habitos, metas y areas en el **mismo store que la app del movil**
(`useStore()`), no en una maqueta aparte. Sirve para validar flujos, ensenar el
producto y medir si algo cabe.

**No es** el firmware. El ESP32-S3 no ejecuta React. Esto se porta a **LVGL en
C** (mapa de portado al final). Todo el diseno esta hecho dentro de lo que LVGL
puede reproducir, para que el port sea una traduccion y no un rediseno.

---

## Las cinco restricciones del hardware y como se resolvieron

| Restriccion fisica | Consecuencia | Como se resolvio |
|---|---|---|
| Tactil **resistivo**: un dedo, necesita presion, error ~10 px | Swipe, drag y pinch no son fiables | **Cero gestos.** Todo es un toque en un boton. Minimo tactil **64 px** (no 44) |
| **320 px** de ancho | Caben 2–3 botones por fila, no mas | Rejillas de 2 columnas; barra inferior de **4 pestanas** (80 px cada una) |
| **RGB565** (16 bits) | Los degradados hacen banding visible | Solo rellenos solidos. La profundidad la da el canto 2.5D, no sombras |
| **Fuentes bitmap en flash** | Cada tamano de letra ocupa KB | **Exactamente 5 tamanos** en toda la interfaz. Auditado: se usan 4 |
| **Capa plastica** sobre el panel | Se come contraste y difumina | Prohibido `--ink-muted`; nada por debajo de 12 px; sin lineas de 1 px |

Verificacion en el DOM real (consola del navegador en `/device`):

- lienzo 320×480 exactos, sin desbordamiento horizontal
- 0 objetivos tactiles por debajo del minimo
- 0 elementos con blur, 0 con degradado
- 4 tamanos de fuente en uso (12 / 16 / 20 / 28)

---

## Que cambia respecto a la app del movil

Esto es lo importante: **no es la app encogida.** Cada patron que dependia de un
gesto tuvo que reinventarse.

| App movil | Companion | Por que |
|---|---|---|
| Validar **deslizando** la tarjeta | Tocar fila → detalle → 3 botones grandes | El resistivo no sigue un arrastre. Un toque mas, 0 % de fallo |
| **RuedaAreas** (rueda que se gira) | Rejilla de 2 columnas, celdas de 144×92 | Girar = arrastre continuo + precision. Imposible |
| **WheelTimePicker** (ruedas de hora) | Stepper `+` / `−` de 64×64 | Igual: toda rueda muere aqui |
| **DurationSlider** | Stepper | Los sliders exigen arrastrar |
| **Long-press** para el bottom sheet | Ya no existe | La presion mantenida en resistivo dispara toques fantasma |
| **Swipe-back** entre pantallas | Boton atras siempre visible en la cabecera | Sin boton, el usuario se queda encerrado |
| Bottom sheets | Pantallas completas | Un sheet a 480 px de alto deja 200 px utiles |
| 5 pestanas | 4 pestanas | 5 darian 64 px de ancho: con ±10 px de error se tocan por equivocacion |
| Pestana **Juntos** (social) | Fuera | El aparato es personal y de un vistazo. El feed vive en el telefono |
| Pantalla **Progreso** | Fundida dentro de Rockie | Los 4 numeros que importan caben debajo de la mascota |
| Teclado para escribir | **Voz** + chips de respuesta | Ver abajo |

### La decision grande: no se escribe

Un teclado en pantalla a 320 px de ancho da teclas de **~32 px**: la mitad del
minimo tactil, sobre un panel que ademas falla 10 px. Es inusable. Por eso la
entrada del chat es, en orden:

1. **Voz** (press-to-talk) — el boton mas grande de la interfaz, 72 px. El
   ESP32-S3 ya lleva microfono en el BOM.
2. **Chips** de respuesta rapida — el agente propone 2–3 opciones, la persona
   toca. Por eso la herramienta `proponer_opciones` es obligatoria en el prompt:
   el modelo tiene prohibido escribir alternativas en el texto.
3. **Teclado** — escondido tras un boton, ultimo recurso.

En el prototipo la voz usa la Web Speech API si el navegador la tiene; si no,
abre el teclado. En el aparato: microfono I2S → transcripcion → mismo flujo.

---

## El agente

`agent/` tiene tres piezas:

- **`tools.js`** — las herramientas que Gemini puede llamar (`crear_habito`,
  `crear_meta`, `crear_area`, `validar_habito`, `proponer_opciones`) y sus
  ejecutores. Los ejecutores llaman a las **funciones reales del store**. No hay
  persistencia inventada: lo que se crea aqui aparece en el telefono.
- **`prompt.js`** — instrucciones. Lo mas agresivo del prompt es el limite de
  **2 frases**: la respuesta se lee en una franja de 320×300 px detras de un
  plastico. Un parrafo normal de Gemini no cabe.
- **`runAgent.js`** — el bucle: mensaje → Gemini → ejecutar herramientas →
  devolver resultados → respuesta. Tope de 3 vueltas (sin el, un bucle de
  llamadas se come la cuota).

### Dos cerebros

| Modo | Cuando | Que hace |
|---|---|---|
| **Gemini** | Hay `VITE_GEMINI_API_KEY` en `app/.env.local` | `gemini-2.5-flash` con function calling. Razona |
| **Local** | No hay clave (por defecto) | Parser de intenciones en espanol. Crea cosas reales, no razona |

El modo local existe para una razon concreta: **una demo de hardware en una
feria no puede depender del wifi del recinto.** El cabezal del chat indica cual
esta activo (`IA` / `LOCAL`).

Para activar Gemini:

```bash
echo "VITE_GEMINI_API_KEY=tu-clave" >> app/.env.local
```

> ⚠️ **Eso vale para el prototipo, no para el producto.** En el aparato la clave
> NO puede ir en el firmware: un binario de ESP32 se vuelca por UART y se lee.
> Tiene que ir detras de una edge function de Supabase (como ya hace
> `validate-habit`), y el ESP32 hablar solo con vuestro backend.

---

## Mapa de portado a LVGL

Cada primitiva se eligio por tener equivalente directo. El port es traduccion:

| Aqui | LVGL | Notas |
|---|---|---|
| `Tap` | `lv_button` + `lv_label` | El canto 2.5D = un `lv_obj` hermano detras, 3 px abajo |
| `TapRow` | `lv_button` con flex horizontal | Icono = `lv_label` con fuente Tabler compilada |
| `Chip` | `lv_button` con `radius: LV_RADIUS_CIRCLE` | |
| `Stepper` | 2 `lv_button` + `lv_label` | |
| `Bar` | `lv_bar` | Nativo, sin gradiente |
| `Tabs` | `lv_tabview` (barra abajo) o 4 `lv_button` | |
| `Screen` | `lv_obj` a pantalla completa | Cabecera y tabs fuera del area de scroll |
| Rockie | `lv_image` por capas (base + ojos + boca) | Rasterizar los SVG a PNG a los tamanos usados: **38** (chat) y **100** (reposo). Solo esos dos |
| Fundido `bp-fade` | `lv_obj_fade_in` | 140 ms |
| Pulsacion | `LV_STATE_PRESSED` + `lv_obj_set_y(+3)` | |

**Fuentes a compilar** (5 y no mas): Quicksand 12 / 16 / 20, Fraunces 20 / 28.
Mas el subconjunto de iconos Tabler que se use — **no** el webfont entero.

---

## Estructura

```
device/
  DeviceApp.jsx      raiz: maquina de modos (usuario/nino) + lienzo 320x480
  device.css         tokens del aparato (el porque de cada valor esta comentado)
  nav/Tabs.jsx       4 pestanas: Hablar · Hoy · Rockie · Tienda
  ui/Tap.jsx         Tap · TapRow · Chip · Stepper
  ui/Screen.jsx      chasis · Label · Empty · Bar
  screens/
    Chat.jsx         HABLAR — la principal (voz + chips); variante nino
    Hoy.jsx          habitos del dia (modo usuario)
    HoyNino.jsx      tareas del padre + ciclo enviado/aprobado/rechazado
    RockieTab.jsx    mascota + progreso; variantes usuario y nino
    Tienda.jsx       tienda + editor de Rockie (una UI, dos billeteras)
    ModoNino.jsx     selector de arranque · emparejar (QR) · zona de padres (PIN)
    Vida.jsx         [fuera de pestanas desde 7-ago: foco en Hoy + Rockie]
  agent/             tools · prompt (incl. PROMPT_NINO) · runAgent
```

El estado del control parental vive en `src/data/family.js` (compartido con la
ruta `/familia` de la app). El marco oscuro y el zoom **no existen en el
aparato**: son solo para ensenar el prototipo en el PC.

---

## Modo nino (control parental)

La tesis: **el aparato como alternativa al primer celular.** El nino gana
dopamina cumpliendo metas reales; el padre decide tareas y premios desde SU
app de B+ (Ajustes → Control parental → `/familia`).

```
APARATO (nino)                          APP DEL PADRE (/familia)
--------------                          ------------------------
Arranque: "¿De quien es este Rockie?"
  └─ "Es para mi hijo/a"
       └─ muestra QR + codigo 6 letras ──► vincula con codigo + nombre + PIN
Hoy: tareas del padre                   ◄── crea/edita/pausa/borra tareas
  └─ "¡Ya lo hice!" (foto en el real) ──► cola "Por aprobar"
       estado: esperando                ◄── aprueba → monedas al nino (ledger)
       estado: rechazado + motivo       ◄── rechaza con motivo amable
Chat: "quiero un premio" ──────────────► peticiones (aceptar = crear tarea)
Tienda: gasta SUS monedas en SU Rockie
Zona de padres (PIN): salir del modo / desvincular
```

Sincronizacion en el prototipo: localStorage + evento `storage` — abre
`/device` y `/familia` en dos ventanas y se hablan en vivo. En produccion:
tablas `families` / `family_tasks` / `family_submissions` + Supabase Realtime,
mismo contrato de `family.js`.

### Que pasa si... (huecos cerrados a proposito)

| Situacion | Respuesta del sistema |
|---|---|
| El nino toca "ya lo hice" dos veces | El envio referencia tarea+fecha: el segundo es no-op ("un poquito de paciencia") |
| El padre aprueba dos veces (doble toque, dos ventanas) | Ledger idempotente con clave `tarea:fecha`: se paga UNA vez |
| El padre rechaza | El nino ve el motivo amable y un boton de reintento (reusa el envio, no crea otro) |
| El padre borra una tarea con envio pendiente | El envio pendiente se purga; lo ya aprobado (y pagado) se queda |
| Llega medianoche | Nada que resetear: el estado del dia se DERIVA de la fecha en cada lectura |
| El padre no aprueba en el dia | El envio queda como "atrasado" en su cola; aprobar tarde paga igual |
| El nino intenta salir del modo nino | PIN de 4 digitos; 5 fallos = bloqueo de 60s (persistido: recargar no lo salta) |
| El padre olvida el PIN | Lo cambia desde su app (la app manda; el aparato obedece el estado) |
| El QR no escanea | El codigo de 6 letras (sin O/0 ni I/1) se teclea a mano |
| Desvincular | El aparato vuelve al selector; monedas/inventario/historial del nino SE CONSERVAN |
| Borrar datos del nino | Accion separada, doble confirmacion, desde la app del padre |
| El nino pide cosas sin parar | Tope de 5 peticiones abiertas; la sexta se rechaza con un mensaje |
| El nino compra sin saldo / item con candado | La compra valida saldo y requisitos en el momento; feedback en la celda |
| localStorage corrupto o de version vieja | Se descarta y se arranca limpio; jamas pantalla blanca |
| Sin WiFi (aparato real) | Chat deshabilitado (Gemini vive en la nube); tareas marcables en local y cola de sync al volver la red — por disenar en firmware |

### Seguridad (aparato real)

- La clave de Gemini **jamas** va en el firmware (un binario ESP32 se vuelca
  por UART): vive en una edge function; el aparato habla solo con el backend.
- El PIN tampoco debe viajar al aparato en claro: en produccion la verificacion
  es contra el servidor (hash), no contra el estado local como en el prototipo.
- Las fotos del nino van del aparato al Storage privado de la familia; solo el
  padre las ve. Gemini puede pre-filtrar ("¿la foto muestra una cama tendida?")
  pero la aprobacion final es humana: papa/mama.

---

## Lo que falta

- **Camara.** El boton "¡Ya lo hice!" envia directo. Falta el flujo real de
  captura (OV2640 del ESP32-S3 → Storage → cola del padre).
- **Scroll fisico.** Aqui se hace con el dedo para poder probarlo comodo. En el
  aparato deberia ir con los botones fisicos: arrastrar en resistivo es malo.
- **Backend real del modo nino**: tablas + Realtime + hash del PIN (arriba).
- **Sonido y hapticos**, que en un companion fisico pesan mas que en una app.
