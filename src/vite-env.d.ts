/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_AUTH_EMAIL_DOMAIN?: string
  readonly VITE_BPLUS_SUPABASE_URL?: string
  /** '0' = vuelta atrás de «una base» (lib/unaBase): Hábitos vuelve a su base vieja */
  readonly VITE_HABITOS_UNIDA?: string
}

/** versión del build (vite.config: define) */
declare const __BUILD_ID__: string

interface ImportMeta {
  readonly env: ImportMetaEnv
}
