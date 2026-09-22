// Dashboard > Evolución: cómo fue cambiando el patrimonio mes a mes.
//
// Una fila por mes con movimientos cargados, de la más vieja a la más
// nueva. En cada fila, cuánta plata había AL CIERRE de ese mes en cada
// moneda (saldo acumulado: todo lo que entró menos todo lo que salió desde
// el principio hasta ese mes inclusive), el total pasado a euros, y cuánto
// cambió respecto del mes anterior en plata y en porcentaje.
//
// El patrimonio NO se carga a mano (como en la planilla que Nadia usaba
// antes): se calcula solo a partir de los movimientos, así nunca puede
// quedar desactualizado. La conversión a euros usa el tipo de cambio DE ESE
// MES (el mismo criterio que Distribución, y por eso se reusa su
// convertirAEuros en vez de escribir otra fórmula acá); Snapshot es el que
// usa el más reciente, porque no está atado a ningún mes.
//
// "Conceptos a incluir" es la misma selección que Snapshot y Asignación:
// comparten la columna conceptos.incluir_en_snapshot, así lo que se
// destilda en una pantalla se destilda en las otras.
//
// El semáforo de la variación compara contra un porcentaje guardado en la
// tabla configuracion_general, clave "evolucion_umbral_pct" (hoy 5). No hay
// pantalla para cambiarlo: se edita directamente en la base, igual que el
// resto de lo que vive en esa tabla.

import { state } from './state.js';
import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';
import { nombreOrigen, nombreMoneda, nombreConcepto } from './lookups.js';
import { renderCheckboxesTabla } from './check-list.js';
import { formatoMesLegible, convertirAEuros } from './distribucion.js';

const UMBRAL_POR_DEFECTO = 5;

// Mes que se está mirando en el modal de detalle, o null si está cerrado.
let mesAbierto = null;
// Filtros del modal: los mismos criterios que Gastos > Movimientos, menos
// el mes (que ya lo fija la fila desde la que se abrió). Se reinician cada
// vez que se abre el modal.
let filtrosModal = { tipo: "", concepto: "", origen: "", moneda: "" };

function numero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formato(v) {
  return numero(v).toFixed(2);
}

// El porcentaje a partir del cual se considera que el patrimonio "subió".
// Si la fila no está en la base o tiene cualquier cosa, se usa 5.
function umbralPorcentaje() {
  const v = Number(state.configuracionGeneral.evolucion_umbral_pct);
  return Number.isFinite(v) && v >= 0 ? v : UMBRAL_POR_DEFECTO;
}

function conceptosIncluidos() {
  return new Set(
    state.conceptos.filter(c => c.incluir_en_snapshot !== false).map(c => String(c.id))
  );
}

function comentarioDe(mes) {
  const fila = state.evolucionComentarios.find(c => c.mes === mes);
  return fila && fila.comentario != null ? fila.comentario : "";
}

// Verde si creció más que el umbral, ámbar si quedó igual o creció menos,
// rojo si bajó. El primer mes no se compara con nada, así que no tiene
// color (devuelve cadena vacía).
function claseVariacion(porcentaje) {
  if (porcentaje == null) return "";
  if (porcentaje < 0) return "asig-rojo";
  if (porcentaje > umbralPorcentaje()) return "asig-verde";
  return "asig-ambar";
}

