// Gastos > Movimientos: filtros combinables y listado (más nuevo primero,
// según la fecha ingresada en cada movimiento).

import { state } from './state.js';
import { getClient } from './config.js';
import { abrirModal } from './modal.js';
import { cargarTodo } from './data-service.js';

export function aplicarFiltros(lista) {
  const f = state.filtros;
  return lista.filter(m => {
    if (f.mes && String(m.fecha).slice(0, 7) !== f.mes) return false;
    if (f.tipo && m.tipo !== f.tipo) return false;
    if (f.concepto && m.concepto !== f.concepto) return false;
    if (f.origen && m.origen !== f.origen) return false;
    if (f.moneda && m.moneda !== f.moneda) return false;
    return true;
  });
}

export function poblarFiltros() {
  const selConcepto = document.getElementById("filtroConcepto");
  const selOrigen = document.getElementById("filtroOrigen");
  const selMoneda = document.getElementById("filtroMoneda");
  const prevConcepto = selConcepto.value, prevOrigen = selOrigen.value, prevMoneda = selMoneda.value;
  selConcepto.innerHTML = `<option value="">Todos</option>` + state.conceptos.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join("");
  selOrigen.innerHTML = `<option value="">Todos</option>` + state.origenes.map(o => `<option value="${o.nombre}">${o.nombre}</option>`).join("");
  selMoneda.innerHTML = `<option value="">Todos</option>` + state.monedas.map(m => `<option value="${m.nombre}">${m.nombre}</option>`).join("");
  selConcepto.value = prevConcepto;
  selOrigen.value = prevOrigen;
  selMoneda.value = prevMoneda;
}

export function renderMovimientos() {
  const el = document.getElementById("listaMovimientos");
  // state.movimientos ya viene ordenado (más nuevo primero) desde data-service.js;
  // acá solo se aplican los filtros, sin volver a ordenar.
  const lista = aplicarFiltros(state.movimientos);
  if (lista.length === 0) {
    el.innerHTML = `<div class="empty">${state.movimientos.length === 0 ? "No hay movimientos cargados todavía." : "Ningún movimiento coincide con los filtros."}</div>`;
    return;
  }
  el.innerHTML = lista.map(m => `
    <div class="movimiento">
      <div class="info">
        <div class="concepto">${m.concepto}</div>
        <div class="detalle">${m.fecha} · ${m.origen}${m.descripcion ? " · " + m.descripcion : ""}</div>
      </div>
      <div class="monto ${m.tipo}">${m.tipo === "egreso" ? "-" : "+"}${Number(m.monto).toFixed(2)} ${m.moneda}</div>
      <div class="acciones">
        <button data-editar="${m.id}" title="Editar">✎</button>
        <button data-borrar="${m.id}" title="Borrar">✕</button>
      </div>
    </div>
  `).join("");

  el.querySelectorAll("[data-editar]").forEach(btn => {
    btn.addEventListener("click", () => abrirModal(btn.dataset.editar));
  });
  el.querySelectorAll("[data-borrar]").forEach(btn => {
    btn.addEventListener("click", () => borrarMovimiento(btn.dataset.borrar));
  });
}

async function borrarMovimiento(id) {
  if (!confirm("¿Borrar este movimiento?")) return;
  const { error } = await getClient().from("movimientos").delete().eq("id", id);
  if (error) { alert("Error borrando: " + error.message); return; }
  await cargarTodo();
}

export function setupFiltros() {
  ["filtroMes", "filtroTipo", "filtroConcepto", "filtroOrigen", "filtroMoneda"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => {
      state.filtros.mes = document.getElementById("filtroMes").value;
      state.filtros.tipo = document.getElementById("filtroTipo").value;
      state.filtros.concepto = document.getElementById("filtroConcepto").value;
      state.filtros.origen = document.getElementById("filtroOrigen").value;
      state.filtros.moneda = document.getElementById("filtroMoneda").value;
      renderMovimientos();
    });
  });

  document.getElementById("btnLimpiarFiltros").addEventListener("click", () => {
    state.filtros = { mes: "", tipo: "", concepto: "", origen: "", moneda: "" };
    document.getElementById("filtroMes").value = "";
    document.getElementById("filtroTipo").value = "";
    document.getElementById("filtroConcepto").value = "";
    document.getElementById("filtroOrigen").value = "";
    document.getElementById("filtroMoneda").value = "";
    renderMovimientos();
  });
}
