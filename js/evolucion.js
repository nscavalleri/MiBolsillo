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
import { nombreOrigen, nombreMoneda, nombreConcepto, contieneTexto } from './lookups.js';
import { renderCheckboxesTabla } from './check-list.js';
import { formatoMesLegible, convertirAEuros } from './distribucion.js';

const UMBRAL_POR_DEFECTO = 5;

// Mes que se está mirando en el modal de detalle, o null si está cerrado.
let mesAbierto = null;
// Cuál de las dos pantallas del modal se está mostrando: "resumen" (solo lo
// ya marcado) o "buscar" (los filtros y los candidatos a agregar).
let vistaModal = "resumen";
// Desde qué columna se tocó "Agregar": eso fija el tipo de lo que se busca,
// así que el tipo no es un filtro más.
let tipoBuscado = "ingreso";
// Filtros del buscador: los mismos criterios que Gastos > Movimientos, menos
// el mes (que lo fija la fila) y menos el tipo (que lo fija la columna).
let filtrosModal = { texto: "", concepto: "", origen: "", moneda: "" };

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

// Hay dos comentarios por mes, uno para los ingresos y otro para los
// egresos (columnas comentario_ingresos / comentario_egresos).
function comentarioDe(mes, tipo) {
  const fila = state.evolucionComentarios.find(c => c.mes === mes);
  if (!fila) return "";
  const valor = tipo === "ingreso" ? fila.comentario_ingresos : fila.comentario_egresos;
  return valor != null ? valor : "";
}

