// Dashboard > Distribución > Flujo de caja: seis tarjetas con el total del
// mes — Ingresos y Gastos, cada uno separado en Totales, Fijos y Variables
// (conceptos.tipo_gasto, ver Configuración > Conceptos). La de "Totales" es
// Fijos + Variables sumados (a pedido de Nadia, para ver el número redondo
// sin tener que sumar las otras dos tarjetas a mano).
//
// Es una pestaña más de Distribución (junto con Mensual e Histórica, ver
// js/distribucion.js), pero tiene su PROPIO archivo — igual que cada
// pestaña de Dashboard/Gastos tiene el suyo (dashboard.js, evolucion.js,
// gastos.js, asignacion.js, conciliacion.js) — en vez de vivir adentro de
// distribucion.js. Reusa de ahí, en vez de reimplementarlas, las piezas que
// ya existían para Mensual: el semáforo/promedio (semaforoContraPromedio,
// promediar), el popup de detalle compartido (registrarDetalle,
// mostrarDetalle, escaparAtributo — el mismo #detalleOverlay que usan
// Mensual/Histórica), la conversión a euros (convertirAEuros) y el formato
// de mes (formatoMesLegible, mesActualTexto). Ver el comentario de arriba
// de distribucion.js para el detalle de por qué cada una está exportada.
//
// Cada tarjeta solo cuenta movimientos de SU tipo a propósito (Gastos =
// egresos, Ingresos = ingresos): la clasificación fijo/variable es del
// CONCEPTO, no del movimiento, así que un concepto que normalmente es de
// ingreso pero tuviera alguna vez un movimiento cargado como egreso
// entraría en Gastos ese mes, y viceversa. Las cuatro tarjetas usan las
// mismas funciones de cálculo parametrizadas por "tipoMovimiento" ("egreso"
// o "ingreso") en vez de tener una copia para cada una.
//
// Tiene su PROPIA lista de "Conceptos a incluir" (conceptos.
// incluir_en_flujo_caja, otra columna aparte, igual mecánica que
// incluir_en_distribucion) — a pedido de Nadia, independiente de la que
// usan Mensual/Histórica, para poder armar un conjunto de conceptos
// relevante para el flujo de caja sin pisar esa otra selección. Y también
// su PROPIO mes elegido (state.flujoCaja.mes, en vez de
// state.distribucion.mes de Mensual) — también a pedido de Nadia, para
// poder mirar un mes acá y otro distinto en Mensual al mismo tiempo. Sí
// comparte con Mensual/Histórica la selección de "Monedas a incluir" /
// "Convertir todo a Euros" de arriba (eso no se pidió separar). El
// MECANISMO del selector de mes (dos <select> en español, ver
// poblarSelectMes/leerMesSeleccionado/escribirMesSeleccionado importados de
// distribucion.js) sí es el mismo que usa Mensual, pero cada uno lee y
// escribe su propio mes.

import { state } from './state.js';
import { nombreMoneda } from './lookups.js';
import { renderCheckboxesTabla } from './check-list.js';
import {
  mesActualTexto, poblarSelectMes, poblarSelectAnio, leerMesSeleccionado, escribirMesSeleccionado,
  escaparAtributo, promediar, semaforoContraPromedio, registrarDetalle, mostrarDetalle,
  convertirAEuros, formatoMesLegible,
} from './distribucion.js';

// Detalle de cada tarjeta (botón "i"), en SU propia lista — no se comparte
// con detallesReporte/detallesHistorico de distribucion.js, cada archivo
// tiene la suya. Se reinicia UNA sola vez por render completo (ver
// renderFlujoCaja), no una vez por tarjeta, para que las referencias
// "fijovar:0", "fijovar:1", etc. de Gastos e Ingresos no se pisen entre sí.
let detallesFijoVariable = [];

