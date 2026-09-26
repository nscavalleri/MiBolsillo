// Configuración > Conceptos / Monedas / Orígenes: listar, activar/desactivar,
// editar (renombrar) y eliminar cada ítem; agregar ítems nuevos.

import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';
import { pedirConfirmacion } from './confirmar-modal.js';
import { abrirModalEditar } from './editar-modal.js';
import { avisarError } from './aviso-modal.js';
import { nombreMoneda, nombreOrigen } from './lookups.js';

// Título lindo para el modal de editar, según la tabla ("Editar concepto",
// no "Editar conceptos").
const TITULO_EDITAR = { conceptos: "Editar concepto", monedas: "Editar moneda", origenes: "Editar origen" };

// Conceptos "de sistema": la propia app los usa para cargar movimientos
// automáticos — "Cambio de moneda" desde js/cambio-moneda.js y
// "Conciliación" desde el botón "Δ" de Gastos > Conciliación
// (js/conciliacion.js) — buscándolos por NOMBRE, igual que esEuros() en
// distribucion.js (los ids cambian de instalación a instalación). Si Nadia
// les cambiara acá el tipo fijo/variable, los desactivara o los eliminara,
// esas pantallas dejarían de encontrarlos y la carga automática se
// rompería; por eso su fila aparece grisada, sin tipo ni interruptor
// tocables y sin botones de editar ni eliminar — nada más un ícono con la
// explicación al pasar el mouse (se acepta "conciliación" con o sin tilde,
// igual que en conciliacion.js).
const CONCEPTOS_SISTEMA = {
  "cambio de moneda": "Concepto del sistema para cargar automáticamente los movimientos de cambio.",
  "conciliación": "Concepto del sistema para cargar automáticamente los movimientos de conciliación.",
  "conciliacion": "Concepto del sistema para cargar automáticamente los movimientos de conciliación.",
};

function descripcionConceptoSistema(nombre) {
  return CONCEPTOS_SISTEMA[String(nombre || "").trim().toLowerCase()] || null;
}

// Nadia pidió poder ver, en la lista, qué moneda/origen por defecto tiene
// cargado cada concepto (hasta ahora solo se veía adentro del modal de
// editar) "como con una etiqueta con el valor elegido". Se arman hasta dos
// etiquetas chicas (una por cada campo que SÍ tenga algo cargado; si un
// concepto no tiene ninguno de los dos, no se dibuja nada acá — mismo
// criterio que la descripción opcional de Reservas, que tampoco muestra
// una línea vacía). El nombre de la moneda/origen sale de lookups.js, así
// que si algún día se referenciara un id ya borrado se vería
// "(moneda eliminada)"/"(origen eliminado)" en vez de romperse.
function etiquetasDefectoConcepto(it) {
  const partes = [];
  if (it.moneda_defecto_id != null) {
    partes.push(`<span class="chip-defecto">Moneda: ${nombreMoneda(it.moneda_defecto_id)}</span>`);
  }
  if (it.origen_defecto_id != null) {
    partes.push(`<span class="chip-defecto">Origen: ${nombreOrigen(it.origen_defecto_id)}</span>`);
  }
  return partes.length ? `<div class="config-item-etiquetas">${partes.join("")}</div>` : "";
}

