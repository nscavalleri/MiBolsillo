// Configuración > Tipo de cambio: para cada mes-año que tiene movimientos
// cargados, permite ingresar a cuánto equivalía 1 unidad de cada moneda
// (que no sea Euros) en euros, ese mes. Con el tiempo esto queda como el
// histórico de tipos de cambio a euros; por ahora solo se guarda, todavía
// no se usa para convertir nada automáticamente en ningún otro reporte.
//
// Se guarda en la tabla tipos_cambio (mes, moneda_id, valor_eur), con una
// fila por combinación mes-moneda (columna UNIQUE en la base). Cada campo
// se guarda solo al salir de él (mismo criterio que el resto de la app),
// sin un botón "Guardar" aparte.

import { state } from './state.js';
import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';
import { formatoMesLegible } from './distribucion.js';

function valorGuardado(mes, monedaId) {
  const fila = state.tiposCambio.find(
    tc => tc.mes === mes && String(tc.moneda_id) === String(monedaId)
  );
  return fila && fila.valor_eur != null ? fila.valor_eur : "";
}

export function renderTipoCambio() {
  const cont = document.getElementById("tablaTipoCambio");
  if (!cont) return;

  // Un bloque por cada mes-año que tenga al menos un movimiento cargado,
  // del más reciente al más antiguo (mismo criterio que "Todos los
  // movimientos").
  const meses = Array.from(new Set(state.movimientos.map(m => String(m.fecha).slice(0, 7))))
    .sort()
    .reverse();

  if (meses.length === 0) {
    cont.innerHTML = `<div class="empty">Todavía no hay movimientos cargados.</div>`;
    return;
  }

  const bloques = meses.map(mes => {
    // Solo las monedas que tuvieron movimientos ese mes en particular (así
    // no aparecen columnas vacías para monedas que ese mes no se usaron), y
    // sin Euros: convertir euros a euros no aporta nada.
    const monedaIdsDelMes = new Set(
      state.movimientos
        .filter(m => String(m.fecha).slice(0, 7) === mes)
        .map(m => String(m.moneda_id))
    );
    const monedas = state.monedas
      .filter(m => monedaIdsDelMes.has(String(m.id)) && m.nombre.trim().toLowerCase() !== "euros")
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    if (monedas.length === 0) return "";

    const campos = monedas.map(m => `
      <div class="tipo-cambio-campo">
        <label>${m.nombre}</label>
        <input type="number" step="0.000001" min="0" placeholder="0.00"
               data-tc-mes="${mes}" data-tc-moneda="${m.id}"
               value="${valorGuardado(mes, m.id)}" />
      </div>
    `).join("");

    return `
      <div class="card">
        <h4 style="margin-top:0;">${formatoMesLegible(mes)}</h4>
        <div class="tipo-cambio-grid">${campos}</div>
      </div>`;
  }).join("");

  cont.innerHTML = bloques || `<div class="empty">Ninguno de los meses cargados tiene monedas distintas de Euros para convertir.</div>`;

  cont.querySelectorAll("[data-tc-mes]").forEach(input => {
    input.addEventListener("change", async () => {
      const mes = input.dataset.tcMes;
      const monedaId = input.dataset.tcMoneda;
      const valor = input.value === "" ? null : Number(input.value);
      const { error } = await getClient()
        .from("tipos_cambio")
        .upsert({ mes, moneda_id: monedaId, valor_eur: valor }, { onConflict: "mes,moneda_id" });
      if (error) {
        alert("No se pudo guardar: " + error.message);
        return;
      }
      await cargarTodo();
    });
  });
}