function tipoGastoDe(conceptoId) {
  const c = state.conceptos.find(x => String(x.id) === String(conceptoId));
  // Cualquier cosa que no sea "fijo" (incluido null/undefined, por si algún
  // concepto viejo no tuviera la columna todavía) cuenta como "variable",
  // que es el valor por defecto de la columna en la base.
  return c && c.tipo_gasto === "fijo" ? "fijo" : "variable";
}

// signo: +1 para que un ingreso quede en positivo (igual que en el resto de
// la app) y -1 para que un egreso quede en negativo — mismo criterio que
// usa renderReporte() de distribucion.js con sus movimientos.
function signoDe(tipoMovimiento) {
  return tipoMovimiento === "ingreso" ? 1 : -1;
}

// Las tres funciones de "totales*"/"historico*" de abajo calculan fijo y
// variable por separado y después arman un tercer bucket "total" sumando
// esos dos — nunca al revés — así "Totales" es siempre exactamente Fijos +
// Variables. Como un concepto es SIEMPRE fijo o SIEMPRE variable
// (tipoGastoDe), fijo y variable nunca comparten un mismo concepto_id, así
// que juntar sus objetos con spread (sin sumar clave por clave) alcanza
// para los que están indexados por concepto_id. Estos tres helpers son para
// los que están indexados por mes o por mes+moneda, donde si hace falta
// sumar valor por valor.
function sumarPorClave(a, b) {
  const out = { ...a };
  for (const clave in b) out[clave] = (out[clave] || 0) + b[clave];
  return out;
}
function sumarAnidadoPorClave(a, b) {
  const out = {};
  for (const claveExterna in a) out[claveExterna] = { ...a[claveExterna] };
  for (const claveExterna in b) {
    if (!out[claveExterna]) out[claveExterna] = {};
    out[claveExterna] = sumarPorClave(out[claveExterna], b[claveExterna]);
  }
  return out;
}

function totalesFijoVariableEnEuros(tipoMovimiento, mes, conceptoIdsIncluidos) {
  const porConcepto = { fijo: {}, variable: {} };  // tipo -> concepto_id -> total en €
  const incompletos = { fijo: {}, variable: {} };  // tipo -> concepto_id -> true
  const totales = { fijo: 0, variable: 0 };
  const totalIncompleto = { fijo: false, variable: false };
  const signo = signoDe(tipoMovimiento);
  state.movimientos.forEach(m => {
    if (m.tipo !== tipoMovimiento) return;
    if (String(m.fecha).slice(0, 7) !== mes) return;
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    const tipo = tipoGastoDe(m.concepto_id);
    const { valor, ok } = convertirAEuros(mes, m.moneda_id, signo * Number(m.monto));
    porConcepto[tipo][m.concepto_id] = (porConcepto[tipo][m.concepto_id] || 0) + valor;
    totales[tipo] += valor;
    if (!ok) { incompletos[tipo][m.concepto_id] = true; totalIncompleto[tipo] = true; }
  });
  // "total" = fijo + variable (ver el comentario junto a sumarPorClave).
  porConcepto.total = { ...porConcepto.fijo, ...porConcepto.variable };
  incompletos.total = { ...incompletos.fijo, ...incompletos.variable };
  totales.total = totales.fijo + totales.variable;
  totalIncompleto.total = totalIncompleto.fijo || totalIncompleto.variable;
  return { porConcepto, incompletos, totales, totalIncompleto };
}

