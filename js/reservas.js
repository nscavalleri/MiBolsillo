// Configuración > Reservas: montos reservados en euros (para un viaje, un
// colchón de ahorro, lo que sea), con nombre, cantidad y activo/inactivo.
// Es igual en espíritu a Conceptos/Monedas/Orígenes (configuracion.js),
// pero tiene un campo más (cantidad_reservada) que esos no necesitan, así
// que tiene su propio ABM en vez de reutilizar renderConfigLista.

import { state } from './state.js';
import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';

export function renderReservas() {
  const el = document.getElementById("listaReservas");
  if (!el) return;

  if (state.reservas.length === 0) {
    el.innerHTML = `<div class="empty">Todavía no agregaste ninguna reserva.</div>`;
    return;
  }

  el.innerHTML = state.reservas.map(r => `
    <div class="config-item">
      <span class="nombre ${r.activo ? "" : "inactivo"}">${r.nombre}</span>
      <span class="reserva-monto">${Number(r.cantidad_reservada || 0).toFixed(2)} €</span>
      <label class="switch">
        <input type="checkbox" ${r.activo ? "checked" : ""} data-toggle-reserva="${r.id}" />
        <span class="slider"></span>
      </label>
      <button class="icon-btn" data-editar-reserva="${r.id}" title="Editar">✎</button>
      <button class="icon-btn" data-eliminar-reserva="${r.id}" title="Eliminar">🗑</button>
    </div>
  `).join("");

  el.querySelectorAll("[data-toggle-reserva]").forEach(chk => {
    chk.addEventListener("change", async () => {
      const id = chk.dataset.toggleReserva;
      const { error } = await getClient().from("reservas").update({ activo: chk.checked }).eq("id", id);
      if (error) { alert("Error: " + error.message); return; }
      await cargarTodo();
    });
  });

  // Editar pide el nombre y la cantidad en dos prompts seguidos (mismo
  // estilo simple que usa configuracion.js para renombrar), en vez de
  // armar un formulario aparte solo para esto.
  el.querySelectorAll("[data-editar-reserva]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.editarReserva;
      const actual = state.reservas.find(x => String(x.id) === String(id));
      if (!actual) return;

      const nuevoNombre = prompt("Nombre:", actual.nombre);
      if (nuevoNombre === null) return;
      const nombreLimpio = nuevoNombre.trim();
      if (!nombreLimpio) return;

      const nuevaCantidadTexto = prompt("Cantidad reservada (€):", Number(actual.cantidad_reservada || 0));
      if (nuevaCantidadTexto === null) return;
      const nuevaCantidad = Number(String(nuevaCantidadTexto).replace(",", "."));
      if (Number.isNaN(nuevaCantidad) || nuevaCantidad < 0) {
        alert("La cantidad tiene que ser un número mayor o igual a 0.");
        return;
      }

      const { error } = await getClient()
        .from("reservas")
        .update({ nombre: nombreLimpio, cantidad_reservada: nuevaCantidad })
        .eq("id", id);
      if (error) { alert("Error editando: " + error.message); return; }
      await cargarTodo();
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
