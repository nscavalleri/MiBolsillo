// Modal para agregar / editar un movimiento (gasto o ingreso). Concepto,
// moneda y origen se guardan como concepto_id / moneda_id / origen_id
// (claves foráneas hacia conceptos, monedas y origenes).

import { state } from './state.js';
import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';
import { avisarError } from './aviso-modal.js';

// Valores por defecto al agregar un gasto nuevo (no se aplican al editar).
// IDs según la base: moneda "Euros" = 2, origen "Efectivo" = 5, concepto "Supermercado" = 25.
const MONEDA_POR_DEFECTO_ID = 2;
const ORIGEN_POR_DEFECTO_ID = 5;
const CONCEPTO_POR_DEFECTO_ID = 25;

// tipo_concepto: 1 = Ingreso, 2 = Egreso, 3 = No aplica. Cada concepto tiene
// un tipo principal (conceptos.tipo_concepto_principal) que sirve para
// sugerir el tipo de movimiento (Ingreso/Egreso) al elegirlo, aunque después
// se pueda cambiar a mano con el toggle. "No aplica" (3), o un concepto sin
// tipo asignado, se resuelve como Egreso por defecto.
function tipoSegunConcepto(conceptoId) {
  const concepto = state.conceptos.find(c => String(c.id) === String(conceptoId));
  return concepto && concepto.tipo_concepto_principal === 1 ? "ingreso" : "egreso";
}

function marcarToggleActivo() {
  document.querySelectorAll(".tipo-toggle button").forEach(b => {
    b.classList.toggle("active", b.dataset.tipo === state.tipoActual);
  });
}

export function poblarSelects() {
  const selConcepto = document.getElementById("concepto");
  const selMoneda = document.getElementById("moneda");
  const selOrigen = document.getElementById("origen");
  selConcepto.innerHTML = state.conceptos.filter(c => c.activo).map(c => `<option value="${c.id}">${c.nombre}</option>`).join("");
  selMoneda.innerHTML = state.monedas.filter(m => m.activo).map(m => `<option value="${m.id}">${m.nombre}</option>`).join("");
  selOrigen.innerHTML = state.origenes.filter(o => o.activo).map(o => `<option value="${o.id}">${o.nombre}</option>`).join("");
}

export function abrirModal(id) {
  state.editandoId = id;
  document.getElementById("modalTitulo").textContent = id ? "Editar movimiento" : "Agregar movimiento";
  const form = document.getElementById("formMovimiento");
  form.reset();

  if (id) {
    const m = state.movimientos.find(x => String(x.id) === String(id));
    state.tipoActual = m.tipo;
    document.getElementById("fecha").value = m.fecha;
    document.getElementById("descripcion").value = m.descripcion || "";
    document.getElementById("monto").value = m.monto;
    poblarSelects();
    document.getElementById("concepto").value = m.concepto_id;
    document.getElementById("moneda").value = m.moneda_id;
    document.getElementById("origen").value = m.origen_id;
  } else {
    document.getElementById("fecha").valueAsDate = new Date();
    poblarSelects();
    // Defaults para un gasto nuevo: Euros / Efectivo / Supermercado (si existen y están activos), por ID.
    const monedaDefault = state.monedas.find(mo => String(mo.id) === String(MONEDA_POR_DEFECTO_ID));
    const origenDefault = state.origenes.find(o => String(o.id) === String(ORIGEN_POR_DEFECTO_ID));
    const conceptoDefault = state.conceptos.find(c => String(c.id) === String(CONCEPTO_POR_DEFECTO_ID));
    if (monedaDefault) document.getElementById("moneda").value = monedaDefault.id;
    if (origenDefault) document.getElementById("origen").value = origenDefault.id;
    if (conceptoDefault) document.getElementById("concepto").value = conceptoDefault.id;
    // El tipo sale del tipo principal del concepto que quedó seleccionado
    // por defecto arriba (o si no existe, el primero de la lista); se puede
    // cambiar a mano después con el toggle.
    state.tipoActual = tipoSegunConcepto(document.getElementById("concepto").value);
  }
  marcarToggleActivo();
  document.getElementById("modalOverlay").classList.add("open");
}

export function cerrarModal() {
  document.getElementById("modalOverlay").classList.remove("open");
  state.editandoId = null;
}

export function setupModal() {
  document.getElementById("btnAgregar").addEventListener("click", () => abrirModal(null));
  document.getElementById("modalClose").addEventListener("click", cerrarModal);

  document.querySelectorAll(".tipo-toggle button").forEach(btn => {
    btn.addEventListener("click", () => {
      state.tipoActual = btn.dataset.tipo;
      marcarToggleActivo();
    });
  });

  // Al elegir un concepto se sugiere automáticamente su tipo (Ingreso o
  // Egreso, según tipo_concepto_principal); el toggle de arriba se puede
  // seguir cambiando a mano después si hace falta.
  document.getElementById("concepto").addEventListener("change", (e) => {
    state.tipoActual = tipoSegunConcepto(e.target.value);
    marcarToggleActivo();
  });

  // Enter en cualquier campo del modal agrega el movimiento, siempre que
  // "Cantidad" ya tenga un valor cargado (si falta algún campo obligatorio,
  // requestSubmit() dispara la validación nativa del navegador igual que
  // al tocar "Guardar").
  document.getElementById("formMovimiento").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const monto = document.getElementById("monto").value;
    if (!monto) return;
    e.preventDefault();
    document.getElementById("formMovimiento").requestSubmit();
  });

  document.getElementById("formMovimiento").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      fecha: document.getElementById("fecha").value,
      tipo: state.tipoActual,
      descripcion: document.getElementById("descripcion").value,
      monto: Number(document.getElementById("monto").value),
      // concepto_id / moneda_id / origen_id son bigint, pero llegan como texto
      // desde el <select> (su .value siempre es string); no hace falta
      // convertirlos con Number(), Postgres los interpreta igual al guardar.
      concepto_id: document.getElementById("concepto").value,
      moneda_id: document.getElementById("moneda").value,
      origen_id: document.getElementById("origen").value,
    };

    let error;
    if (state.editandoId) {
      ({ error } = await getClient().from("movimientos").update(payload).eq("id", state.editandoId));
    } else {
      ({ error } = await getClient().from("movimientos").insert(payload));
    }
    if (error) { avisarError("Error guardando: " + error.message); return; }
    cerrarModal();
    await cargarTodo();
  });
}
