// Carga todos los datos desde Supabase (conceptos, monedas, orígenes,
// movimientos) y dispara el re-render de toda la app. Acá vive el orden
// de los movimientos: primero los más nuevos, según la fecha ingresada
// en el campo "fecha" de cada movimiento (con la fecha de creación como
// criterio de desempate si dos movimientos tienen la misma fecha).
//
// origen_id y moneda_id son claves foráneas hacia origenes.id y
// monedas.id; los nombres a mostrar se resuelven con lookups.js a partir
// de state.origenes / state.monedas.

import { getClient } from './config.js';
import { state } from './state.js';
import { renderPivot } from './dashboard.js';
import { renderMovimientos, poblarFiltros } from './gastos.js';
import { renderConfigLista } from './configuracion.js';
import { poblarSelects } from './modal.js';
import { renderConciliacion } from './conciliacion.js';

function ordenarMovimientos(lista) {
  // Más nuevo primero: por fecha descendente y, si coinciden, por
  // created_at descendente (para que el orden sea siempre estable y
  // predecible aunque dos movimientos tengan la misma fecha).
  return lista.slice().sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}

export async function cargarTodo() {
  const supabaseClient = getClient();
  const [c, m, o, mv, cc] = await Promise.all([
    supabaseClient.from("conceptos").select("*").order("nombre"),
    supabaseClient.from("monedas").select("*").order("nombre"),
    supabaseClient.from("origenes").select("*").order("nombre"),
    supabaseClient.from("movimientos").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false }),
    supabaseClient.from("conciliacion_checks").select("*"),
  ]);

  const errores = [c.error, m.error, o.error, mv.error, cc.error].filter(Boolean);
  const errEl = document.getElementById("loadError");
  if (errores.length > 0) {
    console.error("Error cargando datos de Supabase:", errores);
    errEl.textContent = "No se pudieron cargar todos los datos (" + errores.map(e => e.message).join(" / ") + "). Revisá la conexión o las políticas de acceso.";
    errEl.style.display = "block";
  } else {
    errEl.style.display = "none";
  }

  // Importante: origenes y monedas se guardan antes que movimientos, ya
  // que dashboard.js / gastos.js / conciliacion.js resuelven origen_id y
  // moneda_id contra estas listas al armar el render.
  state.conceptos = c.data || [];
  state.monedas = m.data || [];
  state.origenes = o.data || [];
  // Se reordena también acá (además del .order() de la consulta) como
  // resguardo: así el criterio de "más nuevo primero" queda garantizado
  // sin depender únicamente de lo que devuelva la base de datos.
  state.movimientos = ordenarMovimientos(mv.data || []);

  // Estado de los tildes de conciliación en curso, indexado por
  // "origen_id::moneda_id".
  state.conciliacionChecks = {};
  (cc.data || []).forEach(row => {
    state.conciliacionChecks[row.origen_id + "::" + row.moneda_id] = !!row.conciliado;
  });

  renderTodo();
}

function renderTodo() {
  renderPivot();
  renderMovimientos();
  renderConfigLista("conceptos", state.conceptos, "listaConceptos");
  renderConfigLista("monedas", state.monedas, "listaMonedas");
  renderConfigLista("origenes", state.origenes, "listaOrigenes");
  poblarSelects();
  poblarFiltros();
  renderConciliacion();
}
