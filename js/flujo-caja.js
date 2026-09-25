// Dashboard > Distribución > Flujo de caja: seis tarjetas con el total del
// mes — Ingresos y Gastos, cada uno separado en Totales, Fijos y Variables
// (conceptos.tipo_gasto, ver Configuración > Conceptos). La de "Totales" es
// Fijos + Variables sumados (a pedido de Nadia, para ver el número redondo
// sin tener que sumar las otras dos tarjetas a mano).
//
// Abajo de esas seis van tres tarjetas más de resumen (a pedido de Nadia):
// "Proporción de gastos" (qué % de los ingresos del mes se gastó), "Ahorro"
// (qué % se ahorró) y "Ahorro (importe)" (lo mismo pero en plata, no en
// porcentaje). Las tres comparan Ingresos totales contra Gastos totales del
// MISMO mes (no llevan semáforo ni promedio histórico, a diferencia de las
// otras seis: acá no se pidió comparar contra meses anteriores).
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
// usan Mensual/Histórica DE DISTRIBUCIÓN, para poder armar un conjunto de
// conceptos relevante para el flujo de caja sin pisar esa otra selección. Y
// también su PROPIO mes elegido (state.flujoCaja.mes, en vez de
// state.distribucion.mes de Mensual) — también a pedido de Nadia, para
// poder mirar un mes acá y otro distinto en Mensual de Distribución al
// mismo tiempo. Sí comparte con Distribución la selección de "Monedas a
// incluir" / "Convertir todo a Euros" de ahí (eso no se pidió separar). El
// MECANISMO del selector de mes (dos <select> en español, ver
// poblarSelectMes/leerMesSeleccionado/escribirMesSeleccionado importados de
// distribucion.js) sí es el mismo que usa Distribución > Mensual, pero cada
// uno lee y escribe su propio mes.
//
// A su vez, Flujo de caja tiene sus PROPIAS sub-pestañas Mensual/Histórica
// (a pedido de Nadia, espejo de las de Distribución): "Mensual" es todo lo
// de arriba (las nueve tarjetas del mes elegido); "Histórica" es una tabla
// con una fila por mes y una columna por cada una de esas nueve tarjetas
// (Ingresos/Gastos totales-fijos-variables + Proporción de gastos/Ahorro/
// Ahorro importe) — a diferencia de la Histórica de Distribución, que tiene
// una columna por CONCEPTO. Entre Mensual y Histórica de Flujo de caja
// (pero no con Distribución) se comparte una sola lista de "Conceptos a
// incluir" arriba de las dos sub-pestañas — a pedido de Nadia, mismo
// mecanismo que usa Distribución con SU "Conceptos a incluir" (compartido
// entre Mensual e Histórica de Distribución, ver el comentario de arriba
// de distribucion.js). "ordenHistorico" (state.flujoCaja.ordenHistorico)
// es el orden de esta Histórica, independiente del de Distribución.
//
// Las columnas "Proporción de gastos" y "% Ahorro"/"Cantidad ahorrada" (así
// se llaman en el encabezado, a pedido de Nadia — antes eran "Ahorro"/
// "Ahorro (importe)") tienen cada una su propio criterio de color:
// "Proporción de gastos" pinta verde si gastaste MENOS del 100% de lo que
// entró ese mes y rojo si llegaste al 100% o más (no importa el signo del
// número, siempre es positivo); "% Ahorro" pinta según el signo, como el
// resto de la app (ahorrar = positivo = verde). Cada celda de la Histórica
// tiene además su propio botón "i" (a pedido de Nadia, para que quede igual
// que la Histórica de Distribución): en las seis columnas de importe abre
// el desglose por concepto de ese mes; en las tres derivadas, un resumen de
// Ingresos totales contra Gastos totales de ese mes (ver
// detalleCeldaHistoricoFlujo).

