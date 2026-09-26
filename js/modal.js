// Modal para agregar / editar un movimiento (gasto o ingreso). Concepto,
// moneda y origen se guardan como concepto_id / moneda_id / origen_id
// (claves foráneas hacia conceptos, monedas y origenes).

import { state } from './state.js';
import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';
import { avisarError } from './aviso-modal.js';

// Concepto por defecto al agregar un gasto nuevo (no se aplica al editar).
// ID según la base: concepto "Supermercado" = 25.
const CONCEPTO_POR_DEFECTO_ID = 25;

// Moneda/origen de respaldo cuando el concepto elegido no tiene su propio
// default cargado (o lo tiene, pero apunta a algo ya inactivo): Euros /
// Efectivo, los mismos fijos que se usaban siempre antes de que existiera
// el default por concepto — a pedido de Nadia ("si la opción elegida es
// sin definir entonces que se complete como Euros Efectivo"). IDs según
// la base: moneda "Euros" = 2, origen "Efectivo" = 5.
const MONEDA_POR_DEFECTO_ID = 2;
const ORIGEN_POR_DEFECTO_ID = 5;

// tipo_concepto: 1 = Ingreso, 2 = Egreso, 3 = No aplica. Cada concepto tiene
// un tipo principal (conceptos.tipo_concepto_principal) que sirve para
// sugerir el tipo de movimiento (Ingreso/Egreso) al elegirlo, aunque después
// se pueda cambiar a mano con el toggle. "No aplica" (3), o un concepto sin
// tipo asignado, se resuelve como Egreso por defecto.
function tipoSegunConcepto(conceptoId) {
  const concepto = state.conceptos.find(c => String(c.id) === String(conceptoId));
  return concepto && concepto.tipo_concepto_principal === 1 ? "ingreso" : "egreso";
}

// Moneda/origen por defecto de un concepto (conceptos.moneda_defecto_id /
// origen_defecto_id, cargados en Configuración > Conceptos — ver
// js/editar-modal.js). Se usan para autocompletar el <select> de
// Moneda/Origen al elegir ese concepto acá abajo, aunque siempre se puedan
// cambiar a mano después. Si el concepto no tiene uno cargado — o el que
// tiene cargado ya no está activo, así que no aparecería como opción del
// <select> (ver poblarSelects) — se cae en el fijo de siempre (Euros/
// Efectivo), no se deja el campo sin tocar.
function monedaSegunConcepto(conceptoId) {
  const concepto = state.conceptos.find(c => String(c.id) === String(conceptoId));
  if (concepto && concepto.moneda_defecto_id != null) {
    const propia = state.monedas.find(m => String(m.id) === String(concepto.moneda_defecto_id) && m.activo);
    if (propia) return String(propia.id);
  }
  const fallback = state.monedas.find(m => String(m.id) === String(MONEDA_POR_DEFECTO_ID) && m.activo);
  return fallback ? String(fallback.id) : null;
}

function origenSegunConcepto(conceptoId) {
  const concepto = state.conceptos.find(c => String(c.id) === String(conceptoId));
  if (concepto && concepto.origen_defecto_id != null) {
    const propio = state.origenes.find(o => String(o.id) === String(concepto.origen_defecto_id) && o.activo);
    if (propio) return String(propio.id);
  }
  const fallback = state.origenes.find(o => String(o.id) === String(ORIGEN_POR_DEFECTO_ID) && o.activo);
  return fallback ? String(fallback.id) : null;
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
    // Default para un gasto nuevo: Supermercado (si existe y está activo),
    // por ID. Moneda y Origen se completan solos a partir de lo que tenga
    // cargado ESE concepto en Configuración > Conceptos (mismo mecanismo
    // que el listener de "concepto" de más abajo) — si no tiene nada
    // cargado, caen en el fijo de siempre (Euros/Efectivo).
    const conceptoDefault = state.conceptos.find(c => String(c.id) === String(CONCEPTO_POR_DEFECTO_ID));
    if (conceptoDefault) document.getElementById("concepto").value = conceptoDefault.id;
    const conceptoIdInicial = document.getElementById("concepto").value;
    const monedaDefecto = monedaSegunConcepto(conceptoIdInicial);
    if (monedaDefecto) document.getElementById("moneda").value = monedaDefecto;
    const origenDefecto = origenSegunConcepto(conceptoIdInicial);
    if (origenDefecto) document.getElementById("origen").value = origenDefecto;
    // El tipo sale del tipo principal del concepto que quedó seleccionado
    // por defecto arriba (o si no existe, el primero de la lista); se puede
    // cambiar a mano después con el toggle.
    state.tipoActual = tipoSegunConcepto(conceptoIdInicial);
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
  // Egreso, según tipo_concepto_principal) y se autocompletan Moneda y
  // Origen: con lo que ese concepto tenga cargado en Configuración >
  // Conceptos, o con Euros/Efectivo si no tiene nada cargado (ver
  // monedaSegunConcepto/origenSegunConcepto más arriba). Todo esto queda
  // como punto de partida nomás: el toggle y los <select> se pueden seguir
  // cambiando a mano después si hace falta.
  document.getElementById("concepto").addEventListener("change", (e) => {
    state.tipoActual = tipoSegunConcepto(e.target.value);
    marcarToggleActivo();
    const monedaDefecto = monedaSegunConcepto(e.target.value);
    if (monedaDefecto) document.getElementById("moneda").value = monedaDefecto;
    const origenDefecto = origenSegunConcepto(e.target.value);
    if (origenDefecto) document.getElementById("origen").value = origenDefecto;
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
