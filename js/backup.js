// Configuración > Backup: tildar qué reportes exportar a Excel (un archivo
// .xlsx por tilde) y generarlos con el botón "Generar Excel", a pedido de
// Nadia. No usa Supabase para nada propio: todo sale de lo que ya está
// cargado en memoria (state.js), que es lo mismo que ya ve en cada pantalla
// — así que "Backup" exporta una FOTO de lo que hay ahora mismo, no dispara
// ninguna consulta nueva.
//
// Reglas, tal como las pidió Nadia (no cambiar el default de ningún tilde
// sin volver a preguntarle):
//   Tildados por defecto: Snapshot, Evolución patrimonial, Distribución
//     histórica, Flujo de caja histórico, Movimientos, Asignación,
//     Conciliación.
//   Destildados por defecto: Distribución mensual, Flujo de caja mensual,
//     Configuración.
// El checkbox "Todo" de arriba tilda o destilda los diez de un tirón;
// también se actualiza solo (tildado SOLO cuando los diez están tildados,
// igual criterio que el "Todos" de check-list.js) cada vez que se toca
// cualquiera de los diez a mano.
//
// Movimientos tiene además su PROPIO checkbox "Todo" (a pedido de Nadia):
// tildarlo deshabilita el rango Desde/Hasta (que queda atenuado, mismo
// criterio que check-grid-deshabilitado) y hace que se exporten TODOS los
// movimientos cargados, sin filtrar por fecha.
//
// Nada de esta pantalla se guarda en Supabase (ni los tildes, ni el mes del
// Snapshot, ni el rango de Movimientos): son elecciones de "qué exportar
// ahora", no una preferencia de la app — por eso no entran en
// configuracion_general pese a la regla general de "toda preferencia nueva
// va ahí" (esa regla es para preferencias que tiene sentido recordar entre
// sesiones; esto no lo es). Los selectores de mes SÍ se recuerdan mientras
// se siga en la misma sesión del navegador (ver state.backup en state.js),
// igual criterio que distribucion.ordenHistorico.
//
// Cada reporte reusa el cálculo que ya tiene su propia pantalla (nunca lo
// duplica, a propósito — es la misma regla que ya sigue el resto de la
// app, ver por ejemplo saldoEnEurosPorOrigen en dashboard.js): Snapshot
// reusa construirPivot/totalEnEuros de dashboard.js, Evolución patrimonial
// reusa calcularEvolucion() de evolucion.js (ya era pura, sin cambios),
// Distribución mensual/histórica reusan varias piezas de distribucion.js,
// Flujo de caja mensual/histórico reusan datosFlujoCajaMensual/
// datosFlujoCajaHistorico de flujo-caja.js (escritas para esto), Asignación
// reusa calcularAsignacion() de asignacion.js (escrita para esto) y
// Conciliación reusa datosConciliacionParaExport() de conciliacion.js
// (escrita para esto). Configuración arma sus 5 hojas directo desde
// state.conceptos/monedas/origenes/tiposCambio/reservas, incluyendo el id
// de cada fila (a pedido de Nadia).
//
// "Distribución mensual" y "Flujo de caja mensual" tienen cada una SU
// PROPIO selector de mes/año acá (independiente del que esté elegido en
// Dashboard > Distribución > Mensual / Flujo de caja > Mensual — a pedido
// de Nadia, mismo motivo por el que Flujo de caja ya tiene su propio mes
// separado del de Distribución), con el mes y año en curso por defecto.

import { state } from './state.js';
import { nombreConcepto, nombreOrigen, nombreMoneda } from './lookups.js';
import { avisarError } from './aviso-modal.js';
import { calcularEvolucion } from './evolucion.js';
import { construirPivot, totalEnEuros } from './dashboard.js';
import {
  mesActualTexto, poblarSelectMes, poblarSelectAnio, leerMesSeleccionado, escribirMesSeleccionado,
  formatoMesLegible, convertirAEuros, promediar, historicoPorConcepto, totalesEnEurosDelMes,
  datosDistribucionMensualPorMoneda, calcularHistoricoPorMoneda, calcularHistoricoEnEuros,
} from './distribucion.js';
import { datosFlujoCajaMensual, datosFlujoCajaHistorico } from './flujo-caja.js';
import { calcularAsignacion } from './asignacion.js';
import { datosConciliacionParaExport } from './conciliacion.js';

