// Gastos > Movimientos: filtros combinables y listado (más nuevo primero,
// según la fecha ingresada en cada movimiento). Concepto, origen y moneda
// se guardan como concepto_id / origen_id / moneda_id (claves foráneas);
// acá se resuelve el nombre a mostrar con lookups.js.

import { state } from './state.js';
import { getClient } from './config.js';
import { abrirModal } from './modal.js';
import { cargarTodo } from './data-service.js';
import { nombreOrigen, nombreMoneda, nombreConcepto } from './lookups.js';

export function aplicarFiltros(lista) {
  const f = state.filtros;
  return lista.filter(m => {
    if (f.mes && String(m.fecha).slice(0, 7) !== f.mes) return false;
    if (f.tipo && m.tipo !== f.tipo) return false;
    if (f.concepto && String(m.concepto_id) !== f.concepto) return false;
    if (f.origen && String(m.origen_id) !== f.origen) return false;
    if (f.moneda && String(m.moneda_id) !== f.moneda) return false;
    return true;
  });
}

export function poblarFiltros() {
  const selConcepto = document.getElementById("filtroConcepto");
  const selOrigen = document.getElementById("filtroOrigen");
  const selMoneda = document.getElementById("filtroMoneda");
  const prevConcepto = selConcepto.value, prevOrigen = selOrigen.value, prevMoneda = selMoneda.value;
  selConcepto.innerHTML = `<option value="">Todos</option>` + state.conceptos.map(c => `<option value="${c.id}">${c.nombre}</option>`).join("");
  selOrigen.innerHTML = `<option value="">Todos</option>` + state.origenes.map(o => `<option value="${o.id}">${o.nombre}</option>`).join("");
  selMoneda.innerHTML = `<option value="">Todos</option>` + state.monedas.map(m => `<option value="${m.id}">${m.nombre}</option>`).join("");
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
    renderPaginacion(0, 0, 0, 0);
    return;
  }

  // La paginación se calcula SIEMPRE sobre la lista ya filtrada, así los
  // filtros siguen mandando: si dice "1-10 de 37", esos 37 son los
  // movimientos que pasan los filtros, no los que hay en total. Si la
  // página en la que estabas quedó más allá del final (porque filtraste
  // más fino, cambiaste cuántos se muestran o borraste un movimiento), se
  // vuelve sola a la última página que sí existe.
  const porPagina = state.paginacion.porPagina;
  const totalPaginas = Math.ceil(lista.length / porPagina);
  if (state.paginacion.pagina > totalPaginas) state.paginacion.pagina = totalPaginas;
  if (state.paginacion.pagina < 1) state.paginacion.pagina = 1;
  const desde = (state.paginacion.pagina - 1) * porPagina;
  const pagina = lista.slice(desde, desde + porPagina);

  renderPaginacion(lista.length, totalPaginas, desde + 1, desde + pagina.length);

  el.innerHTML = pagina.map(m => `
    <div class="movimiento">
      <div class="info">
        <div class="concepto">${nombreConcepto(m.concepto_id)}</div>
        <div class="detalle">${m.fecha} · ${nombreOrigen(m.origen_id)}${m.descripcion ? " · " + m.descripcion : ""}</div>
      </div>
      <div class="monto ${m.tipo}">${m.tipo === "egreso" ? "-" : "+"}${Number(m.monto).toFixed(2)} ${nombreMoneda(m.moneda_id)}</div>
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

// Pinta la barra de paginación de abajo de la lista: el selector de cuántos
// mostrar (que siempre refleja lo guardado), el texto "1-10 de 37" y los
// dos botones de mover página, deshabilitados cuando no hay a dónde ir.
// Con la lista vacía se esconde entera.
function renderPaginacion(total, totalPaginas, primero, ultimo) {
  const barra = document.getElementById("paginacionMovimientos");
  if (!barra) return;

  if (total === 0) {
    barra.style.display = "none";
    return;
  }
  barra.style.display = "flex";

  document.getElementById("movimientosPorPagina").value = String(state.paginacion.porPagina);
  document.getElementById("paginacionInfo").textContent =
    `${primero}-${ultimo} de ${total}`;
  document.getElementById("btnPagAnterior").disabled = state.paginacion.pagina <= 1;
  document.getElementById("btnPagSiguiente").disabled = state.paginacion.pagina >= totalPaginas;
}

export function setupPaginacion() {
  // Cambiar cuántos se muestran por página se guarda en Supabase (tabla
  // configuracion_general), igual que "Convertir todo a Euros": se guarda
  // primero y recién después se recarga todo con cargarTodo(), que es quien
  // pisa state.paginacion.porPagina con lo recién guardado.
  document.getElementById("movimientosPorPagina").addEventListener("change", async (e) => {
    const valor = e.target.value;
    const anterior = state.paginacion.porPagina;
    const { error } = await getClient()
      .from("configuracion_general")
      .upsert({ clave: "movimientos_por_pagina", valor: String(valor) }, { onConflict: "clave" });
    if (error) {
      alert("No se pudo guardar: " + error.message);
      e.target.value = String(anterior);
      return;
    }
    // Al cambiar el tamaño de página se vuelve al principio de la lista,
    // porque "la página 4" con otro tamaño ya no significa lo mismo.
    state.paginacion.pagina = 1;
    await cargarTodo();
  });

  document.getElementById("btnPagAnterior").addEventListener("click", () => {
    state.paginacion.pagina -= 1;
    renderMovimientos();
  });

  document.getElementById("btnPagSiguiente").addEventListener("click", () => {
    state.paginacion.pagina += 1;
    renderMovimientos();
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
      // Cada vez que cambia un filtro se vuelve a la primera página: si no,
      // al filtrar estando en la página 5 podría parecer que no hay
      // resultados cuando en realidad sí los hay, más arriba.
      state.paginacion.pagina = 1;
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
    state.paginacion.pagina = 1;
    renderMovimientos();
  });
}
