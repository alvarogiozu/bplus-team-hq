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
- **Google bloquea iniciar sesión con Google dentro de una app así** (error `disallowed_useragent`). Hasta resolverlo
  (abrir el login en el navegador del sistema o usar el inicio de sesión nativo de Google), dentro de la app se entra
  con correo y clave.
- Para publicar en Play Store hace falta firmar (una keystore que se guarda fuera del repo) y una ficha con capturas.
