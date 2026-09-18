// Dashboard > Snapshot: tabla pivot de saldo por Origen x Moneda.

import { state } from './state.js';

export function renderPivot() {
  const pivot = {};
  const monedasUsadas = new Set();
  state.movimientos.forEach(m => {
    const signo = m.tipo === "ingreso" ? 1 : -1;
    const val = signo * Number(m.monto);
    if (!pivot[m.origen]) pivot[m.origen] = {};
    pivot[m.origen][m.moneda] = (pivot[m.origen][m.moneda] || 0) + val;
    monedasUsadas.add(m.moneda);
  });
  const listaMonedas = Array.from(monedasUsadas).sort();
  const tabla = document.getElementById("pivotTable");

  if (listaMonedas.length === 0) {
    tabla.innerHTML = `<tr><td class="empty">Todavía no hay movimientos cargados.</td></tr>`;
    return;
  }

  let html = "<tr><th>Origen</th>" + listaMonedas.map(mo => `<th>${mo}</th>`).join("") + "</tr>";
  const totales = {};
  Object.keys(pivot).sort().forEach(origen => {
    html += `<tr><td>${origen}</td>`;
    listaMonedas.forEach(mo => {
      const v = pivot[origen][mo] || 0;
      totales[mo] = (totales[mo] || 0) + v;
      html += `<td>${v ? v.toFixed(2) : "–"}</td>`;
    });
    html += "</tr>";
  });
  html += `<tr class="total-row"><td>Total</td>` +
    listaMonedas.map(mo => `<td>${(totales[mo] || 0).toFixed(2)}</td>`).join("") + "</tr>";
  tabla.innerHTML = html;
}
