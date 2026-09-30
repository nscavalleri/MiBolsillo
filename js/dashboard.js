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
// y ahí el pivot se sigue calculando EXACTO como siempre (ver
// state.snapshot en state.js) — saldo acumulado de TODOS los movimientos
// sin importar la fecha, convertido con el tipo de cambio más reciente
// que haya cargado para cada moneda. Elegir otro mes en el selector arma
// en cambio una foto histórica: solo entran los movimientos con fecha
// hasta el fin de ese mes (state.snapshot.mes se compara como texto
// "YYYY-MM", que ordena igual que una fecha), convertidos con el tipo de
// cambio de ESE mes puntual (convertirAEuros, la misma función que ya usan
// Evolución/Distribución/Flujo de caja) en vez del más reciente. Los dos
// modos conviven en las mismas funciones de más abajo (construirPivot,
// totalEnEuros) en vez de duplicarlas, recibiendo el mes de corte (o nada,
// para el modo de siempre) como parámetro.
//
// saldoEnEurosPorOrigen() —la usa Gastos > Asignación— se sigue llamando
// SIN mes: a Asignación le interesa la plata que hay HOY para repartir
// entre las reservas, nunca una foto vieja, así que no se le suma el
// selector.
//
// Si a alguna moneda con saldo le falta el tipo de cambio que corresponda
// (el más reciente, o el de ese mes puntual, según el modo), esa
// conversión queda marcada con ⚠ en vez de contarse como si fuera cero.
//
// Oro y Pesos se convierten distinto que el resto (encadenado a través de
// Dólares, ver el comentario grande de convertirAEurosMasReciente más
// abajo, y el de convertirAEuros en distribucion.js para el detalle
// completo).

import { state } from './state.js';
import { nombreOrigen, nombreMoneda } from './lookups.js';
import { renderCheckboxesTabla } from './check-list.js';
import {
  celdaImporte, convertirAEuros, formatoMesLegible, mesActualTexto,
  poblarSelectMes, poblarSelectAnio, leerMesSeleccionado, escribirMesSeleccionado,
  esOro, esPesos, idMonedaDolares,
} from './distribucion.js';

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
//
// OJO con Oro: igual que tasaAEuros en distribucion.js, esta función es un
// lector genérico de tipos_cambio — para Oro devuelve dólares por unidad,
// no euros. No se la use suelta para Oro sin el segundo paso (ver
// convertirAEurosMasReciente más abajo).
function tasaMasRecienteAEuros(monedaId) {
  const filas = state.tiposCambio.filter(
    tc => String(tc.moneda_id) === String(monedaId) && tc.valor_eur != null
  );
  if (filas.length === 0) return null;
  const masReciente = filas.reduce((a, b) => (b.mes > a.mes ? b : a));
  return Number(masReciente.valor_eur);
}

// CASO ESPECIAL Oro: mismo motivo y misma cuenta que convertirAEuros de
// distribucion.js (ver el comentario grande ahí) pero con la tasa MÁS
// RECIENTE de cada moneda en vez de la de un mes puntual — es lo que le
// corresponde a este modo "tasa más reciente" (Snapshot en el mes actual,
// y Asignación). esOro/idMonedaDolares se importan de distribucion.js para
// no duplicar el criterio de "qué es Oro"/"cuál es Dólares".
// CASO ESPECIAL Pesos: mismo motivo y misma cuenta que convertirAEuros de
// distribucion.js (ver el comentario grande ahí) pero con la tasa MÁS
// RECIENTE de cada moneda, igual que Oro más abajo.
function convertirAEurosMasReciente(monedaId, monto) {
  if (esEuros(monedaId)) return { valor: monto, ok: true };
  if (esOro(monedaId)) {
    const tasaOroAUsd = tasaMasRecienteAEuros(monedaId);
    const dolaresId = idMonedaDolares();
    const tasaUsdAEur = dolaresId != null ? tasaMasRecienteAEuros(dolaresId) : null;
    if (tasaOroAUsd == null || tasaUsdAEur == null) return { valor: 0, ok: false };
    return { valor: monto * tasaOroAUsd * tasaUsdAEur, ok: true };
  }
  if (esPesos(monedaId)) {
    const tasaPesosPorUsd = tasaMasRecienteAEuros(monedaId);
    const dolaresId = idMonedaDolares();
    const tasaUsdAEur = dolaresId != null ? tasaMasRecienteAEuros(dolaresId) : null;
    if (!tasaPesosPorUsd || tasaUsdAEur == null) return { valor: 0, ok: false };
    return { valor: (monto / tasaPesosPorUsd) * tasaUsdAEur, ok: true };
  }
  const tasa = tasaMasRecienteAEuros(monedaId);
  if (tasa == null) return { valor: 0, ok: false };
  return { valor: monto * tasa, ok: true };
}

