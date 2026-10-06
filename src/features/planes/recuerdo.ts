// Lo que la persona escribió la última vez para pagar (solo en este dispositivo, nunca en el servidor): así
// «Renovar» son dos toques. Nunca se guarda el código de Yape ni nada de la tarjeta.

const K = 'rockie.pago'

export type Recuerdo = { metodo?: 'yape' | 'tarjeta'; correo?: string; celular?: string; nombre?: string; ciudad?: string }

export function leerRecuerdo(): Recuerdo {
  try {
    const r = JSON.parse(localStorage.getItem(K) || '{}') as Recuerdo
    return r && typeof r === 'object' ? r : {}
  } catch {
    return {}
  }
}

export function guardarRecuerdo(r: Recuerdo) {
  try {
    localStorage.setItem(K, JSON.stringify({ ...leerRecuerdo(), ...r }))
  } catch {
    /* sin almacenamiento (modo privado): no pasa nada */
  }
}
