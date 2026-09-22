// Modal de "Editar" compartido por Conceptos, Monedas, Orígenes y
// Reservas: antes cada uno editaba con prompt() del navegador (y Reservas,
// al tener dos campos, pedía uno y después el otro en dos cuadros de
// diálogo separados). Ahora hay un solo formulario donde se edita todo
// junto y se guarda con un solo "Guardar" — reutiliza el mismo
// .modal-overlay / .modal-box que "Agregar gasto".
//
// campoCantidad es opcional: si el ítem que se edita tiene además una
// cantidad (por ahora, Reservas con "cantidad_reservada"), se pasa acá y
// se muestra ese segundo campo; si no, el modal solo pide el nombre.

import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';

let contextoActual = null;

export function abrirModalEditar({ tabla, id, nombre, cantidad, campoCantidad, titulo }) {
  contextoActual = { tabla, id, campoCantidad };

  document.getElementById("editarItemTitulo").textContent = titulo || "Editar";
  document.getElementById("editarItemNombre").value = nombre || "";

  const grupoCantidad = document.getElementById("editarItemCantidadGrupo");
  const inputCantidad = document.getElementById("editarItemCantidad");
  if (campoCantidad) {
    grupoCantidad.style.display = "block";
    inputCantidad.required = true;
    inputCantidad.value = cantidad != null ? cantidad : "";
  } else {
    grupoCantidad.style.display = "none";
    inputCantidad.required = false;
    inputCantidad.value = "";
  }

  document.getElementById("editarItemOverlay").classList.add("open");
  document.getElementById("editarItemNombre").focus();
}

function cerrarModalEditar() {
  document.getElementById("editarItemOverlay").classList.remove("open");
  contextoActual = null;
}

export function setupEditarModal() {
  document.getElementById("editarItemClose").addEventListener("click", cerrarModalEditar);

  document.getElementById("formEditarItem").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!contextoActual) return;
    const { tabla, id, campoCantidad } = contextoActual;

    const nombre = document.getElementById("editarItemNombre").value.trim();
    if (!nombre) return;

    const payload = { nombre };
    if (campoCantidad) {
      const cantidadTexto = document.getElementById("editarItemCantidad").value;
      const cantidad = Number(String(cantidadTexto).replace(",", "."));
      if (Number.isNaN(cantidad) || cantidad < 0) {
        alert("La cantidad tiene que ser un número mayor o igual a 0.");
        return;
      }
      payload[campoCantidad] = cantidad;
    }

    const { error } = await getClient().from(tabla).update(payload).eq("id", id);
    if (error) { alert("Error editando: " + error.message); return; }
    cerrarModalEditar();
    await cargarTodo();
  });
}
