// Preferencias de la voz de Rockie (en este dispositivo). Las usan la hoja de voz
// (components/RockieVoz.jsx) y «Voz de Rockie» en Tu Rockie.
//  - manosLibres: Rockie contesta en voz alta y vuelve a escuchar.
//  - autoApp: si lo que dijiste es solo de la Agenda, el Equipo o el Cuaderno, te lleva sin preguntar.
const CLAVES = { manosLibres: 'bplus.voz.manosLibres', autoApp: 'bplus.voz.autoApp' }
const POR_DEFECTO = { manosLibres: false, autoApp: true }

export function leerVoz(clave) {
  try {
    const v = localStorage.getItem(CLAVES[clave])
    return v === null ? POR_DEFECTO[clave] : v === '1'
  } catch {
    return POR_DEFECTO[clave]
  }
}

export function guardarVoz(clave, valor) {
  try {
    localStorage.setItem(CLAVES[clave], valor ? '1' : '0')
  } catch {
    /* sin almacenamiento */
  }
}