// --- El cálculo del patrimonio mes a mes -----------------------------------
//
// Devuelve una fila por mes, en orden, con el saldo acumulado por moneda al
// cierre de ese mes, su total en euros, y la variación contra el mes
// anterior. "incompleto" marca los meses en los que faltó algún tipo de
// cambio: ese pedazo no se cuenta (ni de más ni de menos) y se avisa con ⚠.
export function calcularEvolucion() {
  const incluidos = conceptosIncluidos();
  const movimientos = state.movimientos.filter(m => incluidos.has(String(m.concepto_id)));

  const meses = Array.from(new Set(movimientos.map(m => String(m.fecha).slice(0, 7)))).sort();
  const monedaIds = Array.from(new Set(movimientos.map(m => String(m.moneda_id))))
    .sort((a, b) => nombreMoneda(a).localeCompare(nombreMoneda(b)));

  // Saldo acumulado: se recorren los meses en orden y se va arrastrando lo
  // que había hasta el mes anterior. Es lo que hace que cada fila sea "el
  // patrimonio a esa fecha" y no "lo que se movió ese mes".
  const acumulado = {};
  const filas = [];
  let totalAnterior = null;

  meses.forEach(mes => {
    movimientos
      .filter(m => String(m.fecha).slice(0, 7) === mes)
      .forEach(m => {
        const signo = m.tipo === "ingreso" ? 1 : -1;
        const id = String(m.moneda_id);
        acumulado[id] = (acumulado[id] || 0) + signo * Number(m.monto);
      });

    let total = 0;
    let incompleto = false;
    const porMoneda = {};
    monedaIds.forEach(id => {
      const saldo = acumulado[id] || 0;
      porMoneda[id] = saldo;
      if (!saldo) return;
      const { valor, ok } = convertirAEuros(mes, id, saldo);
      total += valor;
      if (!ok) incompleto = true;
    });

    // La variación no se puede calcular contra el primer mes (no hay mes
    // anterior) ni cuando el mes anterior dio cero (dividir por cero).
    const diferencia = totalAnterior == null ? null : total - totalAnterior;
    const porcentaje = (totalAnterior == null || totalAnterior === 0)
      ? null
      : (total - totalAnterior) / Math.abs(totalAnterior) * 100;

    filas.push({ mes, porMoneda, total, incompleto, diferencia, porcentaje });
    totalAnterior = total;
  });

  return { filas, monedaIds };
}

// --- La tabla ---------------------------------------------------------------

export function renderEvolucion() {
  const tabla = document.getElementById("evolucionTable");
  if (!tabla) return;

  renderCheckboxesTabla(
    "conceptos", state.conceptos, "evolucionConceptosCheckboxes",
    "Todavía no hay conceptos cargados.", "incluir_en_snapshot", true
  );

  const nota = document.getElementById("evolucionNota");
  const { filas, monedaIds } = calcularEvolucion();

  if (filas.length === 0) {
    tabla.innerHTML = `<tr><td class="empty">${
      state.movimientos.length === 0
        ? "Todavía no hay movimientos cargados."
        : "No hay movimientos para los conceptos seleccionados."
    }</td></tr>`;
    if (nota) nota.style.display = "none";
    return;
  }

  if (nota) nota.style.display = filas.some(f => f.incompleto) ? "block" : "none";

  let html = `<thead><tr>
    <th>Mes</th>
    ${monedaIds.map(id => `<th>${nombreMoneda(id)}</th>`).join("")}
    <th>Total (€)</th>
    <th>Variación</th>
    <th>%</th>
    <th></th>
  </tr></thead><tbody>`;

  filas.forEach(f => {
    const clase = claseVariacion(f.porcentaje);
    const tieneNota = comentarioDe(f.mes).trim() !== "" ||
      state.movimientos.some(m => String(m.fecha).slice(0, 7) === f.mes && m.excepcional);

    html += `<tr>
      <td class="evo-mes">${formatoMesLegible(f.mes)}</td>
      ${monedaIds.map(id => `<td>${f.porMoneda[id] ? formato(f.porMoneda[id]) : "–"}</td>`).join("")}
      <td class="evo-total">${f.incompleto ? `<span class="valor-incompleto" title="Falta cargar el tipo de cambio de alguna moneda para este mes, en Configuración > Tipo de cambio">⚠</span> ` : ""}${formato(f.total)}</td>
      <td class="${clase}">${f.diferencia == null ? "–" : formato(f.diferencia)}</td>
      <td class="${clase}">${f.porcentaje == null ? "–" : formato(f.porcentaje) + " %"}</td>
      <td class="evo-acciones">
        <button type="button" class="btn-detalle${tieneNota ? " con-nota" : ""}"
                data-evo-mes="${f.mes}"
                title="${tieneNota ? "Ver el detalle de este mes (tiene anotaciones)" : "Anotar qué pasó este mes"}">i</button>
      </td>
    </tr>`;
  });
  html += "</tbody>";
  tabla.innerHTML = html;

  tabla.querySelectorAll("[data-evo-mes]").forEach(btn => {
    btn.addEventListener("click", () => abrirDetalleMes(btn.dataset.evoMes));
  });

  // Si el modal está abierto (por ejemplo porque se acaba de tildar un
  // movimiento y eso recargó todo), se vuelve a dibujar con los datos
  // nuevos en vez de dejarlo mostrando lo de antes.
  if (mesAbierto) renderDetalleMes();
}