function totalesFijoVariablePorMoneda(tipoMovimiento, mes, conceptoIdsIncluidos, monedaIdsIncluidas) {
  const porConceptoMoneda = { fijo: {}, variable: {} }; // tipo -> concepto_id -> moneda_id -> total
  const totalesPorMoneda = { fijo: {}, variable: {} };  // tipo -> moneda_id -> total
  const signo = signoDe(tipoMovimiento);
  state.movimientos.forEach(m => {
    if (m.tipo !== tipoMovimiento) return;
    if (String(m.fecha).slice(0, 7) !== mes) return;
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    if (!monedaIdsIncluidas.has(String(m.moneda_id))) return;
    const tipo = tipoGastoDe(m.concepto_id);
    const val = signo * Number(m.monto);
    if (!porConceptoMoneda[tipo][m.concepto_id]) porConceptoMoneda[tipo][m.concepto_id] = {};
    porConceptoMoneda[tipo][m.concepto_id][m.moneda_id] = (porConceptoMoneda[tipo][m.concepto_id][m.moneda_id] || 0) + val;
    totalesPorMoneda[tipo][m.moneda_id] = (totalesPorMoneda[tipo][m.moneda_id] || 0) + val;
  });
  // "total" = fijo + variable (ver el comentario junto a sumarPorClave).
  porConceptoMoneda.total = { ...porConceptoMoneda.fijo, ...porConceptoMoneda.variable };
  totalesPorMoneda.total = sumarPorClave(totalesPorMoneda.fijo, totalesPorMoneda.variable);
  return { porConceptoMoneda, totalesPorMoneda };
}

// Promedio histórico (de gasto o de ingreso, según tipoMovimiento) por tipo
// ("fijo"/"variable"), para el semáforo y el promedio de estas tarjetas.
// Mismo criterio que historicoPorConcepto de distribucion.js (no cuenta el
// mes que se está mirando; un mes al que le faltó algún tipo de cambio no
// entra en el promedio en euros), pero acá se suma TODO lo que sea de ese
// tipo junto, sin separar por concepto — es el promedio de "cuánto
// gasté/ingresé fijo/variable por mes", no el de un concepto en particular.
function historicoFijoVariable(tipoMovimiento, mesExcluido, conceptoIdsIncluidos) {
  const porMoneda = { fijo: {}, variable: {} };  // tipo -> moneda_id -> { mes: total }
  const enEuros = { fijo: {}, variable: {} };    // tipo -> { mes: total }
  const faltaTasa = { fijo: {}, variable: {} };  // tipo -> { mes: true }
  const signo = signoDe(tipoMovimiento);
  state.movimientos.forEach(m => {
    if (m.tipo !== tipoMovimiento) return;
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    const mes = String(m.fecha).slice(0, 7);
    if (mes === mesExcluido) return;
    const tipo = tipoGastoDe(m.concepto_id);
    const val = signo * Number(m.monto);

    if (!porMoneda[tipo][m.moneda_id]) porMoneda[tipo][m.moneda_id] = {};
    porMoneda[tipo][m.moneda_id][mes] = (porMoneda[tipo][m.moneda_id][mes] || 0) + val;

    const { valor, ok } = convertirAEuros(mes, m.moneda_id, val);
    enEuros[tipo][mes] = (enEuros[tipo][mes] || 0) + valor;
    if (!ok) faltaTasa[tipo][mes] = true;
  });
  // "total" = fijo + variable (ver el comentario junto a sumarPorClave).
  porMoneda.total = sumarAnidadoPorClave(porMoneda.fijo, porMoneda.variable);
  enEuros.total = sumarPorClave(enEuros.fijo, enEuros.variable);
  faltaTasa.total = { ...faltaTasa.fijo, ...faltaTasa.variable };
  return { porMoneda, enEuros, faltaTasa };
}

// Línea "Promedio: X" debajo de cada importe. Igual que celdaPromedio() de
// distribucion.js: "–" cuando no hay meses anteriores con qué comparar, y
// ⚠ cuando a algún mes anterior le faltó el tipo de cambio de alguna moneda
// (así que ese mes no entró en el promedio y el número mostrado puede estar
// incompleto).
function textoPromedio(promedio, incompleto, unidad) {
  if (promedio == null) return `<span class="fijovar-promedio">Promedio: –</span>`;
  const marca = incompleto ? "⚠ " : "";
  const sufijo = unidad ? " " + unidad : "";
  return `<span class="fijovar-promedio">${marca}Promedio: ${promedio.toFixed(2)}${sufijo}</span>`;
}

