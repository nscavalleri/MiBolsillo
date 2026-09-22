// Configuración > Reservas: montos reservados en euros (para un viaje, un
// colchón de ahorro, lo que sea), con nombre, cantidad y activo/inactivo.
// Es igual en espíritu a Conceptos/Monedas/Orígenes (configuracion.js),
// pero tiene un campo más (cantidad_reservada) que esos no necesitan, así
// que tiene su propio ABM en vez de reutilizar renderConfigLista.

import { state } from './state.js';
import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';
import { abrirModalEditar } from './editar-modal.js';

export function renderReservas() {
  const el = document.getElementById("listaReservas");
  if (!el) return;

  if (state.reservas.length === 0) {
    el.innerHTML = `<div class="empty">Todavía no agregaste ninguna reserva.</div>`;
    return;
  }

  // Igual que en Gastos > Movimientos: el nombre arriba y, si la reserva
  // tiene descripción cargada, una segunda línea más chica y en gris claro
  // debajo. Las reservas sin descripción se ven exactamente igual que antes.
  el.innerHTML = state.reservas.map(r => `
    <div class="config-item">
      <div class="info">
        <span class="nombre ${r.activo ? "" : "inactivo"}">${r.nombre}</span>
        ${r.descripcion ? `<div class="detalle">${r.descripcion}</div>` : ""}
      </div>
      <span class="reserva-monto">${Number(r.cantidad_reservada || 0).toFixed(2)} €</span>
      <label class="switch">
        <input type="checkbox" ${r.activo ? "checked" : ""} data-toggle-reserva="${r.id}" />
        <span class="slider"></span>
      </label>
      <button class="icon-btn" data-editar-reserva="${r.id}" title="Editar">✎</button>
      <button class="icon-btn" data-eliminar-reserva="${r.id}" title="Eliminar">🗑</button>
    </div>
  `).join("");

  // Desactivar una reserva libera la plata que tenía asignada en Gastos >
  // Asignación: se borran sus asignaciones, así ese dinero vuelve a
  // aparecer como "Sin asignar" en cada cuenta y se puede repartir de
  // nuevo. Si no se borraran, quedarían colgadas de una reserva que ya no
  // se ve en ningún lado y los totales no cerrarían. Volver a activarla no
  // las recupera: hay que asignar de nuevo (por eso se avisa antes).
  el.querySelectorAll("[data-toggle-reserva]").forEach(chk => {
    chk.addEventListener("change", async () => {
      const id = chk.dataset.toggleReserva;
      const cliente = getClient();

      if (!chk.checked) {
        const tieneAsignaciones = state.asignaciones.some(
          a => String(a.reserva_id) === String(id) && Number(a.monto) !== 0
        );
        const esRemanenteDeAlguna = state.origenes.some(
          o => String(o.reserva_remanente_id) === String(id)
        );
        if ((tieneAsignaciones || esRemanenteDeAlguna) && !confirm(
          "Esta reserva se está usando en Gastos > Asignación.\n\n" +
          "Al desactivarla esa plata se libera y vuelve a quedar sin asignar, y las cuentas " +
          "que le mandaban lo que les sobraba dejan de hacerlo. Si después la volvés a activar, " +
          "vas a tener que configurarlo de nuevo.\n\n¿Seguir?"
        )) {
          chk.checked = true;
          return;
        }
      }

      const { error } = await cliente.from("reservas").update({ activo: chk.checked }).eq("id", id);
      if (error) { alert("Error: " + error.message); chk.checked = !chk.checked; return; }

      if (!chk.checked) {
        const { error: errorAsig } = await cliente.from("asignaciones").delete().eq("reserva_id", id);
        if (errorAsig) { alert("Se desactivó la reserva pero no se pudo liberar la plata asignada: " + errorAsig.message); }
        // Las cuentas que mandaban su remanente a esta reserva dejan de
        // tener remanente automático, si no apuntarían a algo invisible.
        const { error: errorRem } = await cliente
          .from("origenes").update({ reserva_remanente_id: null }).eq("reserva_remanente_id", id);
        if (errorRem) { alert("Se desactivó la reserva pero quedó marcada como destino del sobrante de alguna cuenta: " + errorRem.message); }
      }

      await cargarTodo();
    });
  });

  // Editar abre el modal compartido (editar-modal.js) con los campos extra
  // de cantidad y descripción habilitados, en vez de prompt() seguidos.
  el.querySelectorAll("[data-editar-reserva]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.editarReserva;
      const actual = state.reservas.find(x => String(x.id) === String(id));
      if (!actual) return;
      abrirModalEditar({
        tabla: "reservas",
        id,
        nombre: actual.nombre,
        cantidad: actual.cantidad_reservada,
        campoCantidad: "cantidad_reservada",
        descripcion: actual.descripcion,
        campoDescripcion: "descripcion",
        titulo: "Editar reserva",
      });
    });
  });

  el.querySelectorAll("[data-eliminar-reserva]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta reserva?")) return;
      const id = btn.dataset.eliminarReserva;
      const { error } = await getClient().from("reservas").delete().eq("id", id);
      if (error) { alert("Error: " + error.message); return; }
      await cargarTodo();
    });
  });
}

export function setupReservas() {
  const btn = document.getElementById("btnAgregarReserva");
  const inputNombre = document.getElementById("nuevaReservaNombre");
  const inputCantidad = document.getElementById("nuevaReservaCantidad");
  if (!btn || !inputNombre || !inputCantidad) return;

  async function agregarReserva() {
    const nombre = inputNombre.value.trim();
    if (!nombre) return;
    const cantidadTexto = inputCantidad.value.trim();
    const cantidad = cantidadTexto === "" ? 0 : Number(cantidadTexto);
    if (Number.isNaN(cantidad) || cantidad < 0) {
      alert("La cantidad tiene que ser un número mayor o igual a 0.");
      return;
    }

    const { error } = await getClient().from("reservas").insert({ nombre, cantidad_reservada: cantidad });
    if (error) { alert("Error agregando: " + error.message); return; }
    inputNombre.value = "";
    inputCantidad.value = "";
    await cargarTodo();
  }

  btn.addEventListener("click", agregarReserva);
  // Enter en cualquiera de los dos campos agrega la reserva, igual que en
  // las demás filas de "agregar" de la app.
  [inputNombre, inputCantidad].forEach(input => {
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      agregarReserva();
    });
  });
}