// --- El modal de detalle de un mes -----------------------------------------

function abrirDetalleMes(mes) {
  mesAbierto = mes;
  filtrosModal = { tipo: "", concepto: "", origen: "", moneda: "" };
  poblarFiltrosModal();
  renderDetalleMes();
  document.getElementById("evolucionDetalleOverlay").classList.add("open");
}

function cerrarDetalleMes() {
  document.getElementById("evolucionDetalleOverlay").classList.remove("open");
  mesAbierto = null;
}

function poblarFiltrosModal() {
  const opciones = (lista) => `<option value="">Todos</option>` +
    lista.map(x => `<option value="${x.id}">${x.nombre}</option>`).join("");
  document.getElementById("evoFiltroConcepto").innerHTML = opciones(state.conceptos);
  document.getElementById("evoFiltroOrigen").innerHTML = opciones(state.origenes);
  document.getElementById("evoFiltroMoneda").innerHTML = opciones(state.monedas);
  document.getElementById("evoFiltroTipo").value = "";
  document.getElementById("evoFiltroConcepto").value = "";
  document.getElementById("evoFiltroOrigen").value = "";
  document.getElementById("evoFiltroMoneda").value = "";
}

// Los movimientos del mes que se está mirando, pasados por los filtros del
// modal. El mes no es un filtro: lo fija la fila desde la que se abrió.
function movimientosDelMes() {
  return state.movimientos.filter(m => {
    if (String(m.fecha).slice(0, 7) !== mesAbierto) return false;
    if (filtrosModal.tipo && m.tipo !== filtrosModal.tipo) return false;
    if (filtrosModal.concepto && String(m.concepto_id) !== filtrosModal.concepto) return false;
    if (filtrosModal.origen && String(m.origen_id) !== filtrosModal.origen) return false;
    if (filtrosModal.moneda && String(m.moneda_id) !== filtrosModal.moneda) return false;
    return true;
  });
}

// Suma en euros de los movimientos marcados como excepcionales de un tipo.
// Se suma en euros porque los movimientos pueden estar en monedas distintas
// y sumarlos en crudo no querría decir nada; se usa el tipo de cambio de
// ese mes, igual que el resto de la pantalla.
function totalExcepcionales(tipo) {
  let total = 0;
  let incompleto = false;
  state.movimientos
    .filter(m => String(m.fecha).slice(0, 7) === mesAbierto && m.excepcional && m.tipo === tipo)
    .forEach(m => {
      const { valor, ok } = convertirAEuros(mesAbierto, m.moneda_id, Number(m.monto));
      total += valor;
      if (!ok) incompleto = true;
    });
  return { total, incompleto };
}

function filaMovimiento(m) {
  return `<label class="evo-mov">
    <input type="checkbox" data-evo-excepcional="${m.id}" ${m.excepcional ? "checked" : ""} />
    <span class="evo-mov-info">
      <span class="evo-mov-concepto">${nombreConcepto(m.concepto_id)}</span>
      <span class="evo-mov-detalle">${m.fecha} · ${nombreOrigen(m.origen_id)}${m.descripcion ? " · " + m.descripcion : ""}</span>
    </span>
    <span class="evo-mov-monto">${formato(m.monto)} ${nombreMoneda(m.moneda_id)}</span>
  </label>`;
}

