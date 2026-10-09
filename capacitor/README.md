# Rockie para Android (Capacitor)

La app de Android es una ventana nativa que abre **https://rockie.plus/inicio** (`capacitor.config.json › server.url`).
Por eso cada despliegue llega solo al teléfono, sin publicar otra versión. Lo único nativo es: el nombre, el ícono, la
pantalla de carga y los permisos (micrófono para la voz, cámara para las fotos de prueba).

Es un mini-proyecto aparte: tiene su propio `package.json` y no toca el build de la web.

## Lo que hay
- `capacitor.config.json`: id `plus.rockie.app`, nombre «Rockie», URL que abre.
- `android/`: el proyecto de Android Studio (generado con `npx cap add android`, con los colores de Rockie).
- `iconos.mjs`: dibuja los íconos y las pantallas de carga con Rockie (PWA en `public/` y Android). Se corre desde
  la raíz con `node capacitor/iconos.mjs`.
- `www/`: solo un respaldo que redirige a rockie.plus (Capacitor exige una carpeta web).

## Probarla en tu teléfono (una vez)
1. Instala **Android Studio** (trae el JDK 21 y el SDK de Android que hacen falta; Java 8 no sirve).
2. En el teléfono: Ajustes › Acerca del teléfono › toca 7 veces «Número de compilación». Luego, en
   Opciones de desarrollador, activa **Depuración por USB**. Conéctalo por cable y acepta el aviso.
3. En una terminal:
   ```
   cd capacitor
   npm install
   npx cap sync android
   npx cap open android
   ```
4. En Android Studio, espera a que termine «Gradle sync», elige tu teléfono arriba y pulsa ▶ (Run).
   Sin cable: Build › Build App Bundle(s)/APK(s) › Build APK(s), y pasa el `.apk` al teléfono para instalarlo.

## Cosas que hay que saber
- **Entrar con Google:** Google no deja iniciar sesión dentro de un WebView (error `disallowed_useragent`), así que en
  la app se abre en Chrome (Custom Tab) y vuelve por `plus.rockie.app://auth` (ver PUENTE.md). Esa dirección tiene que
  estar en Supabase › Authentication › URL Configuration › Redirect URLs (proyectos de Hábitos y de Rockie OS).
- **Sin compras dentro de la app** (precios-y-margenes.md §6): la web lo resuelve con `src/lib/appNativa.ts`.
- Para publicar en Play Store hace falta firmar (llave fuera del repo, abajo) y una ficha con capturas.

## Llave de firma (Play Store)
**Ya existe** (9 oct, la generó Claude): `%USERPROFILE%DownloadsRespaldos-Rockieandroidockie-upload.jks` y, al lado,
`keystore.properties` con su contraseña (aleatoria; nunca en el repo, chats ni tareas). `android/app/build.gradle` la usa
sola si encuentra ese archivo (o uno en `%USERPROFILE%.rockieirma`); si no, el release sale sin firmar.
- Alias `rockie`, RSA 2048, PKCS12, válida 10 000 días. Huella SHA-256 del certificado (pública; sirve para
  `assetlinks.json` y para un cliente OAuth Android de Google):
  `B5:BE:D0:24:3B:4C:A3:7E:F0:4D:2A:3A:CE:59:59:9F:6E:79:D6:8A:60:BD:07:D1:00:F4:3B:3E:49:A1:B2:76`
- **Respáldala** (los dos archivos) fuera de la PC: gestor de contraseñas o USB. Es la llave de **subida** de «Play App
  Signing»: si se pierde, Google puede cambiarla, pero tarda días y mientras no se puede actualizar la app.
- No se borra con el respaldo diario (ese solo rota carpetas con nombre de fecha).
Para el archivo que se sube: Android Studio › Build › Generate Signed App Bundle(s)/APK(s) › Android App Bundle, o
`cd android && .\gradlew.bat bundleRelease` → `android/app/build/outputs/bundle/release/app-release.aab`.
