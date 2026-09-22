// Configuración > Conceptos / Monedas / Orígenes: listar, activar/desactivar,
// editar (renombrar) y eliminar cada ítem; agregar ítems nuevos.

import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';
import { abrirModalEditar } from './editar-modal.js';

// Título lindo para el modal de editar, según la tabla ("Editar concepto",
// no "Editar conceptos").
const TITULO_EDITAR = { conceptos: "Editar concepto", monedas: "Editar moneda", origenes: "Editar origen" };

export function renderConfigLista(tabla, items, contenedorId) {
  const el = document.getElementById(contenedorId);
  if (items.length === 0) {
    el.innerHTML = `<div class="empty">Todavía no agregaste nada acá.</div>`;
    return;
  }
  el.innerHTML = items.map(it => `
    <div class="config-item">
      <span class="nombre ${it.activo ? "" : "inactivo"}">${it.nombre}</span>
      <label class="switch">
        <input type="checkbox" ${it.activo ? "checked" : ""} data-toggle="${tabla}:${it.id}" />
        <span class="slider"></span>
      </label>
      <button class="icon-btn" data-editar-item="${tabla}:${it.id}" title="Editar">✎</button>
      <button class="icon-btn" data-eliminar="${tabla}:${it.id}" title="Eliminar">🗑</button>
    </div>
  `).join("");

  el.querySelectorAll("[data-toggle]").forEach(chk => {
    chk.addEventListener("change", async () => {
      const [tab, id] = chk.dataset.toggle.split(":");
      const { error } = await getClient().from(tab).update({ activo: chk.checked }).eq("id", id);
      if (error) { alert("Error: " + error.message); return; }
      await cargarTodo();
    });
  });
  el.querySelectorAll("[data-editar-item]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [tab, id] = btn.dataset.editarItem.split(":");
      const actual = items.find(x => String(x.id) === String(id));
      if (!actual) return;
      abrirModalEditar({ tabla: tab, id, nombre: actual.nombre, titulo: TITULO_EDITAR[tab] });
    });
  });
  el.querySelectorAll("[data-eliminar]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta opción? Si ya tiene movimientos asociados, no se va a poder borrar (podés desactivarla en su lugar).")) return;
      const [tab, id] = btn.dataset.eliminar.split(":");
      const { error } = await getClient().from(tab).delete().eq("id", id);
      if (error) {
        // 23503 = violación de clave foránea: significa que este
        // concepto/moneda/origen ya está usado en algún movimiento (o
        // conciliación), así que la base de datos no deja borrarlo. En ese
        // caso se avisa y se sugiere desactivarlo en vez de eliminarlo.
        if (error.code === "23503") {
          alert("No se puede eliminar: ya está usado en movimientos cargados. Desactivalo con el interruptor de la izquierda para que deje de aparecer como opción, sin perder el historial.");
        } else {
          alert("Error: " + error.message);
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
      if (error) { alert("Error agregando: " + error.message); return; }
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