function spanSemaforo(sem) {
  return `<span class="semaforo ${sem.clase}"${sem.titulo ? ` title="${escaparAtributo(sem.titulo)}"` : ""}></span>`;
}

function nombreConceptoOrdenable(id) {
  const c = state.conceptos.find(x => String(x.id) === String(id));
  return c ? c.nombre : "";
}

// Arma el detalle que abre el botón "i" de cada tarjeta: reusa el mismo
// popup (#detalleOverlay) y la misma forma de "grupos" que Mensual/
// Histórica, pero acá cada línea es un CONCEPTO con su total de ese mes (no
// un movimiento puntual) — es un resumen, no una lista de movimientos. Con
// "Convertir todo a Euros" es un solo grupo; sin convertir, un grupo por
// moneda seleccionada, y en cada uno solo aparecen los conceptos que
// tuvieron algo en esa moneda ese mes.
function detalleFijoVariable(tipo, titulo, datosEuros, datosPorMoneda, monedaIdsOrdenadas) {
  let grupos;
  if (datosEuros) {
    const porConcepto = datosEuros.porConcepto[tipo];
    const ids = Object.keys(porConcepto).sort((a, b) => nombreConceptoOrdenable(a).localeCompare(nombreConceptoOrdenable(b)));
    grupos = [{
      etiqueta: null,
      lineas: ids.map(id => ({
        texto: nombreConceptoOrdenable(id),
        monto: `${porConcepto[id].toFixed(2)} €${datosEuros.incompletos[tipo][id] ? " ⚠" : ""}`,
      })),
    }];
  } else {
    const porConceptoMoneda = datosPorMoneda.porConceptoMoneda[tipo];
    grupos = monedaIdsOrdenadas.map(monedaId => {
      const ids = Object.keys(porConceptoMoneda)
        .filter(id => porConceptoMoneda[id][monedaId])
        .sort((a, b) => nombreConceptoOrdenable(a).localeCompare(nombreConceptoOrdenable(b)));
      if (ids.length === 0) return null;
      return {
        etiqueta: nombreMoneda(monedaId),
        lineas: ids.map(id => ({ texto: nombreConceptoOrdenable(id), monto: porConceptoMoneda[id][monedaId].toFixed(2) })),
      };
    }).filter(Boolean);
  }
  if (grupos.length === 0) {
    grupos = [{ etiqueta: null, lineas: [{ texto: "Sin movimientos este mes", monto: "" }] }];
  }
  return registrarDetalle(detallesFijoVariable, "fijovar", titulo, grupos);
}