// --- Rango de fechas por defecto de Movimientos -----------------------------
//
// "Desde" es 1 año antes del mes ACTUAL de hoy (no antes de "Hasta"): a
// pedido de Nadia, con su ejemplo — hoy Octubre 2026, cargás un movimiento
// de Noviembre 2026 => Hasta = Noviembre 2026 (el mes del movimiento más
// reciente) y Desde = Octubre 2025 (12 meses antes de HOY, no antes de
// Noviembre).
function restarMeses(mesTexto, n) {
  const [anioTexto, mesNumTexto] = mesTexto.split("-");
  let anio = Number(anioTexto);
  let mes = Number(mesNumTexto) - n;
  while (mes <= 0) {
    mes += 12;
    anio -= 1;
  }
  return anio + "-" + String(mes).padStart(2, "0");
}

// El mes-año (texto "YYYY-MM") del movimiento más reciente cargado, o el mes
// actual si todavía no hay ningún movimiento. Se exporta para poder probarlo
// suelto.
export function mesMovimientoMasReciente() {
  if (state.movimientos.length === 0) return mesActualTexto();
  return state.movimientos.reduce((max, m) => {
    const mes = String(m.fecha).slice(0, 7);
    return mes > max ? mes : max;
  }, "0000-00");
}

// --- Datos de cada hoja (funciones puras, sin tocar XLSX ni el DOM) --------
//
// Separadas a propósito de las que arman el .xlsx (más abajo): así se
// pueden probar con jsdom/node sin necesitar la librería SheetJS cargada,
// comparando directamente los objetos que devuelven.

function conceptoIdsDistribucion() {
  return new Set(state.conceptos.filter(c => c.incluir_en_distribucion !== false).map(c => String(c.id)));
}

function monedaIdsDistribucion() {
  return new Set(state.monedas.filter(m => m.incluir_en_distribucion !== false).map(m => String(m.id)));
}

export function filasSnapshot(mesTexto) {
  const esMesActual = mesTexto === mesActualTexto();
  const mesCorte = esMesActual ? null : mesTexto;
  const convertir = (monedaId, monto) => convertirAEuros(mesTexto, monedaId, monto);
  const { pivot, listaMonedaIds, listaOrigenIds } = construirPivot(mesCorte);

  const filas = listaOrigenIds.map(origenId => {
    const fila = { Origen: nombreOrigen(origenId) };
    listaMonedaIds.forEach(monedaId => {
      fila[nombreMoneda(monedaId)] = Number((pivot[origenId][monedaId] || 0).toFixed(2));
    });
    const { total, incompleto } = totalEnEuros(pivot[origenId], listaMonedaIds, convertir);
    fila["Total (€)"] = Number(total.toFixed(2));
    fila["Incompleto"] = incompleto ? "Sí" : "";
    return fila;
  });

  if (listaOrigenIds.length > 0) {
    const totalesPorMoneda = {};
    listaMonedaIds.forEach(monedaId => {
      totalesPorMoneda[monedaId] = listaOrigenIds.reduce((s, o) => s + (pivot[o][monedaId] || 0), 0);
    });
    const filaTotal = { Origen: "Total" };
    listaMonedaIds.forEach(monedaId => {
      filaTotal[nombreMoneda(monedaId)] = Number((totalesPorMoneda[monedaId] || 0).toFixed(2));
    });
    const { total: totalGeneral, incompleto: totalIncompleto } = totalEnEuros(totalesPorMoneda, listaMonedaIds, convertir);
    filaTotal["Total (€)"] = Number(totalGeneral.toFixed(2));
    filaTotal["Incompleto"] = totalIncompleto ? "Sí" : "";
    filas.push(filaTotal);
  }
  return filas;
}

