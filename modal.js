// Modal para agregar / editar un movimiento (gasto o ingreso).

import { state } from './state.js';
import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';

// Valores por defecto al agregar un gasto nuevo (no se aplican al editar).
const MONEDA_POR_DEFECTO = "Euros";
const ORIGEN_POR_DEFECTO = "BBVA";

export function poblarSelects() {
  const selConcepto = document.getElementById("concepto");
  const selMoneda = document.getElementById("moneda");
  const selOrigen = document.getElementById("origen");
  selConcepto.innerHTML = state.conceptos.filter(c => c.activo).map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join("");
  selMoneda.innerHTML = state.monedas.filter(m => m.activo).map(m => `<option value="${m.nombre}">${m.nombre}</option>`).join("");
  selOrigen.innerHTML = state.origenes.filter(o => o.activo).map(o => `<option value="${o.nombre}">${o.nombre}</option>`).join("");
}

export function abrirModal(id) {
  state.editandoId = id;
  document.getElementById("modalTitulo").textContent = id ? "Editar movimiento" : "Agregar gasto";
  const form = document.getElementById("formMovimiento");
  form.reset();

  if (id) {
    const m = state.movimientos.find(x => String(x.id) === String(id));
    state.tipoActual = m.tipo;
    document.getElementById("fecha").value = m.fecha;
    document.getElementById("descripcion").value = m.descripcion || "";
    document.getElementById("monto").value = m.monto;
    poblarSelects();
    document.getElementById("concepto").value = m.concepto;
    document.getElementById("moneda").value = m.moneda;
    document.getElementById("origen").value = m.origen;
  } else {
    state.tipoActual = "egreso";
    document.getElementById("fecha").valueAsDate = new Date();
    poblarSelects();
    // Defaults para un gasto nuevo: Euros / BBVA (si existen y están activos).
    document.getElementById("moneda").value = MONEDA_POR_DEFECTO;
    document.getElementById("origen").value = ORIGEN_POR_DEFECTO;
  }
  document.querySelectorAll(".tipo-toggle button").forEach(b => {
    b.classList.toggle("active", b.dataset.tipo === state.tipoActual);
  });
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
      document.querySelectorAll(".tipo-toggle button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.tipoActual = btn.dataset.tipo;
    });
  });

  document.getElementById("formMovimiento").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      fecha: document.getElementById("fecha").value,
      tipo: state.tipoActual,
      concepto: document.getElementById("concepto").value,
      descripcion: document.getElementById("descripcion").value,
      monto: Number(document.getElementById("monto").value),
      moneda: document.getElementById("moneda").value,
      origen: document.getElementById("origen").value,
    };

    let error;
    if (state.editandoId) {
      ({ error } = await getClient().from("movimientos").update(payload).eq("id", state.editandoId));
    } else {
      ({ error } = await getClient().from("movimientos").insert(payload));
    }
    if (error) { alert("Error guardando: " + error.message); return; }
    cerrarModal();
    await cargarTodo();
  });
}
