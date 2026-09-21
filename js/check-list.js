// Lista de checkboxes reutilizable para "elegí qué conceptos (o monedas)
// entran en este reporte": la usan Distribución (Mensual/Histórica) y
// Dashboard > Snapshot. Cada pantalla que la usa guarda su propia columna
// en la base ("campo": incluir_en_distribucion, incluir_en_snapshot, etc.),
// así una puede tener una selección distinta de la otra sin pisarse, y
// cada tilde se guarda solo apenas se toca, para que se recuerde entre
// sesiones.
//
// conBotonesTodos agrega un único checkbox "Todos" arriba de la lista:
// tildado marca todos los ítems, destildado los destilda a todos, de un
// tirón en vez de ítem por ítem. Si la selección está mezclada (algunos
// tildados y otros no), se muestra en su estado "indeterminado" (el
// tradicional guioncito) en vez de tildado o destildado.

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

  const todosMarcados = items.every(it => it[campo] !== false);
  const algunoMarcado = items.some(it => it[campo] !== false);

  const todosHtml = conBotonesTodos
    ? `<label class="check-item check-item-todos">
         <input type="checkbox" data-marcar-todos ${todosMarcados ? "checked" : ""} />
         <span>Todos</span>
       </label>`
    : "";

  cont.innerHTML = todosHtml + items.map(it => `
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
    const chkTodos = cont.querySelector("[data-marcar-todos]");
    if (chkTodos) {
      chkTodos.indeterminate = !todosMarcados && algunoMarcado;
      chkTodos.addEventListener("change", () => marcarTodos(tabla, items, campo, chkTodos.checked));
    }
  }
}
