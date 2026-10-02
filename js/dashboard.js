// Dashboard > Snapshot: tabla pivot de saldo por Origen x Moneda.
// Los movimientos guardan origen_id / moneda_id (claves foráneas); acá se
// agrupa por esos ids y se resuelve el nombre a mostrar con lookups.js.
//
// "Conceptos a incluir" filtra qué conceptos entran en esta suma. Usa su
// propia columna en la base (conceptos.incluir_en_snapshot, separada de
// incluir_en_distribucion que usa Distribución) para poder tener acá una
// selección distinta de la de Distribución sin que se pisen entre sí.
//
// Selector de Mes (a pedido de Nadia): por defecto muestra el mes actual,
// y ahí el pivot sigue mostrando el saldo de TODOS los movimientos sin
// importar la fecha (a diferencia de elegir cualquier otro mes, que arma
// una foto histórica y solo entran los movimientos con fecha hasta el fin
// de ese mes — state.snapshot.mes se compara como texto "YYYY-MM", que
// ordena igual que una fecha). Los dos modos conviven en construirPivot()
// de más abajo, recibiendo el mes de corte (o nada, para "todos los
// movimientos") como parámetro.
//
// La conversión a euros, en cambio, usa SIEMPRE el tipo de cambio del mes
// elegido en el combo — sea el actual o cualquier otro —, con
// convertirAEuros (la misma función que ya usan Evolución/Distribución/
// Flujo de caja). Antes (entrada 29 del changelog) el mes actual era una
// excepción y usaba "el tipo de cambio más reciente que tengas cargado"
// para evitar quedar en ⚠ apenas empezaba el mes sin haberlo cargado
// todavía. Se sacó esa excepción (entrada 32, a pedido de Nadia) porque
// si ya se había cargado por adelantado el tipo de cambio de un mes
// FUTURO, "más reciente" terminaba usando ese mes futuro en vez del que
// decía el combo — más confuso que mostrar ⚠. Ahora, si el mes elegido
// (sea el actual o no) todavía no tiene tipo de cambio cargado, se marca
// ⚠ igual que en cualquier otra pantalla de la app.
//
// saldoEnEurosPorOrigen() —la usa Gastos > Asignación— también convierte
// con el tipo de cambio del MES ACTUAL (el real, de hoy), igual que
// Snapshot: hasta la entrada 33 usaba "la tasa más reciente que tengas
// cargada", pero Nadia reportó que eso se rompía cuando cargaba un gasto
// a futuro — se le armaba una fila de tipo de cambio para ESE mes futuro
// en Configuración > Tipo de cambio, y "más reciente" terminaba usando la
// del mes que todavía no llegó en vez de la del mes en curso. Se sacó esa
// función (convertirAEurosMasReciente) del todo: ya no la usa nadie. Se
// llama SIN mesCorte a propósito (entran todos los movimientos, sin
// importar la fecha, incluidos los que Nadia carga a futuro): eso no
// cambió, solo cambió CON QUÉ tipo de cambio se convierten.
//
// Oro y Pesos se convierten distinto que el resto (encadenado a través de
// Dólares) — ver el comentario grande de convertirAEuros en
// distribucion.js, que es la única función de conversión que queda en la
// app (acá y en Snapshot).

import { state } from './state.js';
import { nombreOrigen, nombreMoneda } from './lookups.js';
import { renderCheckboxesTabla } from './check-list.js';
import {
  celdaImporte, convertirAEuros, formatoMesLegible, mesActualTexto,
  poblarSelectMes, poblarSelectAnio, leerMesSeleccionado, escribirMesSeleccionado,
} from './distribucion.js';

function renderCheckboxesConceptosSnapshot() {
  renderCheckboxesTabla("conceptos", state.conceptos, "snapshotConceptosCheckboxes", "Todavía no hay conceptos cargados.", "incluir_en_snapshot", true);
}

// "Orígenes a incluir" (a pedido de Nadia): misma mecánica que "Conceptos a
// incluir" de arriba, pero sobre state.origenes y con su propia columna en
// la base (origenes.incluir_en_snapshot) — mismo nombre de columna que la
// de conceptos, pero en otra tabla, así que no se pisan entre sí.
function renderCheckboxesOrigenesSnapshot() {
  renderCheckboxesTabla("origenes", state.origenes, "snapshotOrigenesCheckboxes", "Todavía no hay orígenes cargados.", "incluir_en_snapshot", true);
}