function tarjetaFijoVariable(tipo, titulo, mes, datosEuros, datosPorMoneda, monedaIdsOrdenadas, historico) {
  const tituloDetalle = `${titulo} — ${formatoMesLegible(mes)}`;
  let montoHtml;
  if (datosEuros) {
    const v = datosEuros.totales[tipo];
    const marca = datosEuros.totalIncompleto[tipo]
      ? `<span class="valor-incompleto" title="Falta cargar el tipo de cambio de alguna moneda para este mes, en Configuración &gt; Tipo de cambio">⚠</span>`
      : "";
    const clase = v > 0 ? "positivo" : v < 0 ? "negativo" : "cero";
    // El promedio y el semáforo comparan contra los meses ANTERIORES (nunca
    // contra este mismo mes) usando el mismo umbral y el mismo criterio que
    // la columna "Promedio" del reporte de Mensual (semaforoContraPromedio):
    // verde/rojo según si la diferencia supera el umbral, y ámbar cuando se
    // está dentro de ese margen.
    const { promedio, incompleto } = promediar(historico.enEuros[tipo], historico.faltaTasa[tipo]);
    const sem = semaforoContraPromedio(v, promedio, "€");
    montoHtml = `
      <div class="fijovar-item">
        <span class="fijovar-linea">${marca}<span class="${clase}">${v ? v.toFixed(2) : "–"} €</span>${spanSemaforo(sem)}</span>
        ${textoPromedio(promedio, incompleto, "€")}
      </div>`;
  } else if (monedaIdsOrdenadas.length === 0) {
    montoHtml = `<div class="fijovar-item"><span class="fijovar-linea"><span class="cero">–</span></span></div>`;
  } else {
    const totalesTipo = datosPorMoneda.totalesPorMoneda[tipo];
    // Se muestran TODAS las monedas que tuvieron algo ese mes en cualquiera
    // de las dos tarjetas del par (no solo en esta), igual que hace la
    // tabla de Mensual con sus columnas: así, si una moneda tuvo
    // movimientos variables pero ninguno fijo ese mes, la tarjeta de Fijos
    // también la lista en 0.00 en vez de omitirla.
    montoHtml = monedaIdsOrdenadas.map(monedaId => {
      const v = totalesTipo[monedaId] || 0;
      const clase = v > 0 ? "positivo" : v < 0 ? "negativo" : "cero";
      const { promedio } = promediar(historico.porMoneda[tipo][monedaId]);
      const sem = semaforoContraPromedio(v, promedio, nombreMoneda(monedaId));
      return `
        <div class="fijovar-item">
          <span class="fijovar-linea"><span class="${clase}">${v ? v.toFixed(2) : "–"} ${nombreMoneda(monedaId)}</span>${spanSemaforo(sem)}</span>
          ${textoPromedio(promedio, false, nombreMoneda(monedaId))}
        </div>`;
    }).join("");
  }
  const detalleRef = detalleFijoVariable(tipo, tituloDetalle, datosEuros, datosPorMoneda, monedaIdsOrdenadas);
  // "Totales" lleva una clase de más (card-fijovar-total) solo para
  // distinguirla visualmente de Fijos/Variables (ver css/styles.css): es la
  // misma tarjeta, con la misma estructura, calculada con tipo="total".
  const claseTotal = tipo === "total" ? " card-fijovar-total" : "";
  return `
    <div class="card card-fijovar${claseTotal}">
      <div class="fijovar-header">
        <h3>${titulo}</h3>
        <button type="button" class="btn-detalle" data-detalle="${detalleRef}" title="Ver el detalle por concepto">i</button>
      </div>
      <div class="fijovar-monto">${montoHtml}</div>
    </div>`;
}

// Arma un trío de tarjetas (Totales, fijo, variable) para un contenedor y
// un tipoMovimiento puntual ("egreso" -> Gastos, "ingreso" -> Ingresos). Se
// llama una vez por trío (ver renderFlujoCaja), pasándole el título que
// corresponda a cada una. "Totales" va primera (a la izquierda) porque es
// el resumen de las otras dos.
function renderGrupoFijoVariable(contenedorId, tipoMovimiento, tituloTotal, tituloFijo, tituloVariable, mes, conceptoIdsIncluidos, monedaIdsIncluidas) {
  const cont = document.getElementById(contenedorId);
  if (!cont) return;
  const historico = historicoFijoVariable(tipoMovimiento, mes, conceptoIdsIncluidos);
  if (state.distribucion.convertirEuros) {
    const datosEuros = totalesFijoVariableEnEuros(tipoMovimiento, mes, conceptoIdsIncluidos);
    cont.innerHTML =
      tarjetaFijoVariable("total", tituloTotal, mes, datosEuros, null, [], historico) +
      tarjetaFijoVariable("fijo", tituloFijo, mes, datosEuros, null, [], historico) +
      tarjetaFijoVariable("variable", tituloVariable, mes, datosEuros, null, [], historico);
    return;
  }
  const datosPorMoneda = totalesFijoVariablePorMoneda(tipoMovimiento, mes, conceptoIdsIncluidos, monedaIdsIncluidas);
  const monedaIdsOrdenadas = Array.from(
    new Set([...Object.keys(datosPorMoneda.totalesPorMoneda.fijo), ...Object.keys(datosPorMoneda.totalesPorMoneda.variable)])
  ).sort((a, b) => nombreMoneda(a).localeCompare(nombreMoneda(b)));
  cont.innerHTML =
    tarjetaFijoVariable("total", tituloTotal, mes, null, datosPorMoneda, monedaIdsOrdenadas, historico) +
    tarjetaFijoVariable("fijo", tituloFijo, mes, null, datosPorMoneda, monedaIdsOrdenadas, historico) +
    tarjetaFijoVariable("variable", tituloVariable, mes, null, datosPorMoneda, monedaIdsOrdenadas, historico);
}