import { state } from './state.js';
import { nombreMoneda } from './lookups.js';
import { renderCheckboxesTabla } from './check-list.js';
import {
  mesActualTexto, poblarSelectMes, poblarSelectAnio, leerMesSeleccionado, escribirMesSeleccionado,
  escaparAtributo, promediar, semaforoContraPromedio, registrarDetalle, mostrarDetalle,
  convertirAEuros, formatoMesLegible, celdaImporte,
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

// --- Proporción de gastos / Ahorro ----------------------------------------
//
// Junta Ingresos totales y Gastos totales del mes (el bucket "total" =
// fijo + variable de las mismas dos funciones de arriba) para armar las
// tres tarjetas de resumen. "gasto" siempre se guarda en POSITIVO acá
// (invirtiendo el signo que trae totales.total para egresos), porque estas
// tres tarjetas quieren "cuánto gasté" para compararlo contra "cuánto
// ingresé", no un importe con signo.
//
// Con "Convertir todo a Euros" da una sola fila (en euros); sin convertir,
// una fila por moneda que haya tenido Ingresos o Gastos ese mes — Ingresos
// y Gastos se comparan moneda contra moneda, nunca mezclando monedas
// distintas (comparar USD gastados contra ARS ingresados no tendría
// sentido).
function calcularResumenAhorro(mes, conceptoIdsIncluidos, monedaIdsIncluidas) {
  if (state.distribucion.convertirEuros) {
    const ingresos = totalesFijoVariableEnEuros("ingreso", mes, conceptoIdsIncluidos);
    const gastos = totalesFijoVariableEnEuros("egreso", mes, conceptoIdsIncluidos);
    return {
      unidadUnica: " €",
      filas: [{
        etiqueta: null,
        ingreso: ingresos.totales.total,
        gasto: -gastos.totales.total,
        incompleto: ingresos.totalIncompleto.total || gastos.totalIncompleto.total,
      }],
    };
  }
  const ingresosPM = totalesFijoVariablePorMoneda("ingreso", mes, conceptoIdsIncluidos, monedaIdsIncluidas);
  const gastosPM = totalesFijoVariablePorMoneda("egreso", mes, conceptoIdsIncluidos, monedaIdsIncluidas);
  const monedaIds = Array.from(new Set([
    ...Object.keys(ingresosPM.totalesPorMoneda.total),
    ...Object.keys(gastosPM.totalesPorMoneda.total),
  ])).sort((a, b) => nombreMoneda(a).localeCompare(nombreMoneda(b)));
  return {
    unidadUnica: null,
    filas: monedaIds.map(id => ({
      etiqueta: nombreMoneda(id),
      ingreso: ingresosPM.totalesPorMoneda.total[id] || 0,
      gasto: -(gastosPM.totalesPorMoneda.total[id] || 0),
      incompleto: false,
    })),
  };
}

// Una tarjeta de resumen: "tipoTarjeta" decide qué cuenta con ingreso/gasto
// de cada fila ("proporcionGastos", "ahorroPct" o "ahorroMonto"). Una fila
// por moneda (una sola si está "Convertir todo a Euros"); si algún mes no
// tuvo ingresos, esa fila muestra "Sin ingresos este mes" en vez de
// dividir por cero.
function tarjetaResumen(titulo, resumen, tipoTarjeta) {
  let montoHtml;
  if (resumen.filas.length === 0) {
    montoHtml = `<div class="fijovar-item"><span class="fijovar-linea"><span class="cero">–</span></span></div>`;
  } else {
    montoHtml = resumen.filas.map(fila => {
      const unidad = resumen.unidadUnica != null ? resumen.unidadUnica : " " + fila.etiqueta;
      const marca = fila.incompleto
        ? `<span class="valor-incompleto" title="Falta cargar el tipo de cambio de alguna moneda para este mes, en Configuración &gt; Tipo de cambio">⚠</span>`
        : "";
      if (fila.ingreso <= 0) {
        return `
          <div class="fijovar-item">
            <span class="fijovar-linea">${marca}<span class="cero">–</span></span>
            <span class="fijovar-promedio">Sin ingresos este mes${fila.etiqueta ? " en " + fila.etiqueta : ""}</span>
          </div>`;
      }
      if (tipoTarjeta === "proporcionGastos") {
        const pct = (fila.gasto / fila.ingreso) * 100;
        return `
          <div class="fijovar-item">
            <span class="fijovar-linea">${marca}<span>${pct.toFixed(1)}%</span></span>
            <span class="fijovar-promedio">${fila.gasto.toFixed(2)}${unidad} de ${fila.ingreso.toFixed(2)}${unidad}</span>
          </div>`;
      }
      const ahorro = fila.ingreso - fila.gasto;
      const clase = ahorro > 0 ? "positivo" : ahorro < 0 ? "negativo" : "cero";
      if (tipoTarjeta === "ahorroPct") {
        const pct = (ahorro / fila.ingreso) * 100;
        return `
          <div class="fijovar-item">
            <span class="fijovar-linea">${marca}<span class="${clase}">${pct.toFixed(1)}%</span></span>
            <span class="fijovar-promedio">${ahorro.toFixed(2)}${unidad} de ${fila.ingreso.toFixed(2)}${unidad}</span>
          </div>`;
      }
      // ahorroMonto
      return `
        <div class="fijovar-item">
          <span class="fijovar-linea">${marca}<span class="${clase}">${ahorro.toFixed(2)}${unidad}</span></span>
        </div>`;
    }).join("");
  }
  return `
    <div class="card card-fijovar">
      <div class="fijovar-header"><h3>${titulo}</h3></div>
      <div class="fijovar-monto">${montoHtml}</div>
    </div>`;
}

function renderResumenAhorro(contenedorId, mes, conceptoIdsIncluidos, monedaIdsIncluidas) {
  const cont = document.getElementById(contenedorId);
  if (!cont) return;
  const resumen = calcularResumenAhorro(mes, conceptoIdsIncluidos, monedaIdsIncluidas);
  cont.innerHTML =
    tarjetaResumen("Proporción de gastos", resumen, "proporcionGastos") +
    tarjetaResumen("Ahorro", resumen, "ahorroPct") +
    tarjetaResumen("Ahorro (importe)", resumen, "ahorroMonto");
}

// --- Histórica de Flujo de caja --------------------------------------------
//
// Mismo mecanismo que la Histórica de Distribución (una fila por mes, una
// tabla por moneda incluida, o "Total en Euros" si está convertido), pero
// acá las COLUMNAS son las nueve tarjetas de Mensual, no una por concepto —
// a pedido de Nadia. No lleva semáforo ni promedio (a diferencia de la
// Histórica de Distribución): acá cada celda YA es una comparación entre
// meses, no un importe puntual para comparar contra un promedio aparte.
// Encabezado en dos pisos (a pedido de Nadia, para achicar el ancho de la
// tabla y el scroll horizontal): arriba, un título de GRUPO con colspan=3
// ("Ingresos"/"Gastos"/"Ahorro"); abajo, el nombre CORTO de cada columna
// adentro de ese grupo (p.ej. "Fijos" en vez de "Ingresos fijos", ya que
// "Ingresos" queda dicho una sola vez arriba, en el grupo). "tituloCompleto"
// es el nombre largo de siempre, que se sigue usando en el título del popup
// del botón "i" (detalleCeldaHistoricoFlujo) — ahí SÍ hace falta que se
// entienda solo, sin depender de en qué grupo esté la columna en la tabla.
const GRUPOS_HISTORICO_FLUJO = [
  {
    titulo: "Ingresos",
    columnas: [
      { tituloCorto: "Totales", tituloCompleto: "Ingresos totales", clave: "ingresoTotal" },
      { tituloCorto: "Fijos", tituloCompleto: "Ingresos fijos", clave: "ingresoFijo" },
      { tituloCorto: "Variables", tituloCompleto: "Ingresos variables", clave: "ingresoVariable" },
    ],
  },
  {
    titulo: "Gastos",
    columnas: [
      { tituloCorto: "Totales", tituloCompleto: "Gastos totales", clave: "gastoTotal" },
      { tituloCorto: "Fijos", tituloCompleto: "Gastos fijos", clave: "gastoFijo" },
      { tituloCorto: "Variables", tituloCompleto: "Gastos variables", clave: "gastoVariable" },
    ],
  },
  {
    // Las tres columnas de acá no son un trío Totales/Fijos/Variables como
    // los otros dos grupos (son tres cálculos distintos, no un desglose de
    // una misma cosa), pero Nadia pidió agruparlas igual bajo un título
    // común para ganar el mismo ancho — "% Ahorro"/"Cantidad ahorrada" son
    // los nombres que ya tenían (ver más arriba); "Proporción de gastos" se
    // acorta a "% gastado" acá abajo para que las tres queden parejas.
    titulo: "Ahorro",
    columnas: [
      { tituloCorto: "% gastado", tituloCompleto: "Proporción de gastos", clave: "proporcionGastos" },
      { tituloCorto: "% ahorrado", tituloCompleto: "% Ahorro", clave: "ahorroPct" },
      { tituloCorto: "Importe", tituloCompleto: "Cantidad ahorrada", clave: "ahorroImporte" },
    ],
  },
];

// Lista plana (una entrada por columna, en el mismo orden) para todo lo que
// no necesita saber de grupos — el dispatch de celdaHistoricoFlujo, armar
// cada fila de la tabla, etc.
const COLUMNAS_HISTORICO_FLUJO = GRUPOS_HISTORICO_FLUJO.flatMap(g => g.columnas);

function filaMetricasVacia() {
  return { ingresoFijo: 0, ingresoVariable: 0, gastoFijo: 0, gastoVariable: 0 };
}

// Junta ingreso/gasto fijo/variable de un mes puntual en las nueve métricas
// de las columnas de arriba (mismas fórmulas que calcularResumenAhorro() y
// que las tarjetas de Totales de Mensual). "gastoFijo"/"gastoVariable"/
// "gastoTotal" quedan en POSITIVO acá (para poder calcular Proporción de
// gastos/Ahorro sin líos de signo) — se muestran en NEGATIVO en la tabla,
// ver celdaHistoricoFlujo.
function metricasDelMes(datosMes) {
  const ingresoTotal = datosMes.ingresoFijo + datosMes.ingresoVariable;
  const gastoTotal = datosMes.gastoFijo + datosMes.gastoVariable;
  const ahorroImporte = ingresoTotal - gastoTotal;
  const proporcionGastos = ingresoTotal > 0 ? (gastoTotal / ingresoTotal) * 100 : null;
  const ahorroPct = ingresoTotal > 0 ? (ahorroImporte / ingresoTotal) * 100 : null;
  return {
    ingresoTotal, ingresoFijo: datosMes.ingresoFijo, ingresoVariable: datosMes.ingresoVariable,
    gastoTotal, gastoFijo: datosMes.gastoFijo, gastoVariable: datosMes.gastoVariable,
    proporcionGastos, ahorroPct, ahorroImporte,
  };
}

// Agrupa los movimientos de UNA moneda puntual por mes, separando de una
// ingreso/egreso y fijo/variable — insumo de metricasDelMes() de arriba.
// "detallePorMes" (mes -> clave -> concepto_id -> total) es el desglose por
// concepto que arma el botón "i" de cada celda (detalleCeldaHistoricoFlujo,
// más abajo) — acá cada entrada es un número puntual (sin conversión, así
// que no hace falta marcar incompletos por concepto).
function historicoFlujoPorMoneda(monedaId, conceptoIdsIncluidos) {
  const porMes = {};
  const detallePorMes = {};
  const mesesUsados = new Set();
  state.movimientos.forEach(m => {
    if (String(m.moneda_id) !== String(monedaId)) return;
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    const mes = String(m.fecha).slice(0, 7);
    const tipoGasto = tipoGastoDe(m.concepto_id);
    if (!porMes[mes]) porMes[mes] = filaMetricasVacia();
    const clave = (m.tipo === "ingreso" ? "ingreso" : "gasto") + (tipoGasto === "fijo" ? "Fijo" : "Variable");
    porMes[mes][clave] += Number(m.monto);
    if (!detallePorMes[mes]) detallePorMes[mes] = {};
    if (!detallePorMes[mes][clave]) detallePorMes[mes][clave] = {};
    detallePorMes[mes][clave][m.concepto_id] = (detallePorMes[mes][clave][m.concepto_id] || 0) + Number(m.monto);
    mesesUsados.add(mes);
  });
  return { porMes, detallePorMes, mesesUsados };
}

// Igual que la anterior, pero para todas las monedas juntas convertidas a
// euros (con "Convertir todo a Euros" tildado) — mismo criterio que
// calcularHistoricoEnEuros de distribucion.js: si a algún movimiento de un
// mes le faltó el tipo de cambio, ese MES ENTERO (las nueve columnas, no
// una celda puntual) queda marcado como incompleto, porque casi cualquier
// columna depende de casi cualquier movimiento de ese mes. Acá cada entrada
// de "detallePorMes" es un objeto { total, incompleto } (a diferencia de la
// de arriba, que guarda el número directo) porque, a diferencia del total
// del mes, la conversión SÍ puede fallar concepto por concepto.
function historicoFlujoEnEuros(conceptoIdsIncluidos) {
  const porMes = {};
  const detallePorMes = {};
  const mesesUsados = new Set();
  const incompletos = new Set();
  state.movimientos.forEach(m => {
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    const mes = String(m.fecha).slice(0, 7);
    const tipoGasto = tipoGastoDe(m.concepto_id);
    const { valor, ok } = convertirAEuros(mes, m.moneda_id, Number(m.monto));
    if (!porMes[mes]) porMes[mes] = filaMetricasVacia();
    const clave = (m.tipo === "ingreso" ? "ingreso" : "gasto") + (tipoGasto === "fijo" ? "Fijo" : "Variable");
    porMes[mes][clave] += valor;
    if (!detallePorMes[mes]) detallePorMes[mes] = {};
    if (!detallePorMes[mes][clave]) detallePorMes[mes][clave] = {};
    if (!detallePorMes[mes][clave][m.concepto_id]) detallePorMes[mes][clave][m.concepto_id] = { total: 0, incompleto: false };
    detallePorMes[mes][clave][m.concepto_id].total += valor;
    if (!ok) { detallePorMes[mes][clave][m.concepto_id].incompleto = true; incompletos.add(mes); }
    mesesUsados.add(mes);
  });
  return { porMes, detallePorMes, mesesUsados, incompletos };
}

// Junta el desglose por concepto de una celda del histórico (mismo insumo
// que arma detallePorMes de arriba) en las líneas que muestra el popup del
// botón "i". Cada entrada puede ser un número puntual (histórico por
// moneda) o un objeto { total, incompleto } (histórico en euros) — se
// admiten los dos formatos acá para no duplicar esta función.
function lineasPorConceptoHistoricoFlujo(porConcepto, unidad) {
  const ids = Object.keys(porConcepto).sort((a, b) => nombreConceptoOrdenable(a).localeCompare(nombreConceptoOrdenable(b)));
  if (ids.length === 0) return [{ texto: "Sin movimientos este mes", monto: "" }];
  return ids.map(id => {
    const entrada = porConcepto[id];
    const total = typeof entrada === "number" ? entrada : entrada.total;
    const incompleto = typeof entrada === "number" ? false : entrada.incompleto;
    return { texto: nombreConceptoOrdenable(id) + (incompleto ? " ⚠" : ""), monto: `${total.toFixed(2)}${unidad}` };
  });
}

// Arma el detalle (botón "i") de UNA celda de la Histórica de Flujo de caja
// — a pedido de Nadia, mismo botón "i" que ya tiene la Histórica de
// Distribución (ver celdaImporte/registrarDetalle de distribucion.js).
// Para las seis columnas de importe (Ingresos/Gastos totales-fijos-
// variables) el detalle es por CONCEPTO, igual que en Mensual (ver
// detalleFijoVariable más arriba); "Ingresos/Gastos totales" combina fijo +
// variable (un concepto es siempre uno u otro, nunca los dos, así que no
// hace falta sumarlos clave a clave). Las tres columnas derivadas
// (Proporción de gastos/% Ahorro/Cantidad ahorrada) no suman por concepto
// —son una comparación entre dos totales, no un total en sí—, así que
// muestran Ingresos totales contra Gastos totales de ese mes.
// Se guarda en la MISMA lista que usa Mensual (detallesFijoVariable, prefijo
// "fijovar"): el listener de setupFlujoCaja ya escucha ese prefijo, así que
// no hace falta uno nuevo para la Histórica.
function detalleCeldaHistoricoFlujo(columna, mes, metricas, detalleMes, unidad) {
  const titulo = `${columna.tituloCompleto} — ${formatoMesLegible(mes)}`;
  let grupos;
  if (columna.clave === "ingresoTotal" || columna.clave === "gastoTotal") {
    const claveFijo = columna.clave === "ingresoTotal" ? "ingresoFijo" : "gastoFijo";
    const claveVariable = columna.clave === "ingresoTotal" ? "ingresoVariable" : "gastoVariable";
    const fusion = {
      ...((detalleMes && detalleMes[claveFijo]) || {}),
      ...((detalleMes && detalleMes[claveVariable]) || {}),
    };
    grupos = [{ etiqueta: null, lineas: lineasPorConceptoHistoricoFlujo(fusion, unidad) }];
  } else if (["ingresoFijo", "ingresoVariable", "gastoFijo", "gastoVariable"].includes(columna.clave)) {
    grupos = [{ etiqueta: null, lineas: lineasPorConceptoHistoricoFlujo((detalleMes && detalleMes[columna.clave]) || {}, unidad) }];
  } else {
    grupos = [{
      etiqueta: null,
      lineas: [
        { texto: "Ingresos totales", monto: `${metricas.ingresoTotal.toFixed(2)}${unidad}` },
        { texto: "Gastos totales", monto: `${metricas.gastoTotal.toFixed(2)}${unidad}` },
      ],
    }];
  }
  return registrarDetalle(detallesFijoVariable, "fijovar", titulo, grupos);
}

// Celda de importe (columnas de Ingresos/Gastos): mismo criterio de color
// que el resto de la app (celdaImporte, importada de distribucion.js) —
// verde si es mayor a cero, rojo si es menor, guión gris en cero. Con botón
// "i" (a pedido de Nadia, mismo que en la Histórica de Distribución) que
// abre el desglose por concepto de esa celda.
function celdaMontoHistoricoFlujo(v, incompleto, detalleRef) {
  return celdaImporte(v, false, incompleto, detalleRef);
}

// Celda de porcentaje (Proporción de gastos / % Ahorro): "–" si ese mes no
// tuvo ingresos (no se puede calcular "% de qué"). "modoColor" decide cómo
// se pinta: "signo" (% Ahorro: ahorrar es positivo=verde, gastar de más es
// negativo=rojo) o "gastoVsIngreso" (Proporción de gastos: gastar MENOS del
// 100% de lo que entró es lo bueno=verde, 100% o más es rojo — a pedido de
// Nadia, no se pinta según el signo del número sino contra ese umbral, ya
// que un porcentaje siempre es positivo). Mismo armado de valor-espejo/
// valor-numero/valor-adornos que celdaImporte (con su mismo botón "i", si
// se pasa detalleRef), para que las columnas se alineen igual que las de
// importe.
function celdaPorcentajeHistoricoFlujo(v, modoColor, incompleto, detalleRef) {
  const marca = incompleto
    ? `<span class="valor-incompleto" title="Falta cargar el tipo de cambio de alguna moneda para este mes, en Configuración &gt; Tipo de cambio">⚠</span>`
    : "";
  const boton = detalleRef
    ? `<button type="button" class="btn-detalle" data-detalle="${detalleRef}" title="Ver el detalle de este total">i</button>`
    : "";
  const espejo = `<span class="valor-espejo">${marca}</span>`;
  const adornos = `<span class="valor-adornos">${boton}</span>`;
  if (v == null) return `<td class="valor-cero"><span class="valor-wrap">${espejo}<span class="valor-numero">–</span>${adornos}</span></td>`;
  let clase = "";
  if (modoColor === "signo") clase = v > 0 ? "valor-positivo" : v < 0 ? "valor-negativo" : "valor-cero";
  else if (modoColor === "gastoVsIngreso") clase = v < 100 ? "valor-positivo" : "valor-negativo";
  return `<td class="${clase}"><span class="valor-wrap">${espejo}<span class="valor-numero">${v.toFixed(1)}%</span>${adornos}</span></td>`;
}

function celdaHistoricoFlujo(columna, mes, metricas, incompleto, detalleMes, unidad) {
  const detalleRef = detalleCeldaHistoricoFlujo(columna, mes, metricas, detalleMes, unidad);
  if (columna.clave === "proporcionGastos") return celdaPorcentajeHistoricoFlujo(metricas.proporcionGastos, "gastoVsIngreso", incompleto, detalleRef);
  if (columna.clave === "ahorroPct") return celdaPorcentajeHistoricoFlujo(metricas.ahorroPct, "signo", incompleto, detalleRef);
  // Gastos en negativo acá (mismo signo que las tarjetas de Gastos de
  // Mensual); metricas.gastoFijo/gastoVariable/gastoTotal vienen en
  // positivo (ver metricasDelMes).
  if (columna.clave === "gastoTotal") return celdaMontoHistoricoFlujo(-metricas.gastoTotal, incompleto, detalleRef);
  if (columna.clave === "gastoFijo") return celdaMontoHistoricoFlujo(-metricas.gastoFijo, incompleto, detalleRef);
  if (columna.clave === "gastoVariable") return celdaMontoHistoricoFlujo(-metricas.gastoVariable, incompleto, detalleRef);
  return celdaMontoHistoricoFlujo(metricas[columna.clave], incompleto, detalleRef);
}

function tablaHistoricoFlujo(porMes, detallePorMes, mesesUsados, orden, incompletosPorMes, unidad) {
  let listaMeses = Array.from(mesesUsados).sort(); // "YYYY-MM" ordena bien como texto
  if (orden === "desc") listaMeses.reverse();

  // "Mes" ocupa las dos filas del encabezado (rowspan=2), así no queda una
  // celda vacía rara al lado de los títulos de grupo.
  let tabla = `<table class="pivot distrib-pivot pivot-agrupado">` +
    `<tr><th rowspan="2">Mes</th>` +
    GRUPOS_HISTORICO_FLUJO.map(g => `<th colspan="${g.columnas.length}" class="pivot-grupo-titulo">${g.titulo}</th>`).join("") +
    `</tr><tr>` +
    COLUMNAS_HISTORICO_FLUJO.map(c => `<th>${c.tituloCorto}</th>`).join("") +
    `</tr>`;
  listaMeses.forEach(mes => {
    const metricas = metricasDelMes(porMes[mes] || filaMetricasVacia());
    const incompleto = incompletosPorMes ? incompletosPorMes.has(mes) : false;
    const detalleMes = (detallePorMes && detallePorMes[mes]) || {};
    tabla += `<tr><td>${formatoMesLegible(mes)}</td>` +
      COLUMNAS_HISTORICO_FLUJO.map(c => celdaHistoricoFlujo(c, mes, metricas, incompleto, detalleMes, unidad)).join("") +
      `</tr>`;
  });
  tabla += `</table>`;
  return tabla;
}

function renderSeccionHistoricaFlujoMoneda(moneda, conceptoIdsIncluidos, orden) {
  const { porMes, detallePorMes, mesesUsados } = historicoFlujoPorMoneda(moneda.id, conceptoIdsIncluidos);
  if (mesesUsados.size === 0) {
    return `
      <div class="card">
        <details class="collapsible" open>
          <summary>${moneda.nombre}</summary>
          <p class="empty">No hay movimientos en ${moneda.nombre} para los conceptos seleccionados.</p>
        </details>
      </div>`;
  }
  const tabla = tablaHistoricoFlujo(porMes, detallePorMes, mesesUsados, orden, null, " " + moneda.nombre);
  return `
    <div class="card card-ancho">
      <details class="collapsible" open>
        <summary>${moneda.nombre}</summary>
        <div class="pivot-wrap">${tabla}</div>
      </details>
    </div>`;
}

function renderSeccionHistoricaFlujoEuros(conceptoIdsIncluidos, orden) {
  const { porMes, detallePorMes, mesesUsados, incompletos } = historicoFlujoEnEuros(conceptoIdsIncluidos);
  if (mesesUsados.size === 0) {
    return `
      <div class="card">
        <details class="collapsible" open>
          <summary>Total en Euros</summary>
          <p class="empty">No hay movimientos para los conceptos seleccionados.</p>
        </details>
      </div>`;
  }
  const tabla = tablaHistoricoFlujo(porMes, detallePorMes, mesesUsados, orden, incompletos, " €");
  return `
    <div class="card card-ancho">
      <details class="collapsible" open>
        <summary>Total en Euros</summary>
        <div class="pivot-wrap">${tabla}</div>
        <p class="tipo-cambio-nota">⚠ = falta cargar el tipo de cambio de alguna moneda para ese mes, así que esa fila puede estar incompleta.</p>
      </details>
    </div>`;
}

// Punto de entrada de la sub-pestaña Histórica: usa la MISMA lista de
// "Conceptos a incluir" que Mensual (conceptos.incluir_en_flujo_caja, a
// pedido de Nadia — no se pidió una lista separada para cada sub-pestaña) y
// la misma selección de "Monedas a incluir"/"Convertir todo a Euros" de
// Distribución que ya usa Mensual.
function renderHistoricoFlujo() {
  const cont = document.getElementById("flujoHistoricoSecciones");
  if (!cont) return;
  const conceptoIdsIncluidos = new Set(
    state.conceptos.filter(c => c.incluir_en_flujo_caja !== false).map(c => String(c.id))
  );
  if (conceptoIdsIncluidos.size === 0) {
    cont.innerHTML = `<div class="card"><p class="empty">Elegí al menos un concepto arriba para armar el histórico.</p></div>`;
    return;
  }

  if (state.distribucion.convertirEuros) {
    cont.innerHTML = renderSeccionHistoricaFlujoEuros(conceptoIdsIncluidos, state.flujoCaja.ordenHistorico);
    return;
  }

  const monedasIncluidas = state.monedas
    .filter(m => m.incluir_en_distribucion !== false)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  if (monedasIncluidas.length === 0) {
    cont.innerHTML = `<div class="card"><p class="empty">Elegí al menos una moneda en Distribución (o tildá "Convertir todo a Euros") para armar el histórico.</p></div>`;
    return;
  }

  cont.innerHTML = monedasIncluidas
    .map(moneda => renderSeccionHistoricaFlujoMoneda(moneda, conceptoIdsIncluidos, state.flujoCaja.ordenHistorico))
    .join("");
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
  const selOrden = document.getElementById("flujoOrdenHistorico");
  if (selOrden) selOrden.value = state.flujoCaja.ordenHistorico;
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
  renderResumenAhorro("distribResumenAhorro", mes, conceptoIdsIncluidos, monedaIdsIncluidas);
  // Histórica (sub-pestaña separada de Mensual) se re-renderiza siempre
  // acá también, no solo al mostrarla — mismo criterio que usa
  // renderDistribucion() con renderReporte()/renderHistorico().
  renderHistoricoFlujo();
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

  document.getElementById("flujoOrdenHistorico").addEventListener("change", (e) => {
    state.flujoCaja.ordenHistorico = e.target.value;
    renderHistoricoFlujo();
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
