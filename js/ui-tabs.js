// Lógica genérica de pestañas: sirve tanto para las principales
// (Dashboard / Gastos / Configuración) como para cada grupo de
// sub-pestañas, evitando repetir el mismo código para cada nivel.

export function setupTabGroup(containerId, attr, sections) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      container.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const val = btn.dataset[attr];
      Object.keys(sections).forEach(key => {
        const el = document.getElementById(sections[key]);
        if (el) el.style.display = (key === val) ? "block" : "none";
      });
    });
  });
}

export function setupAllTabs() {
  setupTabGroup("mainTabs", "maintab", {
    dashboard: "section-dashboard",
    gastos: "section-gastos",
    configuracion: "section-configuracion",
  });
  setupTabGroup("dashboardSubtabs", "subtab", {
    snapshot: "sub-snapshot",
    evolucion: "sub-evolucion",
    distribucion: "sub-distribucion",
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
  });
}
