// Modal de "Editar" compartido por Conceptos, Monedas, Orígenes y
// Reservas: antes cada uno editaba con prompt() del navegador (y Reservas,
// al tener dos campos, pedía uno y después el otro en dos cuadros de
// diálogo separados). Ahora hay un solo formulario donde se edita todo
// junto y se guarda con un solo "Guardar" — reutiliza el mismo
// .modal-overlay / .modal-box que "Agregar gasto".
//
// campoCantidad y campoDescripcion son opcionales: si el ítem que se edita
// tiene además una cantidad y/o una descripción (por ahora, Reservas, con
// "cantidad_reservada" y "descripcion"), se pasan acá y se muestran esos
// campos extra; si no, el modal solo pide el nombre.

import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';

let contextoActual = null;

export function abrirModalEditar({ tabla, id, nombre, cantidad, campoCantidad, descripcion, campoDescripcion, titulo }) {
  contextoActual = { tabla, id, campoCantidad, campoDescripcion };

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

  const grupoDescripcion = document.getElementById("editarItemDescripcionGrupo");
  const inputDescripcion = document.getElementById("editarItemDescripcion");
  if (campoDescripcion) {
    grupoDescripcion.style.display = "block";
    inputDescripcion.value = descripcion || "";
  } else {
    grupoDescripcion.style.display = "none";
    inputDescripcion.value = "";
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
    const { tabla, id, campoCantidad, campoDescripcion } = contextoActual;

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
    if (campoDescripcion) {
      // La descripción es opcional: si se deja vacía se guarda null (y no
      // una cadena vacía), así "sin descripción" es siempre lo mismo mire
      // desde donde se mire.
      const texto = document.getElementById("editarItemDescripcion").value.trim();
      payload[campoDescripcion] = texto === "" ? null : texto;
    }

    const { error } = await getClient().from(tabla).update(payload).eq("id", id);
    if (error) { alert("Error editando: " + error.message); return; }
    cerrarModalEditar();
    await cargarTodo();
  });
}