// Suma, para un conjunto de totales por moneda (una fila del pivot, o el
// total general), el equivalente en euros de cada uno. incompleto=true si
// alguna moneda con saldo distinto de cero todavía no tiene tipo de
// cambio cargado (esa parte no se cuenta ni de más ni de menos).
// "convertir" es la función de conversión a usar (una de las dos de más
// abajo, según el modo — ver el comentario de arriba del archivo): así
// esta función no necesita saber si el modo es "actual" o "mes puntual".
// Se exporta para que js/backup.js arme la misma columna "Total (€)" del
// Snapshot al generar el Excel de backup, en vez de reimplementar la suma.
export function totalEnEuros(totalesPorMoneda, listaMonedaIds, convertir) {
  let total = 0;
  let incompleto = false;
  listaMonedaIds.forEach(monedaId => {
    const v = totalesPorMoneda[monedaId] || 0;
    if (!v) return;
    const { valor, ok } = convertir(monedaId, v);
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
//
// "mesCorte" es opcional (Asignación nunca lo manda, ver el comentario de
// arriba del archivo): sin él, entran todos los movimientos sin importar
// la fecha (el comportamiento de siempre). Con un "YYYY-MM", solo entran
// los que tengan fecha hasta el FIN de ese mes — la comparación es de
// texto entre dos "YYYY-MM" (el de la fecha del movimiento, recortada a
// sus primeros 7 caracteres, contra mesCorte), que ordena igual que
// comparar fechas de verdad.
// Se exporta para que js/backup.js arme la hoja "Snapshot" del Excel de
// backup con el mismo pivot (para el mes que haya elegido ahí), en vez de
// reimplementar el recorrido de movimientos.
export function construirPivot(mesCorte) {
  const conceptoIdsIncluidos = new Set(
    state.conceptos.filter(c => c.incluir_en_snapshot !== false).map(c => String(c.id))
  );
  // "Orígenes a incluir": misma mecánica que "Conceptos a incluir" de
  // arriba, pero filtrando por origen_id en vez de concepto_id (ver
  // renderCheckboxesOrigenesSnapshot()). Como esta función la reusan
  // saldoEnEurosPorOrigen() (Asignación) y js/backup.js (hoja Snapshot del
  // backup), destildar un origen acá también lo saca de esas dos — igual
  // que ya pasa hoy con "Conceptos a incluir".
  const origenIdsIncluidos = new Set(
    state.origenes.filter(o => o.incluir_en_snapshot !== false).map(o => String(o.id))
  );

  const pivot = {};
  const monedaIdsUsadas = new Set();
  state.movimientos.forEach(m => {
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    if (!origenIdsIncluidos.has(String(m.origen_id))) return;
    if (mesCorte && String(m.fecha).slice(0, 7) > mesCorte) return;
    const signo = m.tipo === "ingreso" ? 1 : -1;
    const val = signo * Number(m.monto);
    if (!pivot[m.origen_id]) pivot[m.origen_id] = {};
    pivot[m.origen_id][m.moneda_id] = (pivot[m.origen_id][m.moneda_id] || 0) + val;
    monedaIdsUsadas.add(m.moneda_id);
  });

  // Una cuenta activa que todavía no tiene ningún movimiento igual merece su
  // fila. Si no, una cuenta recién creada no aparece en ninguna pantalla
  // hasta que le cargues el primer movimiento: no la ves en el Snapshot, no
  // podés repartirla en Asignación y en Conciliación no podés ni tildarla ni
  // usar el "Δ" para cargarle el saldo real de arranque.
  //
  // Se siembran DESPUÉS de recorrer los movimientos y solo si quedó alguna
  // moneda en juego, a propósito: cuando no hay ningún movimiento cargado (o
  // se destildaron todos los conceptos) las pantallas siguen mostrando su
  // mensaje de "todavía no hay nada" en vez de una grilla entera de ceros.
  //
  // Ojo: al recorrer los movimientos NO se filtra por "activo". Una cuenta
  // desactivada que tuvo plata sigue apareciendo, que es lo que corresponde
  // (esa plata existió); lo que se agrega acá son solo las activas que
  // todavía no tienen nada.
  if (monedaIdsUsadas.size > 0) {
    state.origenes.forEach(o => {
      if (o.activo && origenIdsIncluidos.has(String(o.id)) && !pivot[o.id]) pivot[o.id] = {};
    });
  }

  const listaMonedaIds = Array.from(monedaIdsUsadas).sort((a, b) => nombreMoneda(a).localeCompare(nombreMoneda(b)));
  const listaOrigenIds = Object.keys(pivot).sort((a, b) => nombreOrigen(a).localeCompare(nombreOrigen(b)));
  return { pivot, listaMonedaIds, listaOrigenIds };
}

// La plata que hay HOY en cada cuenta, ya pasada a euros: es lo que
// Asignación reparte entre las reservas. Se llama SIEMPRE sin mesCorte
// (entran todos los movimientos, sin importar la fecha, incluidos los que
// Nadia carga a futuro) y convierte con el tipo de cambio del MES ACTUAL
// (mesActualTexto(), el real, de hoy) — nunca con el de un mes futuro. Hasta
// la entrada 33 usaba "la tasa más reciente que tengas cargada", pero eso se
// rompía cuando Nadia cargaba un gasto a futuro: se le armaba una fila de
// tipo de cambio para ese mes futuro en Configuración > Tipo de cambio, y
// "más reciente" terminaba usando esa (la del mes que todavía no llegó) en
// vez de la del mes en curso.
export function saldoEnEurosPorOrigen() {
  const { pivot, listaMonedaIds, listaOrigenIds } = construirPivot();
  const mesActual = mesActualTexto();
  let huboIncompleto = false;
  const filas = listaOrigenIds.map(origenId => {
    const { total, incompleto } = totalEnEuros(
      pivot[origenId], listaMonedaIds,
      (monedaId, monto) => convertirAEuros(mesActual, monedaId, monto)
    );
    if (incompleto) huboIncompleto = true;
    return { origenId, total, incompleto };
  });
  return { filas, incompleto: huboIncompleto };
}

export function renderPivot() {
  if (!state.snapshot.mes) state.snapshot.mes = mesActualTexto();
  // Mismo motivo que en distribucion.js/flujo-caja.js: un <select> recién
  // poblado no queda "vacío" solo (el navegador hace propia su primera
  // opción), así que se escribe el valor desde el estado en cada render.
  escribirMesSeleccionado("snapshot", state.snapshot.mes);
  renderCheckboxesConceptosSnapshot();
  renderCheckboxesOrigenesSnapshot();

  const esMesActual = state.snapshot.mes === mesActualTexto();
  // mesCorte solo afecta qué MOVIMIENTOS entran (ver el comentario de
  // arriba del archivo): en el mes actual entran todos, sin importar la
  // fecha. La conversión a euros ("convertir") es la misma en los dos
  // casos: siempre el tipo de cambio del mes elegido en el combo, nunca
  // "el más reciente" — esa distinción quedó SOLO para Asignación
  // (saldoEnEurosPorOrigen, más arriba).
  const mesCorte = esMesActual ? null : state.snapshot.mes;
  const convertir = (monedaId, monto) => convertirAEuros(state.snapshot.mes, monedaId, monto);

  const { pivot, listaMonedaIds, listaOrigenIds } = construirPivot(mesCorte);
  const tabla = document.getElementById("pivotTable");
  const nota = document.getElementById("pivotNota");
  const titulo = document.getElementById("pivotTitulo");
  if (titulo) {
    titulo.textContent = esMesActual
      ? "Resumen por cuenta y moneda"
      : `Resumen por cuenta y moneda — ${formatoMesLegible(state.snapshot.mes)}`;
  }

  if (listaMonedaIds.length === 0) {
    const mensaje = state.movimientos.length === 0
      ? "Todavía no hay movimientos cargados."
      : esMesActual
        ? "No hay movimientos para los conceptos y orígenes seleccionados."
        : "No hay movimientos hasta ese mes para los conceptos y orígenes seleccionados.";
    tabla.innerHTML = `<tr><td class="empty">${mensaje}</td></tr>`;
    if (nota) nota.style.display = "none";
    return;
  }

  // Mismo texto en los dos modos ahora (ver el comentario de arriba de
  // "convertir"): la conversión siempre usa el tipo de cambio del mes
  // elegido, así que el aviso de ⚠ también es siempre el mismo.
  const tituloIncompleto = `Falta cargar el tipo de cambio de alguna moneda para ${formatoMesLegible(state.snapshot.mes)} en Configuración > Tipo de cambio`;

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
    const { total: totalFila, incompleto } = totalEnEuros(pivot[origenId], listaMonedaIds, convertir);
    if (incompleto) huboIncompleto = true;
    html += celdaImporte(totalFila, false, incompleto, null, tituloIncompleto);
    html += "</tr>";
  });

  const { total: totalGeneral, incompleto: totalGeneralIncompleto } = totalEnEuros(totales, listaMonedaIds, convertir);
  if (totalGeneralIncompleto) huboIncompleto = true;
  html += `<tr class="total-row"><td>Total</td>` +
    listaMonedaIds.map(id => `<td>${(totales[id] || 0).toFixed(2)}</td>`).join("") +
    celdaImporte(totalGeneral, false, totalGeneralIncompleto, null, tituloIncompleto) + "</tr>";
  tabla.innerHTML = html;

  if (nota) {
    // Mismo motivo que tituloIncompleto: ya no depende del modo.
    const textoNota = `⚠ = falta cargar el tipo de cambio de alguna moneda para ${formatoMesLegible(state.snapshot.mes)} en Configuración &gt; Tipo de cambio, así que ese total está incompleto.`;
    nota.innerHTML = textoNota;
    nota.style.display = huboIncompleto ? "block" : "none";
  }
}

export function setupPivot() {
  poblarSelectMes("snapshot");
  poblarSelectAnio("snapshot");
  ["MesNombre", "Anio"].forEach(sufijo => {
    document.getElementById("snapshot" + sufijo).addEventListener("change", () => {
      state.snapshot.mes = leerMesSeleccionado("snapshot");
      renderPivot();
    });
  });
}
