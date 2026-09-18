// Funciones auxiliares para resolver el nombre de un origen o una moneda
// a partir de su id (ahora que movimientos, conciliacion_checks y
// conciliaciones guardan origen_id / moneda_id como claves foráneas hacia
// las tablas origenes y monedas, en vez de guardar el texto suelto).

import { state } from './state.js';

export function nombreOrigen(id) {
  const o = state.origenes.find(x => String(x.id) === String(id));
  return o ? o.nombre : "(origen eliminado)";
}

export function nombreMoneda(id) {
  const m = state.monedas.find(x => String(x.id) === String(id));
  return m ? m.nombre : "(moneda eliminada)";
}
