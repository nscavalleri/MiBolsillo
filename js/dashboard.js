// Dashboard > Snapshot: tabla pivot de saldo por Origen x Moneda.
// Los movimientos guardan origen_id / moneda_id (claves foráneas); acá se
// agrupa por esos ids y se resuelve el nombre a mostrar con lookups.js.
//
// "Conceptos a incluir" filtra qué conceptos entran en esta suma. Usa su
// propia columna en la base (conceptos.incluir_en_snapshot, separada de
// incluir_en_distribucion que usa Distribución) para poder tener acá una
// selección distinta de la de Distribución sin que se pisen entre sí.

import { state } from './state.js';
import { nombreOrigen, nombreMoneda } from './lookups.js';
import { renderCheckboxesTabla } from './check-list.js';

function renderCheckboxesConceptosSnapshot() {
  renderCheckboxesTabla("conceptos", state.conceptos, "snapshotConceptosCheckboxes", "Todavía no hay conceptos cargados.", "incluir_en_snapshot", true);
}

export function renderPivot() {
  renderCheckboxesConceptosSnapshot();

  const conceptoIdsIncluidos = new Set(
    state.conceptos.filter(c => c.incluir_en_snapshot !== false).map(c => String(c.id))
  );

  const pivot = {};
  const monedaIdsUsadas = new Set();
  state.movimientos.forEach(m => {
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    const signo = m.tipo === "ingreso" ? 1 : -1;
    const val = signo * Number(m.monto);
    if (!pivot[m.origen_id]) pivot[m.origen_id] = {};
    pivot[m.origen_id][m.moneda_id] = (pivot[m.origen_id][m.moneda_id] || 0) + val;
    monedaIdsUsadas.add(m.moneda_id);
  });
  const listaMonedaIds = Array.from(monedaIdsUsadas).sort((a, b) => nombreMoneda(a).localeCompare(nombreMoneda(b)));
  const tabla = document.getElementById("pivotTable");

  if (listaMonedaIds.length === 0) {
    const mensaje = state.movimientos.length === 0
      ? "Todavía no hay movimientos cargados."
      : "No hay movimientos para los conceptos seleccionados.";
    tabla.innerHTML = `<tr><td class="empty">${mensaje}</td></tr>`;
    return;
  }

  let html = "<tr><th>Origen</th>" + listaMonedaIds.map(id => `<th>${nombreMoneda(id)}</th>`).join("") + "</tr>";
  const totales = {};
  const listaOrigenIds = Object.keys(pivot).sort((a, b) => nombreOrigen(a).localeCompare(nombreOrigen(b)));
  listaOrigenIds.forEach(origenId => {
    html += `<tr><td>${nombreOrigen(origenId)}</td>`;
    listaMonedaIds.forEach(monedaId => {
      const v = pivot[origenId][monedaId] || 0;
      totales[monedaId] = (totales[monedaId] || 0) + v;
      html += `<td>${v ? v.toFixed(2) : "–"}</td>`;
    });
    html += "</tr>";
  });
  html += `<tr class="total-row"><td>Total</td>` +
    listaMonedaIds.map(id => `<td>${(totales[id] || 0).toFixed(2)}</td>`).join("") + "</tr>";
  tabla.innerHTML = html;
}
