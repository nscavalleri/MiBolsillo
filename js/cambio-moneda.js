// Gastos > Movimientos: modal de "Cambio de moneda" (a pedido de Nadia).
//
// Para cuando cambia plata de una moneda/cuenta a otra (por ejemplo,
// dólares en efectivo a euros en el banco): en vez de cargar dos
// movimientos por separado a mano en el modal de Agregar (js/modal.js), un
// solo formulario con dos bloques — "Desde" (de dónde sale la plata:
// cantidad, moneda y origen) y "Hacia" (a dónde entra: cantidad, moneda y
// origen) — que al guardar crea los DOS movimientos de un saque: un egreso
// con los datos de "Desde" y un ingreso con los de "Hacia", con la misma
// fecha y la misma descripción en los dos. Es su PROPIO modal (no reusa el
// de Agregar): el de Agregar solo tiene un juego de campos, para cargar un
// movimiento por vez.
//
// Los dos movimientos quedan con el concepto "Cambio de moneda"
// (conceptos.nombre): se busca por NOMBRE, igual que esEuros() en
// distribucion.js, no por id (los ids cambian de instalación a
// instalación, ver el comentario de js/modal.js sobre sus constantes de
// ids por defecto). Si ese concepto todavía no existe en Configuración >
// Conceptos, se avisa el error y no se guarda nada — no se crea el
// concepto solo, para no aparecer un concepto nuevo de la nada sin que
// Nadia lo haya dado de alta ella misma con el tipo fijo/variable que
// quiera.

import { state } from './state.js';
import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';
import { avisarError } from './aviso-modal.js';

const NOMBRE_CONCEPTO_CAMBIO = "cambio de moneda";

function conceptoCambioMonedaId() {
  const c = state.conceptos.find(x => x.nombre.trim().toLowerCase() === NOMBRE_CONCEPTO_CAMBIO);
  return c ? c.id : null;
}

function poblarSelects() {
  const opcionesDe = (lista) => lista.filter(x => x.activo).map(x => `<option value="${x.id}">${x.nombre}</option>`).join("");
  document.getElementById("cambioDesdeMoneda").innerHTML = opcionesDe(state.monedas);
  document.getElementById("cambioHaciaMoneda").innerHTML = opcionesDe(state.monedas);
  document.getElementById("cambioDesdeOrigen").innerHTML = opcionesDe(state.origenes);
  document.getElementById("cambioHaciaOrigen").innerHTML = opcionesDe(state.origenes);
}

function abrirModalCambioMoneda() {
  // Se valida el concepto ANTES de abrir el modal (no recién al guardar):
  // así, si todavía no existe, Nadia no pierde tiempo llenando el
  // formulario entero para enterarse recién al final.
  if (!conceptoCambioMonedaId()) {
    avisarError('No existe un concepto llamado "Cambio de moneda". Creálo primero en Configuración > Conceptos y volvé a intentar.');
    return;
  }
  const form = document.getElementById("formCambioMoneda");
  form.reset();
  poblarSelects();
  document.getElementById("cambioFecha").valueAsDate = new Date();
  document.getElementById("cambioMonedaOverlay").classList.add("open");
}

function cerrarModalCambioMoneda() {
  document.getElementById("cambioMonedaOverlay").classList.remove("open");
}

export function setupCambioMoneda() {
  document.getElementById("btnCambioMoneda").addEventListener("click", abrirModalCambioMoneda);
  document.getElementById("cambioMonedaClose").addEventListener("click", cerrarModalCambioMoneda);

  document.getElementById("formCambioMoneda").addEventListener("submit", async (e) => {
    e.preventDefault();
    // Se vuelve a buscar el concepto acá (no se reusa el de abrirModalCambioMoneda):
    // por si alguien lo borró justo mientras el modal estaba abierto.
    const conceptoId = conceptoCambioMonedaId();
    if (!conceptoId) {
      avisarError('No existe un concepto llamado "Cambio de moneda". Creálo primero en Configuración > Conceptos y volvé a intentar.');
      return;
    }
    const fecha = document.getElementById("cambioFecha").value;
    const descripcion = document.getElementById("cambioDescripcion").value;
    // Los dos movimientos se mandan juntos en un solo insert (un array en
    // vez de un objeto, a diferencia de js/modal.js que carga uno solo):
    // así entran los dos de un saque, con la misma fecha y descripción.
    const payload = [
      {
        fecha, tipo: "egreso", descripcion, concepto_id: conceptoId,
        monto: Number(document.getElementById("cambioDesdeMonto").value),
        moneda_id: document.getElementById("cambioDesdeMoneda").value,
        origen_id: document.getElementById("cambioDesdeOrigen").value,
      },
      {
        fecha, tipo: "ingreso", descripcion, concepto_id: conceptoId,
        monto: Number(document.getElementById("cambioHaciaMonto").value),
        moneda_id: document.getElementById("cambioHaciaMoneda").value,
        origen_id: document.getElementById("cambioHaciaOrigen").value,
      },
    ];

    const { error } = await getClient().from("movimientos").insert(payload);
    if (error) { avisarError("Error guardando: " + error.message); return; }
    cerrarModalCambioMoneda();
    await cargarTodo();
  });
}