// Suma, para un conjunto de totales por moneda (una fila del pivot, o el
// total general), el equivalente en euros de cada uno. incompleto=true si
// alguna moneda con saldo distinto de cero todavía no tiene tipo de
// cambio cargado (esa parte no se cuenta ni de más ni de menos).
// "convertir" es la función de conversión a usar (una de las dos de más
// abajo, según el modo — ver el comentario de arriba del archivo): así
// esta función no necesita saber si el modo es "actual" o "mes puntual".
function totalEnEuros(totalesPorMoneda, listaMonedaIds, convertir) {
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
function construirPivot(mesCorte) {
  const conceptoIdsIncluidos = new Set(
    state.conceptos.filter(c => c.incluir_en_snapshot !== false).map(c => String(c.id))
  );

  const pivot = {};
  const monedaIdsUsadas = new Set();
  state.movimientos.forEach(m => {
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
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
      if (o.activo && !pivot[o.id]) pivot[o.id] = {};
    });
  }

  const listaMonedaIds = Array.from(monedaIdsUsadas).sort((a, b) => nombreMoneda(a).localeCompare(nombreMoneda(b)));
  const listaOrigenIds = Object.keys(pivot).sort((a, b) => nombreOrigen(a).localeCompare(nombreOrigen(b)));
  return { pivot, listaMonedaIds, listaOrigenIds };
}

// La plata que hay HOY en cada cuenta, ya pasada a euros: es lo que
// Asignación reparte entre las reservas. A propósito, SIEMPRE sin mesCorte
// y con la tasa más reciente — el selector de mes de Snapshot (más abajo)
// no le afecta para nada, Asignación siempre necesita la plata real de
// ahora, nunca una foto vieja.
export function saldoEnEurosPorOrigen() {
  const { pivot, listaMonedaIds, listaOrigenIds } = construirPivot();
  let huboIncompleto = false;
  const filas = listaOrigenIds.map(origenId => {
    const { total, incompleto } = totalEnEuros(pivot[origenId], listaMonedaIds, convertirAEurosMasReciente);
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

  const esMesActual = state.snapshot.mes === mesActualTexto();
  const mesCorte = esMesActual ? null : state.snapshot.mes;
  const convertir = esMesActual
    ? convertirAEurosMasReciente
    : (monedaId, monto) => convertirAEuros(state.snapshot.mes, monedaId, monto);

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
        ? "No hay movimientos para los conceptos seleccionados."
        : "No hay movimientos hasta ese mes para los conceptos seleccionados.";
    tabla.innerHTML = `<tr><td class="empty">${mensaje}</td></tr>`;
    if (nota) nota.style.display = "none";
    return;
  }

  const tituloIncompleto = esMesActual
    ? "Falta cargar el tipo de cambio de alguna moneda en Configuración > Tipo de cambio (se usa el más reciente que tengas cargado para cada una)"
    : `Falta cargar el tipo de cambio de alguna moneda para ${formatoMesLegible(state.snapshot.mes)} en Configuración > Tipo de cambio`;

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
    const textoNota = esMesActual
      ? "⚠ = todavía no cargaste el tipo de cambio de alguna moneda en Configuración &gt; Tipo de cambio, ese Total (€) está incompleto. La conversión usa el tipo de cambio más reciente que tengas cargado para cada moneda."
      : `⚠ = falta cargar el tipo de cambio de alguna moneda para ${formatoMesLegible(state.snapshot.mes)} en Configuración &gt; Tipo de cambio, así que ese total está incompleto.`;
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