function tieneComentarios(mes) {
  return comentarioDe(mes, "ingreso").trim() !== "" || comentarioDe(mes, "egreso").trim() !== "";
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
    const tieneNota = tieneComentarios(f.mes) ||
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
//
// Tiene dos pantallas adentro. La primera ("resumen") muestra SOLO los
// movimientos ya marcados como excepcionales, las sumas y el comentario: es
// la foto del mes, sin ruido. La segunda ("buscar") aparece recién al tocar
// "Agregar" en una de las dos columnas, y ahí sí están los filtros y la
// lista de candidatos. Fue un pedido explícito: ver la lista entera de
// movimientos del mes en la pantalla principal tapaba lo importante.

function abrirDetalleMes(mes) {
  mesAbierto = mes;
  vistaModal = "resumen";
  renderDetalleMes();
  document.getElementById("evolucionDetalleOverlay").classList.add("open");
}

function cerrarDetalleMes() {
  document.getElementById("evolucionDetalleOverlay").classList.remove("open");
  mesAbierto = null;
  vistaModal = "resumen";
}

function poblarFiltrosModal() {
  const opciones = (lista) => `<option value="">Todos</option>` +
    lista.map(x => `<option value="${x.id}">${x.nombre}</option>`).join("");
  document.getElementById("evoFiltroConcepto").innerHTML = opciones(state.conceptos);
  document.getElementById("evoFiltroOrigen").innerHTML = opciones(state.origenes);
  document.getElementById("evoFiltroMoneda").innerHTML = opciones(state.monedas);
}

function movimientosDelMes(tipo) {
  return state.movimientos.filter(m =>
    String(m.fecha).slice(0, 7) === mesAbierto && m.tipo === tipo);
}

// Suma en euros de los movimientos marcados como excepcionales de un tipo.
// Se suma en euros porque los movimientos pueden estar en monedas distintas
// y sumarlos en crudo no querría decir nada; se usa el tipo de cambio de
// ese mes, igual que el resto de la pantalla.
function totalExcepcionales(tipo) {
  let total = 0;
  let incompleto = false;
  movimientosDelMes(tipo).filter(m => m.excepcional).forEach(m => {
    const { valor, ok } = convertirAEuros(mesAbierto, m.moneda_id, Number(m.monto));
    total += valor;
    if (!ok) incompleto = true;
  });
  return { total, incompleto };
}

function datosMovimiento(m) {
  return `<span class="evo-mov-info">
      <span class="evo-mov-concepto">${nombreConcepto(m.concepto_id)}</span>
      <span class="evo-mov-detalle">${m.fecha} · ${nombreOrigen(m.origen_id)}${m.descripcion ? " · " + m.descripcion : ""}</span>
    </span>
    <span class="evo-mov-monto">${formato(m.monto)} ${nombreMoneda(m.moneda_id)}</span>`;
}

export function renderDetalleMes() {
  if (!mesAbierto) return;
  const enResumen = vistaModal === "resumen";
  document.getElementById("evoVistaResumen").style.display = enResumen ? "block" : "none";
  document.getElementById("evoVistaBuscar").style.display = enResumen ? "none" : "block";
  // La flecha de volver solo tiene sentido en el buscador; en el resumen la
  // única salida es la ✕.
  document.getElementById("evoVolverAtras").style.display = enResumen ? "none" : "block";
  if (enResumen) renderResumenMes();
  else renderBuscador();
}

function renderResumenMes() {
  document.getElementById("evolucionDetalleTitulo").textContent =
    `Movimientos excepcionales de ${formatoMesLegible(mesAbierto)}`;

  const columna = (titulo, tipo) => {
    const lista = movimientosDelMes(tipo).filter(m => m.excepcional);
    return `<div class="evo-columna">
      <div class="evo-columna-titulo">
        <h4>${titulo}</h4>
        <button type="button" class="evo-agregar" data-evo-agregar="${tipo}">+ Agregar</button>
      </div>
      ${lista.length === 0
        ? `<div class="empty">Todavía no agregaste ninguno.</div>`
        : lista.map(m => `<div class="evo-mov">
            ${datosMovimiento(m)}
            <button type="button" class="evo-quitar" data-evo-quitar="${m.id}" title="Sacarlo de los excepcionales">✕</button>
          </div>`).join("")}
    </div>`;
  };

  document.getElementById("evolucionDetalleListas").innerHTML =
    columna("Ingresos", "ingreso") + columna("Egresos", "egreso");

  const sumaIngresos = totalExcepcionales("ingreso");
  const sumaEgresos = totalExcepcionales("egreso");
  const diferencia = sumaIngresos.total - sumaEgresos.total;
  const aviso = `<span class="valor-incompleto" title="Falta el tipo de cambio de alguna moneda para este mes, así que esta suma está incompleta">⚠</span> `;

  document.getElementById("evolucionDetalleTotales").innerHTML = `
    <div class="evo-total-linea"><span>Ingresos excepcionales</span><span class="asig-verde">${sumaIngresos.incompleto ? aviso : ""}${formato(sumaIngresos.total)} €</span></div>
    <div class="evo-total-linea"><span>Egresos excepcionales</span><span class="asig-rojo">${sumaEgresos.incompleto ? aviso : ""}${formato(sumaEgresos.total)} €</span></div>
    <div class="evo-total-linea evo-total-diferencia">
      <span>Diferencia</span>
      <span class="${diferencia >= 0 ? "asig-verde" : "asig-rojo"}">${formato(diferencia)} €</span>
    </div>`;

  // Solo se pisa el texto si no se está escribiendo justo en él: si no, un
  // re-render en medio de la escritura borraría lo tipeado.
  [["evolucionComentarioIngresos", "ingreso"], ["evolucionComentarioEgresos", "egreso"]].forEach(([id, tipo]) => {
    const textarea = document.getElementById(id);
    if (document.activeElement !== textarea) textarea.value = comentarioDe(mesAbierto, tipo);
  });

  document.querySelectorAll("[data-evo-agregar]").forEach(btn => {
    btn.addEventListener("click", () => {
      tipoBuscado = btn.dataset.evoAgregar;
      vistaModal = "buscar";
      filtrosModal = { texto: "", concepto: "", origen: "", moneda: "" };
      poblarFiltrosModal();
      document.getElementById("evoFiltroTexto").value = "";
      renderDetalleMes();
    });
  });
  document.querySelectorAll("[data-evo-quitar]").forEach(btn => {
    btn.addEventListener("click", () => marcarExcepcional(btn.dataset.evoQuitar, false));
  });
}

function renderBuscador() {
  document.getElementById("evolucionDetalleTitulo").textContent =
    `Agregar ${tipoBuscado === "ingreso" ? "ingresos" : "egresos"} de ${formatoMesLegible(mesAbierto)}`;

  // Solo los que todavía no están agregados: una vez que se agrega uno,
  // desaparece de la lista y ya está del otro lado.
  const candidatos = movimientosDelMes(tipoBuscado).filter(m => {
    if (m.excepcional) return false;
    if (filtrosModal.concepto && String(m.concepto_id) !== filtrosModal.concepto) return false;
    if (filtrosModal.origen && String(m.origen_id) !== filtrosModal.origen) return false;
    if (filtrosModal.moneda && String(m.moneda_id) !== filtrosModal.moneda) return false;
    if (filtrosModal.texto && !contieneTexto(m.descripcion, filtrosModal.texto)) return false;
    return true;
  });

  document.getElementById("evoResultados").innerHTML = candidatos.length === 0
    ? `<div class="empty">No quedan ${tipoBuscado === "ingreso" ? "ingresos" : "egresos"} de este mes para agregar con estos filtros.</div>`
    : candidatos.map(m => `<button type="button" class="evo-mov evo-candidato" data-evo-sumar="${m.id}">
        ${datosMovimiento(m)}
        <span class="evo-mas">+</span>
      </button>`).join("");

  document.getElementById("evoResultados").querySelectorAll("[data-evo-sumar]").forEach(btn => {
    btn.addEventListener("click", () => marcarExcepcional(btn.dataset.evoSumar, true));
  });
}

async function marcarExcepcional(id, valor) {
  const { error } = await getClient()
    .from("movimientos").update({ excepcional: valor }).eq("id", id);
  if (error) { alert("No se pudo guardar: " + error.message); return; }
  await cargarTodo();
}

async function guardarComentario(tipo) {
  if (!mesAbierto) return;
  const id = tipo === "ingreso" ? "evolucionComentarioIngresos" : "evolucionComentarioEgresos";
  const texto = document.getElementById(id).value.trim();
  if (texto === comentarioDe(mesAbierto, tipo)) return;

  // Se manda solo la columna que cambió: así guardar el comentario de los
  // ingresos no pisa el de los egresos ni al revés.
  const campo = tipo === "ingreso" ? "comentario_ingresos" : "comentario_egresos";
  const { error } = await getClient()
    .from("evolucion_comentarios")
    .upsert({ mes: mesAbierto, [campo]: texto === "" ? null : texto }, { onConflict: "mes" });
  if (error) { alert("No se pudo guardar el comentario: " + error.message); return; }
  await cargarTodo();
}

export function setupEvolucion() {
  const overlay = document.getElementById("evolucionDetalleOverlay");
  if (!overlay) return;

  document.getElementById("evolucionDetalleClose").addEventListener("click", cerrarDetalleMes);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cerrarDetalleMes(); });

  const volverAlResumen = () => { vistaModal = "resumen"; renderDetalleMes(); };
  document.getElementById("evoVolver").addEventListener("click", volverAlResumen);
  document.getElementById("evoVolverAtras").addEventListener("click", volverAlResumen);

  // Igual que en Gastos > Movimientos: filtra mientras se escribe.
  document.getElementById("evoFiltroTexto").addEventListener("input", () => {
    filtrosModal.texto = document.getElementById("evoFiltroTexto").value;
    renderDetalleMes();
  });

  ["evoFiltroConcepto", "evoFiltroOrigen", "evoFiltroMoneda"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => {
      filtrosModal = {
        texto: document.getElementById("evoFiltroTexto").value,
        concepto: document.getElementById("evoFiltroConcepto").value,
        origen: document.getElementById("evoFiltroOrigen").value,
        moneda: document.getElementById("evoFiltroMoneda").value,
      };
      renderDetalleMes();
    });
  });

  document.getElementById("evoLimpiarFiltros").addEventListener("click", () => {
    ["evoFiltroTexto", "evoFiltroConcepto", "evoFiltroOrigen", "evoFiltroMoneda"].forEach(id => {
      document.getElementById(id).value = "";
    });
    filtrosModal = { texto: "", concepto: "", origen: "", moneda: "" };
    renderDetalleMes();
  });

  // Los comentarios se guardan al salir del campo, como el resto de la app.
  document.getElementById("evolucionComentarioIngresos")
    .addEventListener("change", () => guardarComentario("ingreso"));
  document.getElementById("evolucionComentarioEgresos")
    .addEventListener("change", () => guardarComentario("egreso"));
}
