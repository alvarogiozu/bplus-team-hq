import { createClient } from '@supabase/supabase-js'

// Cliente de Supabase. La clave publishable es publica por diseno:
// lo que protege los datos es RLS (ver Carpeta de Contexto/19_seguridad_backend.md).
// Si faltan las env vars (repo recien clonado), exporta null y la app cae a modo mock.
const url = import.meta.env.VITE_BPLUS_SUPABASE_URL
const key = import.meta.env.VITE_BPLUS_SUPABASE_ANON_KEY

export const supabase = url && key ? createClient(url, key) : null