export function renderConfigLista(tabla, items, contenedorId) {
  const el = document.getElementById(contenedorId);
  // Por ahora "Tipo" (Fijo/Variable) es un campo propio de Conceptos, no de
  // Monedas ni Orígenes — por eso esta función (compartida entre las tres)
  // solo agrega la columna y el encabezado cuando tabla === "conceptos".
  const esConceptos = tabla === "conceptos";
  if (items.length === 0) {
    el.innerHTML = `<div class="empty">Todavía no agregaste nada acá.</div>`;
    return;
  }
  const encabezado = esConceptos
    ? `<div class="config-item config-list-header">
         <span class="col-nombre"></span>
         <span class="col-tipo">Tipo</span>
         <span class="col-activo">Estado</span>
         <span class="col-acciones"></span>
       </div>`
    : "";
  el.innerHTML = encabezado + items.map(it => {
    const esFijo = it.tipo_gasto === "fijo";
    const descripcionSistema = esConceptos ? descripcionConceptoSistema(it.nombre) : null;
    // Chip de texto (no otro switch mudo al lado del de Activo): dice "Fijo"
    // o "Variable" directamente, así no hace falta memorizar qué lado es
    // cuál — el encabezado de arriba es un refuerzo, no la única pista.
    // Para un concepto de sistema es un <span>, no un <button>: no tiene
    // data-toggle-tipo, así que ni siquiera queda enganchado ningún listener.
    const chipTipo = esConceptos
      ? (descripcionSistema
          ? `<span class="tipo-chip tipo-chip-disabled ${esFijo ? "fijo" : "variable"}">${esFijo ? "Fijo" : "Variable"}</span>`
          : `<button type="button" class="tipo-chip ${esFijo ? "fijo" : "variable"}" data-toggle-tipo="${tabla}:${it.id}" title="Tocá para cambiar entre Fijo y Variable">${esFijo ? "Fijo" : "Variable"}</button>`)
      : "";
    const etiquetasDefecto = esConceptos ? etiquetasDefectoConcepto(it) : "";

    if (descripcionSistema) {
      // Fila grisada de un concepto de sistema: se ve el nombre y el estado
      // actual (tipo/activo) pero nada es tocable — ni tipo, ni el
      // interruptor (queda con "disabled"), ni editar/eliminar (esos
      // botones directamente no se dibujan). El "title" de la fila entera
      // muestra la explicación al pasar el mouse por cualquier parte,
      // reforzada con el ícono ℹ del lugar donde iban editar/eliminar.
      return `
      <div class="config-item config-item-sistema" title="${descripcionSistema}">
        <div class="info">
          <span class="nombre ${it.activo ? "" : "inactivo"}">${it.nombre}</span>
          ${etiquetasDefecto}
        </div>
        ${chipTipo}
        <label class="switch switch-disabled">
          <input type="checkbox" ${it.activo ? "checked" : ""} disabled />
          <span class="slider"></span>
        </label>
        <span class="icon-btn icon-btn-info" title="${descripcionSistema}">ℹ</span>
      </div>
    `;
    }

    return `
    <div class="config-item">
      <div class="info">
        <span class="nombre ${it.activo ? "" : "inactivo"}">${it.nombre}</span>
        ${etiquetasDefecto}
      </div>
      ${chipTipo}
      <label class="switch">
        <input type="checkbox" ${it.activo ? "checked" : ""} data-toggle="${tabla}:${it.id}" />
        <span class="slider"></span>
      </label>
      <button class="icon-btn" data-editar-item="${tabla}:${it.id}" title="Editar">✎</button>
      <button class="icon-btn" data-eliminar="${tabla}:${it.id}" title="Eliminar">🗑</button>
    </div>
  `;
  }).join("");

  el.querySelectorAll("[data-toggle-tipo]").forEach(chip => {
    chip.addEventListener("click", async () => {
      const [tab, id] = chip.dataset.toggleTipo.split(":");
      const actual = items.find(x => String(x.id) === String(id));
      const nuevoTipo = actual && actual.tipo_gasto === "fijo" ? "variable" : "fijo";
      const { error } = await getClient().from(tab).update({ tipo_gasto: nuevoTipo }).eq("id", id);
      if (error) { avisarError("Error: " + error.message); return; }
      await cargarTodo();
    });
  });

  el.querySelectorAll("[data-toggle]").forEach(chk => {
    chk.addEventListener("change", async () => {
      const [tab, id] = chk.dataset.toggle.split(":");
      const { error } = await getClient().from(tab).update({ activo: chk.checked }).eq("id", id);
      if (error) { avisarError("Error: " + error.message); return; }
      await cargarTodo();
    });
  });
  el.querySelectorAll("[data-editar-item]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [tab, id] = btn.dataset.editarItem.split(":");
      const actual = items.find(x => String(x.id) === String(id));
      if (!actual) return;
      // Moneda/origen por defecto: solo para Conceptos (ver el comentario
      // de arriba de editar-modal.js). Acá no hace falta pasar la lista de
      // monedas/orígenes: el modal ya la lee de state.js directamente.
      const extra = tab === "conceptos"
        ? {
            campoMoneda: "moneda_defecto_id", monedaId: actual.moneda_defecto_id,
            campoOrigen: "origen_defecto_id", origenId: actual.origen_defecto_id,
          }
        : {};
      abrirModalEditar({ tabla: tab, id, nombre: actual.nombre, titulo: TITULO_EDITAR[tab], ...extra });
    });
  });
  el.querySelectorAll("[data-eliminar]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const [tab, id] = btn.dataset.eliminar.split(":");
      const actual = items.find(x => String(x.id) === String(id));
      const confirmado = await pedirConfirmacion({
        titulo: "¿Eliminar esta opción?",
        lineas: [
          `Vas a eliminar <strong>${actual ? actual.nombre : "esta opción"}</strong>.`,
          "Si ya está usada en algún movimiento, la base no va a dejar borrarla. En ese caso podés desactivarla con el interruptor: deja de aparecer como opción y no se pierde el historial.",
        ],
        peligro: true,
        textoSi: "Sí, eliminala",
        textoNo: "No, dejala",
      });
      if (!confirmado) return;
      const { error } = await getClient().from(tab).delete().eq("id", id);
      if (error) {
        // 23503 = violación de clave foránea: significa que este
        // concepto/moneda/origen ya está usado en algún movimiento (o
        // conciliación), así que la base de datos no deja borrarlo. En ese
        // caso se avisa y se sugiere desactivarlo en vez de eliminarlo.
        if (error.code === "23503") {
          avisarError("No se puede eliminar: ya está usado en movimientos cargados. Desactivalo con el interruptor de la izquierda para que deje de aparecer como opción, sin perder el historial.");
        } else {
          avisarError("Error: " + error.message);
        }
        return;
      }
      await cargarTodo();
    });
  });
}

export function setupAddItemRows() {
  document.querySelectorAll(".add-item-row").forEach(row => {
    const btn = row.querySelector("button[data-tabla]");
    // La fila de "agregar" de Reservas también usa la clase .add-item-row
    // (mismo estilo visual), pero se arma y se conecta aparte en
    // reservas.js porque tiene un campo más (cantidad); acá se salta, si
    // no explotaba tratando de leer data-tabla/data-input de un botón que
    // no los tiene.
    if (!btn) return;
    const tabla = btn.dataset.tabla;
    const input = document.getElementById(btn.dataset.input);

    async function agregarItem() {
      const nombre = input.value.trim();
      if (!nombre) return;
      const { error } = await getClient().from(tabla).insert({ nombre });
      if (error) { avisarError("Error agregando: " + error.message); return; }
      input.value = "";
      await cargarTodo();
    }

    btn.addEventListener("click", agregarItem);
    // Enter en el campo de texto agrega el ítem sin necesidad de hacer clic
    // en el botón (igual para conceptos, monedas y orígenes).
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      agregarItem();
    });
  });
}