// Lista de conceptos propia de Flujo de caja (ver el comentario de arriba
// del archivo): misma función reutilizable de check-list.js que usa
// Mensual/Histórica, pero guardando en su propia columna
// (conceptos.incluir_en_flujo_caja) para que tildar/destildar acá no toque
// para nada la lista de esas otras dos pestañas.
function renderCheckboxesConceptosFlujo() {
  renderCheckboxesTabla("conceptos", state.conceptos, "distribFlujoConceptosCheckboxes", "Todavía no hay conceptos cargados.", "incluir_en_flujo_caja", true);
}

// Punto de entrada de esta pestaña: la llaman, directamente (no a través de
// distribucion.js), tanto data-service.js (cargarTodo() -> renderTodo(),
// como cualquier otra pestaña) como el propio cambio de mes de acá abajo.
export function renderFlujoCaja() {
  if (!state.flujoCaja.mes) state.flujoCaja.mes = mesActualTexto();
  // Mismo motivo que en distribucion.js: un <select> recién poblado no
  // queda "vacío" solo, así que se escribe el valor desde el estado en
  // cada render.
  escribirMesSeleccionado("distribFlujo", state.flujoCaja.mes);
  renderCheckboxesConceptosFlujo();
  detallesFijoVariable = [];
  const mes = state.flujoCaja.mes;
  const conceptoIdsIncluidos = new Set(
    state.conceptos.filter(c => c.incluir_en_flujo_caja !== false).map(c => String(c.id))
  );
  const monedaIdsIncluidas = new Set(
    state.monedas.filter(m => m.incluir_en_distribucion !== false).map(m => String(m.id))
  );
  // El orden acá no afecta el orden visual (cada una pinta un contenedor
  // de index.html distinto, y ese HTML es el que decide qué va arriba); se
  // llaman en este orden (Ingresos, Gastos) solo para que coincida con
  // cómo se ven en la pantalla.
  renderGrupoFijoVariable("distribFijoVariableIngresos", "ingreso", "Ingresos totales", "Ingresos fijos", "Ingresos variables", mes, conceptoIdsIncluidos, monedaIdsIncluidas);
  renderGrupoFijoVariable("distribFijoVariable", "egreso", "Gastos totales", "Gastos fijos", "Gastos variables", mes, conceptoIdsIncluidos, monedaIdsIncluidas);
}

export function setupFlujoCaja() {
  poblarSelectMes("distribFlujo");
  poblarSelectAnio("distribFlujo");
  ["MesNombre", "Anio"].forEach(sufijo => {
    document.getElementById("distribFlujo" + sufijo).addEventListener("change", () => {
      state.flujoCaja.mes = leerMesSeleccionado("distribFlujo");
      renderFlujoCaja();
    });
  });

  // Botón "i" de cada tarjeta: mismo mecanismo que Mensual/Histórica
  // (distribucion.js tiene su propio listener igual a este, para los
  // prefijos "reporte"/"historico"); cada uno ignora los data-detalle que
  // no son suyos, así que los dos conviven sin pisarse.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-detalle]");
    if (!btn) return;
    const [prefijo, idTexto] = btn.dataset.detalle.split(":");
    if (prefijo !== "fijovar") return;
    const d = detallesFijoVariable[Number(idTexto)];
    if (d) mostrarDetalle(d);
  });
}