function renderDetalleMes() {
  if (!mesAbierto) return;
  document.getElementById("evolucionDetalleTitulo").textContent = formatoMesLegible(mesAbierto);

  const movimientos = movimientosDelMes();
  const ingresos = movimientos.filter(m => m.tipo === "ingreso");
  const egresos = movimientos.filter(m => m.tipo === "egreso");

  const columna = (titulo, lista) => `
    <div class="evo-columna">
      <h4>${titulo}</h4>
      ${lista.length === 0
        ? `<div class="empty">Ningún movimiento con estos filtros.</div>`
        : lista.map(filaMovimiento).join("")}
    </div>`;

  document.getElementById("evolucionDetalleListas").innerHTML =
    columna("Ingresos", ingresos) + columna("Egresos", egresos);

  const sumaIngresos = totalExcepcionales("ingreso");
  const sumaEgresos = totalExcepcionales("egreso");
  const diferencia = sumaIngresos.total - sumaEgresos.total;
  const aviso = (sumaIngresos.incompleto || sumaEgresos.incompleto)
    ? ` <span class="valor-incompleto" title="Falta el tipo de cambio de alguna moneda para este mes, así que esta suma está incompleta">⚠</span>`
    : "";

  document.getElementById("evolucionDetalleTotales").innerHTML = `
    <div class="evo-total-linea"><span>Ingresos excepcionales</span><span class="asig-verde">${formato(sumaIngresos.total)} €${sumaIngresos.incompleto ? aviso : ""}</span></div>
    <div class="evo-total-linea"><span>Egresos excepcionales</span><span class="asig-rojo">${formato(sumaEgresos.total)} €${sumaEgresos.incompleto ? aviso : ""}</span></div>
    <div class="evo-total-linea evo-total-diferencia">
      <span>Diferencia</span>
      <span class="${diferencia >= 0 ? "asig-verde" : "asig-rojo"}">${formato(diferencia)} €</span>
    </div>`;

  const textarea = document.getElementById("evolucionComentario");
  // Solo se pisa el texto si no se está escribiendo justo en él: si no, un
  // re-render en medio de la escritura borraría lo tipeado.
  if (document.activeElement !== textarea) textarea.value = comentarioDe(mesAbierto);

  document.getElementById("evolucionDetalleListas")
    .querySelectorAll("[data-evo-excepcional]")
    .forEach(chk => chk.addEventListener("change", () => marcarExcepcional(chk)));
}

async function marcarExcepcional(chk) {
  const id = chk.dataset.evoExcepcional;
  const { error } = await getClient()
    .from("movimientos").update({ excepcional: chk.checked }).eq("id", id);
  if (error) {
    alert("No se pudo guardar: " + error.message);
    chk.checked = !chk.checked;
    return;
  }
  await cargarTodo();
}

async function guardarComentario() {
  if (!mesAbierto) return;
  const texto = document.getElementById("evolucionComentario").value.trim();
  if (texto === comentarioDe(mesAbierto)) return;

  const { error } = await getClient()
    .from("evolucion_comentarios")
    .upsert({ mes: mesAbierto, comentario: texto === "" ? null : texto }, { onConflict: "mes" });
  if (error) { alert("No se pudo guardar el comentario: " + error.message); return; }
  await cargarTodo();
}

export function setupEvolucion() {
  const overlay = document.getElementById("evolucionDetalleOverlay");
  if (!overlay) return;

  document.getElementById("evolucionDetalleClose").addEventListener("click", cerrarDetalleMes);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cerrarDetalleMes(); });

  ["evoFiltroTipo", "evoFiltroConcepto", "evoFiltroOrigen", "evoFiltroMoneda"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => {
      filtrosModal = {
        tipo: document.getElementById("evoFiltroTipo").value,
        concepto: document.getElementById("evoFiltroConcepto").value,
        origen: document.getElementById("evoFiltroOrigen").value,
        moneda: document.getElementById("evoFiltroMoneda").value,
      };
      renderDetalleMes();
    });
  });

  document.getElementById("evoLimpiarFiltros").addEventListener("click", () => {
    poblarFiltrosModal();
    filtrosModal = { tipo: "", concepto: "", origen: "", moneda: "" };
    renderDetalleMes();
  });

  // El comentario se guarda al salir del campo, como el resto de la app.
  document.getElementById("evolucionComentario").addEventListener("change", guardarComentario);
}
