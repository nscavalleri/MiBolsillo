// Dashboard > Snapshot: tabla pivot de saldo por Origen x Moneda.
// Los movimientos guardan origen_id / moneda_id (claves foráneas); acá se
// agrupa por esos ids y se resuelve el nombre a mostrar con lookups.js.
//
// "Conceptos a incluir" filtra qué conceptos entran en esta suma. Usa su
// propia columna en la base (conceptos.incluir_en_snapshot, separada de
// incluir_en_distribucion que usa Distribución) para poder tener acá una
// selección distinta de la de Distribución sin que se pisen entre sí.
//
// "Total (€)": a diferencia de Distribución (que convierte con el tipo de
// cambio de un mes puntual), acá el pivot es un saldo acumulado de
// siempre, sin un mes al que atarse. Por eso se usa, para cada moneda, el
// tipo de cambio más reciente que haya cargado en Configuración > Tipo de
// cambio (el último mes con un valor cargado), como mejor aproximación
// disponible al valor actual. Si a alguna moneda todavía no le cargó
// ningún tipo de cambio, esa conversión queda marcada con ⚠ en vez de
// contarse como si fuera cero.

import { state } from './state.js';
import { nombreOrigen, nombreMoneda } from './lookups.js';
import { renderCheckboxesTabla } from './check-list.js';
import { celdaImporte } from './distribucion.js';

function renderCheckboxesConceptosSnapshot() {
  renderCheckboxesTabla("conceptos", state.conceptos, "snapshotConceptosCheckboxes", "Todavía no hay conceptos cargados.", "incluir_en_snapshot", true);
}

// true si esa moneda es "Euros" (mismo criterio que distribucion.js /
// tipo-cambio.js): convertir euros a euros es directo.
function esEuros(monedaId) {
  const m = state.monedas.find(x => String(x.id) === String(monedaId));
  return !!m && m.nombre.trim().toLowerCase() === "euros";
}

// El tipo de cambio a euros más reciente cargado para una moneda (el de
// mayor "mes" entre los que tiene esa moneda en tipos_cambio). null si
// todavía no se cargó ninguno.
function tasaMasRecienteAEuros(monedaId) {
  const filas = state.tiposCambio.filter(
    tc => String(tc.moneda_id) === String(monedaId) && tc.valor_eur != null
  );
  if (filas.length === 0) return null;
  const masReciente = filas.reduce((a, b) => (b.mes > a.mes ? b : a));
  return Number(masReciente.valor_eur);
}

function convertirAEurosMasReciente(monedaId, monto) {
  if (esEuros(monedaId)) return { valor: monto, ok: true };
  const tasa = tasaMasRecienteAEuros(monedaId);
  if (tasa == null) return { valor: 0, ok: false };
  return { valor: monto * tasa, ok: true };
}

// Suma, para un conjunto de totales por moneda (una fila del pivot, o el
// total general), el equivalente en euros de cada uno. incompleto=true si
// alguna moneda con saldo distinto de cero todavía no tiene tipo de
// cambio cargado (esa parte no se cuenta ni de más ni de menos).
function totalEnEuros(totalesPorMoneda, listaMonedaIds) {
  let total = 0;
  let incompleto = false;
  listaMonedaIds.forEach(monedaId => {
    const v = totalesPorMoneda[monedaId] || 0;
    if (!v) return;
    const { valor, ok } = convertirAEurosMasReciente(monedaId, v);
    total += valor;
    if (!ok) incompleto = true;
  });
  return { total, incompleto };
}

// Arma el saldo por Origen x Moneda que muestra el Snapshot: recorre los
// movimientos de los conceptos tildados en "Conceptos a incluir" y suma los
// ingresos y resta los egresos. Se separó del render para que Gastos >
// Asignación pueda reusar exactamente el mismo cálculo (ver
// saldoEnEurosPorOrigen más abajo) en vez de tener su propia copia que
// después se desincronice.
function construirPivot() {
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
  const listaOrigenIds = Object.keys(pivot).sort((a, b) => nombreOrigen(a).localeCompare(nombreOrigen(b)));
  return { pivot, listaMonedaIds, listaOrigenIds };
}

// La plata que hay hoy en cada cuenta, ya pasada a euros: es exactamente la
// columna "Total (€)" del Snapshot, que es lo que Asignación reparte entre
// las reservas. "incompleto" en una fila (y en el total) significa que a
// alguna moneda de esa cuenta todavía no le cargaste el tipo de cambio, así
// que ese total está incompleto (esa parte no se cuenta como cero).
export function saldoEnEurosPorOrigen() {
  const { pivot, listaMonedaIds, listaOrigenIds } = construirPivot();
  let huboIncompleto = false;
  const filas = listaOrigenIds.map(origenId => {
    const { total, incompleto } = totalEnEuros(pivot[origenId], listaMonedaIds);
    if (incompleto) huboIncompleto = true;
    return { origenId, total, incompleto };
  });
  return { filas, incompleto: huboIncompleto };
}

export function renderPivot() {
  renderCheckboxesConceptosSnapshot();

  const { pivot, listaMonedaIds, listaOrigenIds } = construirPivot();
  const tabla = document.getElementById("pivotTable");
  const nota = document.getElementById("pivotNota");

  if (listaMonedaIds.length === 0) {
    const mensaje = state.movimientos.length === 0
      ? "Todavía no hay movimientos cargados."
      : "No hay movimientos para los conceptos seleccionados.";
    tabla.innerHTML = `<tr><td class="empty">${mensaje}</td></tr>`;
    if (nota) nota.style.display = "none";
    return;
  }

  const tituloIncompleto = "Falta cargar el tipo de cambio de alguna moneda en Configuración > Tipo de cambio (se usa el más reciente que tengas cargado para cada una)";

  let html = "<tr><th>Origen</th>" + listaMonedaIds.map(id => `<th>${nombreMoneda(id)}</th>`).join("") + "<th>Total (€)</th></tr>";
  const totales = {};
  let huboIncompleto = false;
  listaOrigenIds.forEach(origenId => {
    html += `<tr><td>${nombreOrigen(origenId)}</td>`;
    listaMonedaIds.forEach(monedaId => {
      const v = pivot[origenId][monedaId] || 0;
      totales[monedaId] = (totales[monedaId] || 0) + v;
      html += `<td>${v ? v.toFixed(2) : "–"}</td>`;
    });
    const { total: totalFila, incompleto } = totalEnEuros(pivot[origenId], listaMonedaIds);
    if (incompleto) huboIncompleto = true;
    html += celdaImporte(totalFila, false, incompleto, null, tituloIncompleto);
    html += "</tr>";
  });

  const { total: totalGeneral, incompleto: totalGeneralIncompleto } = totalEnEuros(totales, listaMonedaIds);
  if (totalGeneralIncompleto) huboIncompleto = true;
  html += `<tr class="total-row"><td>Total</td>` +
    listaMonedaIds.map(id => `<td>${(totales[id] || 0).toFixed(2)}</td>`).join("") +
    celdaImporte(totalGeneral, false, totalGeneralIncompleto, null, tituloIncompleto) + "</tr>";
  tabla.innerHTML = html;

  if (nota) {
    nota.style.display = huboIncompleto ? "block" : "none";
  }
}
