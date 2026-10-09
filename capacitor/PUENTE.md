# Puente entre la web y la app de Android

La app de Android abre https://rockie.plus dentro de Capacitor. Esa página ya trae `window.Capacitor` y sus plugins
(Capacitor los inyecta en `server.url`), así que la web **no necesita instalar nada**: solo preguntar si está en la app
y llamar a los plugins por `window.Capacitor.Plugins`.

## 1. ¿Estoy dentro de la app?

```ts
/** true dentro de la app de Android/iPhone (Capacitor); false en el navegador y en la PWA instalada. */
export function esAppNativa(): boolean {
  const cap = (window as any).Capacitor
  return Boolean(cap?.isNativePlatform?.()) || /\bRockieApp\//.test(navigator.userAgent)
}
/** 'android' | 'ios' | 'web' */
export const plataforma = (): string => (window as any).Capacitor?.getPlatform?.() ?? 'web'
```

La app agrega `RockieApp/1 (Android)` al user agent (`capacitor.config.json › appendUserAgent`). Sirve también desde
dentro de un iframe del escritorio, donde `window.Capacitor` no existe.

## 2. Sin compras dentro de la app (precios-y-margenes.md §6)

Con `esAppNativa()`:
- No mostrar «Comprar», precios, `/planes`, avisos de plan ni la Tienda de pago.
- En Android, en su lugar, el texto **«También puedes mejorar tu plan en rockie.plus»**, sin enlace, sin botón y sin
  copiar al portapapeles.
- En iPhone, nada (hasta tener las compras de Apple).
- El plan que la persona ya pagó en la web sí se respeta: solo se esconde la compra.

## 3. Entrar con Google (Google no deja iniciar sesión dentro de un WebView)

En la app, el login se abre en una **Custom Tab** (el Chrome del sistema) y vuelve por el enlace profundo
`plus.rockie.app://auth` (declarado en `android/app/src/main/AndroidManifest.xml`):

```ts
const { Browser, App } = (window as any).Capacitor.Plugins

// a) abrir el login fuera del WebView
const { data } = await client.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: 'plus.rockie.app://auth', skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
})
await Browser.open({ url: data.url, presentationStyle: 'popover' })

// b) al volver (registrar UNA vez al arrancar, solo si esAppNativa())
App.addListener('appUrlOpen', async ({ url }: { url: string }) => {
  if (!url.startsWith('plus.rockie.app://auth')) return
  await Browser.close().catch(() => {})
  const q = new URLSearchParams(url.split('#')[1] ?? url.split('?')[1] ?? '')
  const code = q.get('code')
  if (code) await client.auth.exchangeCodeForSession(code)                 // flujo PKCE
  else if (q.get('access_token') && q.get('refresh_token'))                // flujo implícito (el de hoy)
    await client.auth.setSession({ access_token: q.get('access_token')!, refresh_token: q.get('refresh_token')! })
  // y seguir como al volver de Google en la web (rockie.auth.next → /inicio)
})
```

Requisito en Supabase (Auth › URL Configuration › Redirect URLs): `plus.rockie.app://auth` en **el proyecto cuyo cliente
hace el login**. Hoy `signInWithGoogle` usa `bplus()` (la base de Hábitos) si existe; esa base también tiene que tenerla.