export function filasEvolucion() {
  const { filas, monedaIds } = calcularEvolucion();
  return filas.map(f => {
    const fila = { Mes: formatoMesLegible(f.mes) };
    monedaIds.forEach(id => { fila[nombreMoneda(id)] = Number((f.porMoneda[id] || 0).toFixed(2)); });
    fila["Total (€)"] = Number(f.total.toFixed(2));
    fila["Variación (€)"] = f.diferencia == null ? "" : Number(f.diferencia.toFixed(2));
    fila["Variación (%)"] = f.porcentaje == null ? "" : Number(f.porcentaje.toFixed(2));
    fila["Incompleto"] = f.incompleto ? "Sí" : "";
    return fila;
  });
}

export function filasDistribucionMensual(mesTexto) {
  const conceptoIdsIncluidos = conceptoIdsDistribucion();

  if (state.distribucion.convertirEuros) {
    const { totales, incompletos } = totalesEnEurosDelMes(mesTexto, conceptoIdsIncluidos);
    const { enEuros, faltaTasa } = historicoPorConcepto(mesTexto);
    return state.conceptos
      .filter(c => totales[c.id] !== undefined)
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map(c => {
        const { promedio } = promediar(enEuros[c.id], faltaTasa[c.id]);
        return {
          Concepto: c.nombre,
          "Total (€)": Number((totales[c.id] || 0).toFixed(2)),
          "Promedio (€)": promedio == null ? "" : Number(promedio.toFixed(2)),
          Incompleto: incompletos[c.id] ? "Sí" : "",
        };
      });
  }

  const monedaIdsIncluidas = monedaIdsDistribucion();
  const { porConceptoMoneda, listaMonedaIds } = datosDistribucionMensualPorMoneda(mesTexto, conceptoIdsIncluidos, monedaIdsIncluidas);
  const { porMoneda } = historicoPorConcepto(mesTexto);
  return state.conceptos
    .filter(c => porConceptoMoneda[c.id])
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map(c => {
      const fila = { Concepto: c.nombre };
      listaMonedaIds.forEach(monedaId => {
        const v = (porConceptoMoneda[c.id] && porConceptoMoneda[c.id][monedaId]) || 0;
        const { promedio } = promediar(porMoneda[c.id + "|" + monedaId]);
        fila[nombreMoneda(monedaId)] = Number(v.toFixed(2));
        fila["Promedio " + nombreMoneda(monedaId)] = promedio == null ? "" : Number(promedio.toFixed(2));
      });
      return fila;
    });
}

