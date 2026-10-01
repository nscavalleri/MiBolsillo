// Lógica genérica de pestañas: sirve tanto para las principales
// (Dashboard / Gastos / Configuración) como para cada grupo de
// sub-pestañas, evitando repetir el mismo código para cada nivel.
//
// Qué pestaña quedó elegida en cada grupo se guarda en sessionStorage (a
// pedido de Nadia): "cada vez que entro a la URL" tiene que mostrar el
// default de siempre (Gastos > Movimientos, marcado como "active" en el
// HTML de cada grupo — eso no se tocó), pero si cambia de pestaña del
// NAVEGADOR (u otra app) y vuelve, no quiere perder la pantalla en la que
// estaba. El caso típico es que el navegador descargue de memoria la
// pestaña en segundo plano y la recargue sola al volver a mirarla: eso
// dispara un load de cero (se pierde cualquier cosa que viviera solo en
// variables JS), pero sigue siendo la MISMA sesión de navegación, así que
// sessionStorage sigue teniendo lo guardado. localStorage en cambio
// hubiera sobrevivido también a cerrar el navegador del todo — que es
// justo el caso en el que Nadia SÍ quiere volver al default — por eso se
// usa sessionStorage y no localStorage.
const PREFIJO_STORAGE = "mibolsillo_tab_";

function guardarTab(containerId, val) {
  // Si sessionStorage no está disponible (pasa en algunos navegadores en
  // modo privado), que no se recuerde entre recargados no es motivo para
  // romper el cambio de pestaña en sí — por eso el try/catch silencioso.
  try { sessionStorage.setItem(PREFIJO_STORAGE + containerId, val); } catch (e) { /* no pasa nada */ }
}

function leerTabGuardada(containerId) {
  try { return sessionStorage.getItem(PREFIJO_STORAGE + containerId); } catch (e) { return null; }
}

// Deja activa la pestaña "val" de este grupo: marca su botón y muestra
// solo su sección. "guardar" es false cuando se llama para RESTAURAR lo
// guardado al armar la página (no hace falta reescribir lo mismo que se
// acaba de leer).
function activarTab(containerId, container, attr, sections, val, guardar) {
  container.querySelectorAll("button").forEach(b => {
    b.classList.toggle("active", b.dataset[attr] === val);
  });
  Object.keys(sections).forEach(key => {
    const el = document.getElementById(sections[key]);
    if (el) el.style.display = (key === val) ? "block" : "none";
  });
  if (guardar) guardarTab(containerId, val);
}

export function setupTabGroup(containerId, attr, sections) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => activarTab(containerId, container, attr, sections, btn.dataset[attr], true));
  });

  // Restaura la pestaña guardada en ESTA sesión de navegación, si hay una
  // y su sección sigue existiendo (por si algún día se saca una
  // sub-pestaña). Si no hay nada guardado —entrada de cero, sessionStorage
  // recién vacío— se deja tal cual el default que ya marca el HTML.
  const guardada = leerTabGuardada(containerId);
  if (guardada && sections[guardada]) {
    activarTab(containerId, container, attr, sections, guardada, false);
  }
}

export function setupAllTabs() {
  setupTabGroup("mainTabs", "maintab", {
    dashboard: "section-dashboard",
    gastos: "section-gastos",
    configuracion: "section-configuracion",
  });
  // Snapshot, Evolución, Distribución y Flujo de caja son independientes
  // entre sí (Mensual, Histórica y Flujo de caja cada una tiene su propio
  // mes, ver js/distribucion.js y js/flujo-caja.js), así que no hace falta
  // re-renderizar ninguna al mostrarla: cambiar de pestaña acá solo cambia
  // qué está a la vista. Flujo de caja es una pestaña más de Dashboard (no
  // una sub-pestaña de Distribución), a pedido de Nadia.
  setupTabGroup("dashboardSubtabs", "subtab", {
    snapshot: "sub-snapshot",
    evolucion: "sub-evolucion",
    distribucion: "sub-distribucion",
    flujo: "sub-flujo",
  });
  setupTabGroup("distribucionSubtabs", "distribsub", {
    mensual: "distrib-mensual",
    historica: "distrib-historica",
  });
  // Flujo de caja también tiene Mensual/Histórica, espejo de Distribución
  // (a pedido de Nadia) — ver js/flujo-caja.js.
  setupTabGroup("flujoSubtabs", "flujosub", {
    mensual: "flujo-mensual",
    historica: "flujo-historica",
  });
  setupTabGroup("gastosSubtabs", "subtab", {
    movimientos: "sub-movimientos",
    asignacion: "sub-asignacion",
    conciliacion: "sub-conciliacion",
  });
  setupTabGroup("configSubtabs", "configsub", {
    conceptos: "configsub-conceptos",
    monedas: "configsub-monedas",
    origenes: "configsub-origenes",
    tipo_cambio: "configsub-tipo_cambio",
    reservas: "configsub-reservas",
    backup: "configsub-backup",
  });
}
