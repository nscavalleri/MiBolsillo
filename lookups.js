// Funciones auxiliares para resolver el nombre de un origen, moneda o
// concepto a partir de su id (movimientos guarda origen_id / moneda_id /
// concepto_id como claves foráneas hacia origenes, monedas y conceptos,
// en vez de guardar el texto suelto).

import { state } from './state.js';

export function nombreOrigen(id) {
  const o = state.origenes.find(x => String(x.id) === String(id));
  return o ? o.nombre : "(origen eliminado)";
}

export function nombreMoneda(id) {
  const m = state.monedas.find(x => String(x.id) === String(id));
  return m ? m.nombre : "(moneda eliminada)";
}

export function nombreConcepto(id) {
  const c = state.conceptos.find(x => String(x.id) === String(id));
  return c ? c.nombre : "(concepto eliminado)";
}
