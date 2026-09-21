// Configuración > Tipo de cambio: una tabla con una fila por cada mes-año
// que tiene movimientos cargados y una columna por cada moneda (menos
// Euros: convertir euros a euros no aporta nada). En cada celda se ingresa
// a cuánto equivalía 1 unidad de esa moneda en euros, ese mes. Con el
// tiempo esto queda como el histórico de tipos de cambio a euros; por
// ahora solo se guarda, todavía no se usa para convertir nada
// automáticamente en ningún otro reporte.
//
// Se guarda en la tabla tipos_cambio (mes, moneda_id, valor_eur), con una
// fila por combinación mes-moneda (columna UNIQUE en la base). Cada celda
// se guarda sola al salir de ella (mismo criterio que el resto de la
// app), sin un botón "Guardar" aparte.
//
// A diferencia de la tabla de Histórica (que solo lista las monedas
// tildadas en "Monedas a incluir" de Distribución), acá aparecen todas
// las monedas cargadas (menos Euros), tuvieron o no movimientos en un mes
// puntual: así se puede completar el tipo de cambio de una moneda para un
// mes aunque ese mes en particular no haya tenido ningún gasto en ella.

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

  // Un mes por cada mes-año que tenga al menos un movimiento cargado, del
  // más reciente al más antiguo (mismo criterio que "Todos los
  // movimientos").
  const meses = Array.from(new Set(state.movimientos.map(m => String(m.fecha).slice(0, 7))))
    .sort()
    .reverse();

  const monedas = state.monedas
    .filter(m => m.nombre.trim().toLowerCase() !== "euros")
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  if (meses.length === 0) {
    cont.innerHTML = `<div class="empty">Todavía no hay movimientos cargados.</div>`;
    return;
  }
  if (monedas.length === 0) {
    cont.innerHTML = `<div class="empty">No hay ninguna moneda (además de Euros) cargada para convertir.</div>`;
    return;
  }

  let tabla = `<table class="pivot distrib-pivot tipo-cambio-tabla"><tr><th>Mes</th>` +
    monedas.map(m => `<th>${m.nombre}</th>`).join("") + `</tr>`;

  meses.forEach(mes => {
    tabla += `<tr><td>${formatoMesLegible(mes)}</td>`;
    monedas.forEach(m => {
      tabla += `<td><input type="number" step="0.000001" min="0" placeholder="0.00"
        data-tc-mes="${mes}" data-tc-moneda="${m.id}"
        value="${valorGuardado(mes, m.id)}" /></td>`;
    });
    tabla += `</tr>`;
  });
  tabla += `</table>`;

  cont.innerHTML = `<div class="pivot-wrap">${tabla}</div>`;

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
