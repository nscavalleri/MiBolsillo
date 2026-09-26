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
//
// campoMoneda/campoOrigen son igual de opcionales (por ahora, solo
// Conceptos, con "moneda_defecto_id"/"origen_defecto_id" — ver
// js/configuracion.js): moneda y origen preferidos por defecto para ESE
// concepto, que js/modal.js usa para autocompletar Agregar/Editar
// movimiento al elegirlo (siempre se puede cambiar a mano ahí). Se
// muestran TODAS las monedas/orígenes que existan (activos o no: es una
// preferencia guardada, no una lista de opciones disponibles hoy para
// cargar un movimiento) más una opción en blanco al principio, porque
// dejarlo sin definir es válido.

import { state } from './state.js';
import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';
import { avisarError } from './aviso-modal.js';

let contextoActual = null;

function poblarSelectOpcional(selectEl, lista, valorActual) {
  const opciones = lista.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  selectEl.innerHTML = `<option value="">Sin definir</option>` +
    opciones.map(it => `<option value="${it.id}">${it.nombre}</option>`).join("");
  selectEl.value = valorActual != null ? String(valorActual) : "";
}

export function abrirModalEditar({
  tabla, id, nombre, cantidad, campoCantidad, descripcion, campoDescripcion, titulo,
  campoMoneda, monedaId, campoOrigen, origenId,
}) {
  contextoActual = { tabla, id, campoCantidad, campoDescripcion, campoMoneda, campoOrigen };

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

  const grupoMoneda = document.getElementById("editarItemMonedaGrupo");
  const selectMoneda = document.getElementById("editarItemMoneda");
  if (campoMoneda) {
    grupoMoneda.style.display = "block";
    poblarSelectOpcional(selectMoneda, state.monedas, monedaId);
  } else {
    grupoMoneda.style.display = "none";
  }

  const grupoOrigen = document.getElementById("editarItemOrigenGrupo");
  const selectOrigen = document.getElementById("editarItemOrigen");
  if (campoOrigen) {
    grupoOrigen.style.display = "block";
    poblarSelectOpcional(selectOrigen, state.origenes, origenId);
  } else {
    grupoOrigen.style.display = "none";
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
    const { tabla, id, campoCantidad, campoDescripcion, campoMoneda, campoOrigen } = contextoActual;

    const nombre = document.getElementById("editarItemNombre").value.trim();
    if (!nombre) return;

    const payload = { nombre };
    if (campoCantidad) {
      const cantidadTexto = document.getElementById("editarItemCantidad").value;
      const cantidad = Number(String(cantidadTexto).replace(",", "."));
      if (Number.isNaN(cantidad) || cantidad < 0) {
        avisarError("La cantidad tiene que ser un número mayor o igual a 0.");
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
    // Moneda/origen por defecto: "Sin definir" (el <option value="">) se
    // guarda como null, igual criterio que la descripción de arriba.
    if (campoMoneda) {
      const valor = document.getElementById("editarItemMoneda").value;
      payload[campoMoneda] = valor === "" ? null : valor;
    }
    if (campoOrigen) {
      const valor = document.getElementById("editarItemOrigen").value;
      payload[campoOrigen] = valor === "" ? null : valor;
    }

    const { error } = await getClient().from(tabla).update(payload).eq("id", id);
    if (error) { avisarError("Error editando: " + error.message); return; }
    cerrarModalEditar();
    await cargarTodo();
  });
}