export function hojasDistribucionHistorica() {
  const conceptoIdsIncluidos = conceptoIdsDistribucion();
  const conceptosIncluidos = state.conceptos
    .filter(c => conceptoIdsIncluidos.has(String(c.id)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  function filasDeHoja(porMesConcepto, mesesUsados) {
    return Array.from(mesesUsados).sort().map(mes => {
      const fila = { Mes: formatoMesLegible(mes) };
      conceptosIncluidos.forEach(c => {
        fila[c.nombre] = Number(((porMesConcepto[mes] && porMesConcepto[mes][c.id]) || 0).toFixed(2));
      });
      return fila;
    });
  }

  if (state.distribucion.convertirEuros) {
    const { porMesConcepto, mesesUsados } = calcularHistoricoEnEuros(conceptoIdsIncluidos);
    return [{ nombre: "Total en Euros", filas: filasDeHoja(porMesConcepto, mesesUsados) }];
  }

  const monedaIdsIncluidas = monedaIdsDistribucion();
  return state.monedas
    .filter(m => monedaIdsIncluidas.has(String(m.id)))
    .map(moneda => {
      const { porMesConcepto, mesesUsados } = calcularHistoricoPorMoneda(moneda.id, conceptoIdsIncluidos);
      return { nombre: moneda.nombre, filas: filasDeHoja(porMesConcepto, mesesUsados) };
    })
    .filter(hoja => hoja.filas.length > 0);
}

// Las nueve columnas de Flujo de caja, en el mismo orden que la tabla de
// Histórica (COLUMNAS_HISTORICO_FLUJO en flujo-caja.js) — se repite acá la
// lista en vez de importarla para no atar el orden de las columnas del
// Excel a un detalle interno de esa tabla.
const COLUMNAS_FLUJO = [
  ["ingresoTotal", "Ingresos totales"], ["ingresoFijo", "Ingresos fijos"], ["ingresoVariable", "Ingresos variables"],
  ["gastoTotal", "Gastos totales"], ["gastoFijo", "Gastos fijos"], ["gastoVariable", "Gastos variables"],
  ["proporcionGastos", "% Gastado"], ["ahorroPct", "% Ahorrado"], ["ahorroImporte", "Importe ahorrado"],
];

function filaFlujoAPlano(metricas) {
  const fila = {};
  COLUMNAS_FLUJO.forEach(([clave, etiqueta]) => {
    const v = metricas[clave];
    fila[etiqueta] = v == null ? "" : Number(v.toFixed(2));
  });
  return fila;
}

export function filasFlujoCajaMensual(mesTexto) {
  const { filas, incompleto } = datosFlujoCajaMensual(mesTexto);
  return filas.map(f => ({
    Moneda: f.etiqueta,
    ...filaFlujoAPlano(f),
    Incompleto: incompleto ? "Sí" : "",
  }));
}

export function hojasFlujoCajaHistorico() {
  const { hojas } = datosFlujoCajaHistorico();
  return hojas.map(h => ({
    nombre: h.nombre,
    filas: h.filas.map(f => ({
      Mes: formatoMesLegible(f.mes),
      ...filaFlujoAPlano(f),
      Incompleto: f.incompleto ? "Sí" : "",
    })),
  }));
}

// "desde"/"hasta" en null (o undefined) significa "sin filtrar" — lo usa el
// checkbox "Todo" de Movimientos (a pedido de Nadia) para exportar todo lo
// cargado sin importar el rango elegido en los selectores.
export function filasMovimientos(desde, hasta) {
  return state.movimientos
    .filter(m => {
      if (desde == null && hasta == null) return true;
      const mes = String(m.fecha).slice(0, 7);
      return mes >= desde && mes <= hasta;
    })
    .map(m => ({
      Fecha: m.fecha,
      Tipo: m.tipo === "ingreso" ? "Ingreso" : "Egreso",
      Concepto: nombreConcepto(m.concepto_id),
      Origen: nombreOrigen(m.origen_id),
      Moneda: nombreMoneda(m.moneda_id),
      Monto: Number(Number(m.monto).toFixed(2)),
      "Descripción": m.descripcion || "",
    }));
}

export function hojasAsignacion() {
  const { filas, reservas, resumen } = calcularAsignacion();
  const reparticion = filas.map(f => {
    const fila = { Cuenta: f.nombre, "Total (€)": Number(f.total.toFixed(2)) };
    reservas.forEach(r => { fila[r.nombre] = Number((f.porReserva[r.id] || 0).toFixed(2)); });
    fila["Sin asignar (€)"] = Number(f.restante.toFixed(2));
    fila["Incompleto"] = f.incompleto ? "Sí" : "";
    return fila;
  });
  const resumenFilas = resumen.map(r => ({
    Reserva: r.nombre,
    "Objetivo (€)": Number(r.objetivo.toFixed(2)),
    "Asignado (€)": Number(r.asignado.toFixed(2)),
    "Diferencia (€)": Number(r.diferencia.toFixed(2)),
  }));
  return [
    { nombre: "Repartición", filas: reparticion },
    { nombre: "Resumen por reserva", filas: resumenFilas },
  ];
}

export function filasConciliacion() {
  return datosConciliacionParaExport().map(f => ({
    Origen: f.origen,
    Moneda: f.moneda,
    "Saldo actual": Number(f.saldoActual.toFixed(2)),
    "Última conciliación": f.ultimaFecha || "–",
    "Valor conciliado": f.ultimoValor == null ? "" : Number(f.ultimoValor.toFixed(2)),
  }));
}

export function hojasConfiguracion() {
  const conceptos = state.conceptos.map(c => ({
    Id: c.id,
    Nombre: c.nombre,
    Activo: c.activo ? "Sí" : "No",
    Tipo: c.tipo_gasto === "fijo" ? "Fijo" : "Variable",
    Signo: c.tipo_concepto_principal === 1 ? "Ingreso" : c.tipo_concepto_principal === 2 ? "Egreso" : "No aplica",
    "Moneda por defecto (id)": c.moneda_defecto_id ?? "",
    "Origen por defecto (id)": c.origen_defecto_id ?? "",
    "Incluir en Distribución": c.incluir_en_distribucion !== false ? "Sí" : "No",
    "Incluir en Snapshot": c.incluir_en_snapshot !== false ? "Sí" : "No",
    "Incluir en Flujo de caja": c.incluir_en_flujo_caja !== false ? "Sí" : "No",
  }));
  const monedas = state.monedas.map(m => ({
    Id: m.id,
    Nombre: m.nombre,
    Activo: m.activo ? "Sí" : "No",
    "Incluir en Distribución": m.incluir_en_distribucion !== false ? "Sí" : "No",
  }));
  const origenes = state.origenes.map(o => ({
    Id: o.id,
    Nombre: o.nombre,
    Activo: o.activo ? "Sí" : "No",
    "Remanente a reserva (id)": o.reserva_remanente_id ?? "",
  }));
  const tiposCambio = state.tiposCambio.map(tc => ({
    Id: tc.id,
    Mes: formatoMesLegible(tc.mes),
    "Moneda (id)": tc.moneda_id,
    Moneda: nombreMoneda(tc.moneda_id),
    Valor: tc.valor_eur == null ? "" : Number(Number(tc.valor_eur).toFixed(6)),
  }));
  const reservas = state.reservas.map(r => ({
    Id: r.id,
    Nombre: r.nombre,
    Activo: r.activo ? "Sí" : "No",
    "Cantidad reservada (€)": Number(Number(r.cantidad_reservada || 0).toFixed(2)),
    "Descripción": r.descripcion || "",
  }));
  return [
    { nombre: "Conceptos", filas: conceptos },
    { nombre: "Monedas", filas: monedas },
    { nombre: "Orígenes", filas: origenes },
    { nombre: "Tipos de cambio", filas: tiposCambio },
    { nombre: "Reservas", filas: reservas },
  ];
}

// --- Qué checkbox genera qué archivo ----------------------------------------
//
// Un archivo por tilde (a pedido de Nadia), salvo Asignación y Configuración
// que van en UN archivo con varias hojas (eso también lo pidió así). El
// orden de la lista es el orden en que se generan los archivos.
const REPORTES = [
  {
    chk: "backupChkSnapshot", archivo: "snapshot",
    construir: () => [{ nombre: "Snapshot", filas: filasSnapshot(state.backup.snapshotMes || mesActualTexto()) }],
  },
  {
    chk: "backupChkEvolucion", archivo: "evolucion_patrimonial",
    construir: () => [{ nombre: "Evolución patrimonial", filas: filasEvolucion() }],
  },
  {
    chk: "backupChkDistribMensual", archivo: "distribucion_mensual",
    construir: () => [{ nombre: "Distribución mensual", filas: filasDistribucionMensual(state.backup.distribMensualMes || mesActualTexto()) }],
  },
  {
    chk: "backupChkDistribHistorica", archivo: "distribucion_historica",
    construir: hojasDistribucionHistorica,
  },
  {
    chk: "backupChkFlujoMensual", archivo: "flujo_caja_mensual",
    construir: () => [{ nombre: "Flujo de caja mensual", filas: filasFlujoCajaMensual(state.backup.flujoMensualMes || mesActualTexto()) }],
  },
  {
    chk: "backupChkFlujoHistorico", archivo: "flujo_caja_historico",
    construir: hojasFlujoCajaHistorico,
  },
  {
    chk: "backupChkMovimientos", archivo: "movimientos",
    construir: () => [{
      nombre: "Movimientos",
      filas: state.backup.movTodo
        ? filasMovimientos(null, null)
        : filasMovimientos(state.backup.movDesde || restarMeses(mesActualTexto(), 12), state.backup.movHasta || mesMovimientoMasReciente()),
    }],
  },
  {
    chk: "backupChkAsignacion", archivo: "asignacion",
    construir: hojasAsignacion,
  },
  {
    chk: "backupChkConciliacion", archivo: "conciliacion",
    construir: () => [{ nombre: "Conciliación", filas: filasConciliacion() }],
  },
  {
    chk: "backupChkConfiguracion", archivo: "configuracion",
    construir: hojasConfiguracion,
  },
];

// --- Generar los .xlsx (acá sí se usa window.XLSX) --------------------------

function nombreHojaSegura(nombre) {
  // Excel no admite : \ / ? * [ ] en el nombre de una hoja, ni más de 31
  // caracteres — se sanean para no romper la generación por un nombre con
  // alguno de esos símbolos (ninguno de los nuestros los tiene hoy, pero es
  // gratis cubrirlo).
  return String(nombre).replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
}

function nombreArchivoConFecha(base) {
  const hoy = new Date();
  const fecha = hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0") + "-" + String(hoy.getDate()).padStart(2, "0");
  return `mibolsillo_${base}_${fecha}.xlsx`;
}

function descargarLibro(archivoBase, hojas) {
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  hojas.forEach(h => {
    const ws = XLSX.utils.json_to_sheet(h.filas);
    XLSX.utils.book_append_sheet(wb, ws, nombreHojaSegura(h.nombre));
  });
  XLSX.writeFile(wb, nombreArchivoConFecha(archivoBase));
}

function mostrarNota(texto) {
  const nota = document.getElementById("backupNota");
  if (!nota) return;
  if (!texto) { nota.style.display = "none"; return; }
  nota.textContent = texto;
  nota.style.display = "block";
}

// Genera los reportes tildados, un archivo .xlsx por tilde. Los dispara con
// un pequeño espacio entre uno y otro (en vez de todos en el mismo
// instante): varias descargas de golpe pueden hacer que el navegador
// bloquee algunas como si fueran ventanas emergentes.
function generarSeleccionados() {
  if (!window.XLSX) {
    mostrarNota("No se pudo cargar la librería para generar Excel (XLSX). Revisá la conexión a internet y volvé a intentar.");
    return;
  }
  const seleccionados = REPORTES.filter(r => {
    const el = document.getElementById(r.chk);
    return el && el.checked;
  });
  if (seleccionados.length === 0) {
    mostrarNota("Tildá al menos un reporte para generar.");
    return;
  }
  mostrarNota("");
  seleccionados.forEach((r, i) => {
    setTimeout(() => {
      try {
        descargarLibro(r.archivo, r.construir());
      } catch (err) {
        avisarError(`No se pudo generar el Excel de "${r.archivo}": ${err.message}`);
      }
    }, i * 400);
  });
}

// --- UI: checkboxes, selectores de mes y el botón ---------------------------

function actualizarMarcarTodos() {
  const chkTodos = document.getElementById("backupMarcarTodos");
  if (!chkTodos) return;
  chkTodos.checked = REPORTES.every(r => {
    const el = document.getElementById(r.chk);
    return el && el.checked;
  });
}

// Se llama desde renderTodo() (data-service.js) en cada carga, igual que el
// resto de las pantallas: completa los selectores de mes con su valor por
// defecto LA PRIMERA VEZ (ver el comentario grande de arriba del archivo),
// y en cualquier otro momento vuelve a escribir en los <select> lo que haya
// en state.backup — mismo motivo que el resto de la app (un <select> recién
// poblado no queda "vacío" solo).
// Los cuatro selectores de mes/año de esta pantalla (Snapshot, Distribución
// mensual, Flujo de caja mensual, y el par Desde/Hasta de Movimientos se
// arman aparte, más abajo): cada uno con su propio prefijo de <select> (ver
// poblarSelectMes/escribirMesSeleccionado de distribucion.js) y su propia
// clave en state.backup, para no mezclarse entre sí ni con el mes "real" de
// Distribución > Mensual o Flujo de caja > Mensual.
const PREFIJOS_MES = [
  { prefijo: "backupSnapshot", clave: "snapshotMes" },
  { prefijo: "backupDistribMensual", clave: "distribMensualMes" },
  { prefijo: "backupFlujoMensual", clave: "flujoMensualMes" },
];

// Mientras "Todo" (Movimientos) está tildado, el rango Desde/Hasta no se
// usa para exportar — se deshabilitan los cuatro <select> y se atenúa el
// contenedor, para que se note (mismo criterio que
// check-grid-deshabilitado). Se llama tanto desde renderBackup() (por si
// state.backup.movTodo ya venía tildado de antes en esta sesión) como
// desde el listener del checkbox.
function actualizarFechaRangoMovimientos() {
  const deshabilitado = !!state.backup.movTodo;
  ["backupMovDesdeMesNombre", "backupMovDesdeAnio", "backupMovHastaMesNombre", "backupMovHastaAnio"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = deshabilitado;
  });
  const cont = document.getElementById("backupMovFechaRango");
  if (cont) cont.classList.toggle("backup-fecha-rango-deshabilitado", deshabilitado);
}

export function renderBackup() {
  PREFIJOS_MES.forEach(({ prefijo, clave }) => {
    if (!state.backup[clave]) state.backup[clave] = mesActualTexto();
    escribirMesSeleccionado(prefijo, state.backup[clave]);
  });

  if (!state.backup.movHasta) state.backup.movHasta = mesMovimientoMasReciente();
  if (!state.backup.movDesde) state.backup.movDesde = restarMeses(mesActualTexto(), 12);
  escribirMesSeleccionado("backupMovDesde", state.backup.movDesde);
  escribirMesSeleccionado("backupMovHasta", state.backup.movHasta);

  const chkMovTodo = document.getElementById("backupMovTodo");
  if (chkMovTodo) chkMovTodo.checked = !!state.backup.movTodo;
  actualizarFechaRangoMovimientos();
}

export function setupBackup() {
  PREFIJOS_MES.forEach(({ prefijo, clave }) => {
    poblarSelectMes(prefijo);
    poblarSelectAnio(prefijo);
    ["MesNombre", "Anio"].forEach(sufijo => {
      document.getElementById(prefijo + sufijo).addEventListener("change", () => {
        state.backup[clave] = leerMesSeleccionado(prefijo);
      });
    });
  });

  poblarSelectMes("backupMovDesde");
  poblarSelectAnio("backupMovDesde");
  poblarSelectMes("backupMovHasta");
  poblarSelectAnio("backupMovHasta");
  document.getElementById("backupMovDesdeMesNombre").addEventListener("change", () => {
    state.backup.movDesde = leerMesSeleccionado("backupMovDesde");
  });
  document.getElementById("backupMovDesdeAnio").addEventListener("change", () => {
    state.backup.movDesde = leerMesSeleccionado("backupMovDesde");
  });
  document.getElementById("backupMovHastaMesNombre").addEventListener("change", () => {
    state.backup.movHasta = leerMesSeleccionado("backupMovHasta");
  });
  document.getElementById("backupMovHastaAnio").addEventListener("change", () => {
    state.backup.movHasta = leerMesSeleccionado("backupMovHasta");
  });

  const chkMovTodo = document.getElementById("backupMovTodo");
  if (chkMovTodo) {
    chkMovTodo.addEventListener("change", () => {
      state.backup.movTodo = chkMovTodo.checked;
      actualizarFechaRangoMovimientos();
    });
  }

  const chkTodos = document.getElementById("backupMarcarTodos");
  if (chkTodos) {
    chkTodos.addEventListener("change", () => {
      REPORTES.forEach(r => {
        const el = document.getElementById(r.chk);
        if (el) el.checked = chkTodos.checked;
      });
    });
  }
  REPORTES.forEach(r => {
    const el = document.getElementById(r.chk);
    if (el) el.addEventListener("change", actualizarMarcarTodos);
  });
  actualizarMarcarTodos();

  const btn = document.getElementById("btnGenerarBackup");
  if (btn) btn.addEventListener("click", generarSeleccionados);
}
