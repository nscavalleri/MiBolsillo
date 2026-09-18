// Configuración > Conceptos / Monedas / Orígenes: listar, activar/desactivar,
// editar (renombrar) y eliminar cada ítem; agregar ítems nuevos.

import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';

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
    btn.addEventListener("click", async () => {
      const [tab, id] = btn.dataset.editarItem.split(":");
      const actual = items.find(x => String(x.id) === String(id));
      const nuevoNombre = prompt("Nuevo nombre:", actual ? actual.nombre : "");
      if (nuevoNombre === null) return;
      const nombreLimpio = nuevoNombre.trim();
      if (!nombreLimpio) return;
      const { error } = await getClient().from(tab).update({ nombre: nombreLimpio }).eq("id", id);
      if (error) { alert("Error editando: " + error.message); return; }
      await cargarTodo();
    });
  });
  el.querySelectorAll("[data-eliminar]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta opción? Los movimientos ya cargados no se van a borrar.")) return;
      const [tab, id] = btn.dataset.eliminar.split(":");
      const { error } = await getClient().from(tab).delete().eq("id", id);
      if (error) { alert("Error: " + error.message); return; }
      await cargarTodo();
    });
  });
}

export function setupAddItemRows() {
  document.querySelectorAll(".add-item-row button").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tabla = btn.dataset.tabla;
      const input = document.getElementById(btn.dataset.input);
      const nombre = input.value.trim();
      if (!nombre) return;
      const { error } = await getClient().from(tabla).insert({ nombre });
      if (error) { alert("Error agregando: " + error.message); return; }
      input.value = "";
      await cargarTodo();
    });
  });
}
