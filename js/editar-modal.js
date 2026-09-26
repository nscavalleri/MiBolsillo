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
//
// campoSigno es igual de opcional (por ahora, solo Conceptos, con
// "tipo_concepto_principal"): si ESE concepto es Ingreso o Egreso por
// defecto — mismo campo que ya se puede tocar desde el chip "Signo" de la
// lista (ver js/configuracion.js), acá editable desde el modal también.
// A diferencia de Moneda/Origen, este campo NO tiene una opción "Sin
// definir": es un toggle a propósito binario (Ingreso/Egreso nomás),
// igual criterio que el chip de la lista — un concepto sin
// tipo_concepto_principal cargado arranca mostrando Egreso, pero al
// guardar siempre queda en 1 o 2, nunca en null ni en 3 ("No aplica",
// reservado para los conceptos de sistema, que ni siquiera tienen botón
// de editar — ver CONCEPTOS_SISTEMA en configuracion.js).

import { state } from './state.js';
import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';
import { avisarError } from './aviso-modal.js';

let contextoActual = null;
// Selección actual del toggle de Signo ("ingreso" | "egreso"), mientras el
// modal está abierto — mismo patrón que state.tipoActual en modal.js, pero
// con su propia variable: este modal no comparte nada con el de Agregar/
// Editar movimiento (ver el comentario de .signo-toggle en css/styles.css).
let signoActual = "egreso";

function poblarSelectOpcional(selectEl, lista, valorActual) {
  const opciones = lista.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  selectEl.innerHTML = `<option value="">Sin definir</option>` +
    opciones.map(it => `<option value="${it.id}">${it.nombre}</option>`).join("");
  selectEl.value = valorActual != null ? String(valorActual) : "";
}

function marcarSignoActivo() {
  document.getElementById("editarItemSignoIngreso").classList.toggle("active", signoActual === "ingreso");
  document.getElementById("editarItemSignoEgreso").classList.toggle("active", signoActual === "egreso");
}

export function abrirModalEditar({
  tabla, id, nombre, cantidad, campoCantidad, descripcion, campoDescripcion, titulo,
  campoMoneda, monedaId, campoOrigen, origenId,
  campoSigno, signoValor,
}) {
  contextoActual = { tabla, id, campoCantidad, campoDescripcion, campoMoneda, campoOrigen, campoSigno };

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

  const grupoSigno = document.getElementById("editarItemSignoGrupo");
  if (campoSigno) {
    grupoSigno.style.display = "block";
    // Mismo respaldo que el chip de la lista: sin nada cargado (o
    // cualquier valor que no sea 1) se muestra como Egreso.
    signoActual = signoValor === 1 ? "ingreso" : "egreso";
    marcarSignoActivo();
  } else {
    grupoSigno.style.display = "none";
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

  document.getElementById("editarItemSignoEgreso").addEventListener("click", () => {
    signoActual = "egreso";
    marcarSignoActivo();
  });
  document.getElementById("editarItemSignoIngreso").addEventListener("click", () => {
    signoActual = "ingreso";
    marcarSignoActivo();
  });

  document.getElementById("formEditarItem").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!contextoActual) return;
    const { tabla, id, campoCantidad, campoDescripcion, campoMoneda, campoOrigen, campoSigno } = contextoActual;

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
    // Ingreso/Egreso por defecto: binario a propósito (ver el comentario de
    // campoSigno más arriba) — siempre guarda 1 o 2, nunca null ni 3.
    if (campoSigno) {
      payload[campoSigno] = signoActual === "ingreso" ? 1 : 2;
    }

    const { error } = await getClient().from(tabla).update(payload).eq("id", id);
    if (error) { avisarError("Error editando: " + error.message); return; }
    cerrarModalEditar();
    await cargarTodo();
  });
}
