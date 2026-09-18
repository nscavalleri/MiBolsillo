// Carga todos los datos desde Supabase (conceptos, monedas, orígenes,
// movimientos) y dispara el re-render de toda la app. Acá vive el orden
// de los movimientos: primero los más nuevos, según la fecha ingresada
// en el campo "fecha" de cada movimiento (con la fecha de creación como
// criterio de desempate si dos movimientos tienen la misma fecha).

import { getClient } from './config.js';
import { state } from './state.js';
import { renderPivot } from './dashboard.js';
import { renderMovimientos, poblarFiltros } from './gastos.js';
import { renderConfigLista } from './configuracion.js';
import { poblarSelects } from './modal.js';

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
  const [c, m, o, mv] = await Promise.all([
    supabaseClient.from("conceptos").select("*").order("nombre"),
    supabaseClient.from("monedas").select("*").order("nombre"),
    supabaseClient.from("origenes").select("*").order("nombre"),
    supabaseClient.from("movimientos").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false }),
  ]);

  const errores = [c.error, m.error, o.error, mv.error].filter(Boolean);
  const errEl = document.getElementById("loadError");
  if (errores.length > 0) {
    console.error("Error cargando datos de Supabase:", errores);
    errEl.textContent = "No se pudieron cargar todos los datos (" + errores.map(e => e.message).join(" / ") + "). Revisá la conexión o las políticas de acceso.";
    errEl.style.display = "block";
  } else {
    errEl.style.display = "none";
  }

  state.conceptos = c.data || [];
  state.monedas = m.data || [];
  state.origenes = o.data || [];
  // Se reordena también acá (además del .order() de la consulta) como
  // resguardo: así el criterio de "más nuevo primero" queda garantizado
  // sin depender únicamente de lo que devuelva la base de datos.
  state.movimientos = ordenarMovimientos(mv.data || []);
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
}
