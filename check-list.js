// Lista de checkboxes reutilizable para "elegí qué conceptos (o monedas)
// entran en este reporte": la usan Distribución (Mensual/Histórica) y
// Dashboard > Snapshot. Cada pantalla que la usa guarda su propia columna
// en la base ("campo": incluir_en_distribucion, incluir_en_snapshot, etc.),
// así una puede tener una selección distinta de la otra sin pisarse, y
// cada tilde se guarda solo apenas se toca, para que se recuerde entre
// sesiones.
//
// conBotonesTodos agrega "Seleccionar todas" / "Deseleccionar todas"
// arriba de la lista, para tildar o destildar todo de un tirón en vez de
// ítem por ítem.

import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';

async function marcarTodos(tabla, items, campo, valor) {
  const ids = items.map(it => it.id);
  if (ids.length === 0) return;
  const { error } = await getClient().from(tabla).update({ [campo]: valor }).in("id", ids);
  if (error) { alert("No se pudo guardar: " + error.message); return; }
  await cargarTodo();
}

export function renderCheckboxesTabla(tabla, items, contenedorId, vacioTexto, campo, conBotonesTodos) {
  const cont = document.getElementById(contenedorId);
  if (!cont) return;
  if (items.length === 0) {
    cont.innerHTML = `<div class="empty">${vacioTexto}</div>`;
    return;
  }

  const botonesHtml = conBotonesTodos
    ? `<div class="check-grid-acciones">
         <button type="button" class="link-btn" data-accion="todas">Seleccionar todas</button>
         <button type="button" class="link-btn" data-accion="ninguna">Deseleccionar todas</button>
       </div>`
    : "";

  cont.innerHTML = botonesHtml + items.map(it => `
    <label class="check-item">
      <input type="checkbox" data-incluir="${it.id}" ${it[campo] !== false ? "checked" : ""} />
      <span class="${it.activo ? "" : "inactivo"}">${it.nombre}</span>
    </label>
  `).join("");

  cont.querySelectorAll("[data-incluir]").forEach(chk => {
    chk.addEventListener("change", async () => {
      const id = chk.dataset.incluir;
      const { error } = await getClient().from(tabla).update({ [campo]: chk.checked }).eq("id", id);
      if (error) {
        alert("No se pudo guardar: " + error.message);
        chk.checked = !chk.checked;
        return;
      }
      await cargarTodo();
    });
  });

  if (conBotonesTodos) {
    const btnTodas = cont.querySelector('[data-accion="todas"]');
    const btnNinguna = cont.querySelector('[data-accion="ninguna"]');
    if (btnTodas) btnTodas.addEventListener("click", () => marcarTodos(tabla, items, campo, true));
    if (btnNinguna) btnNinguna.addEventListener("click", () => marcarTodos(tabla, items, campo, false));
  }
}
