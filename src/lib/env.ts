export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  // El login es usuario + contraseña; por debajo Supabase usa <usuario>@<dominio>.
  authEmailDomain: import.meta.env.VITE_AUTH_EMAIL_DOMAIN || 'hq.rockie.plus',
}

export const envReady = Boolean(env.supabaseUrl && env.supabaseAnonKey)
