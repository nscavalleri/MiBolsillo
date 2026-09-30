// Configuración > Tipo de cambio: una tabla con una fila por cada mes-año
// que tiene movimientos cargados y una columna por cada moneda (menos
// Euros: convertir euros a euros no aporta nada). En cada celda se ingresa
// a cuánto equivalía 1 unidad de esa moneda en euros, ese mes — CON DOS
// EXCEPCIONES: Oro y Pesos (ver el párrafo de abajo y el comentario de
// convertirAEuros en distribucion.js). Con el tiempo esto queda como el
// histórico de tipos de cambio a euros; se usa para convertir en
// Evolución/Distribución/Flujo de caja/Snapshot/Asignación (ver
// convertirAEuros/convertirAEurosMasReciente).
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
//
// CASO ESPECIAL: Oro. Lo que se carga en esa columna no es un valor
// directo en euros como el resto: es cuántos DÓLARES vale 1 unidad de oro
// ese mes (por ejemplo, 1 gramo de oro de 24k a 115 USD). El código
// (convertirAEuros/convertirAEurosMasReciente) ya sabe esto y encadena la
// conversión a través del tipo de cambio de Dólares de ese mismo mes. La
// aclaración de qué va en esta columna vive en el párrafo de ayuda de
// arriba de la tabla (index.html), no en el encabezado de la columna (que
// a pedido de Nadia quedó con el nombre de la moneda solo, sin sufijo).
//
// CASO ESPECIAL: Pesos. Mismo motivo que Oro pero al revés: lo que se
// carga en esa columna es cuántos PESOS vale 1 DÓLAR ese mes — el valor
// no oficial (por ejemplo, 1 USD equivale a 1560 pesos), no euros directos
// ni dólares por peso. El código encadena la conversión dividiendo por
// este valor y multiplicando por el tipo de cambio de Dólares de ese
// mismo mes (ver convertirAEuros). OJO: los meses que ya tenía cargados
// Nadia con el formato viejo (euros por peso, un número chiquito tipo
// 0.000566) quedan tal cual están — Nadia los va a volver a cargar ella
// misma, mes por mes, en el formato nuevo; no se migraron automáticamente
// (decisión explícita de Nadia, ver el changelog).

import { state } from './state.js';
import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';
import { formatoMesLegible } from './distribucion.js';
import { avisarError } from './aviso-modal.js';

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

  // Un clic en cualquier parte del casillero enfoca su campo, incluido el
  // borde. Las celdas dejan unos pocos pixeles de aire alrededor del input
  // para que las columnas no queden pegadas una contra la otra, y sin esto un
  // clic que caiga justo ahí no hace nada: se siente como que la primera vez
  // no te deja escribir y hay que hacer clic de nuevo. Fue exactamente el
  // problema que reportó Nadia (ver también el comentario del CSS de
  // .tipo-cambio-tabla). Va en mousedown y no en click para que el foco quede
  // puesto antes de que el navegador decida por su cuenta a dónde mandarlo.
  cont.querySelectorAll("td").forEach(celda => {
    celda.addEventListener("mousedown", (e) => {
      if (e.target !== celda) return; // el clic ya cayó adentro del input
      const campo = celda.querySelector("input");
      if (!campo) return;
      e.preventDefault();
      campo.focus();
    });
  });

  cont.querySelectorAll("[data-tc-mes]").forEach(input => {
    input.addEventListener("change", async () => {
      const mes = input.dataset.tcMes;
      const monedaId = input.dataset.tcMoneda;
      const valor = input.value === "" ? null : Number(input.value);
      const { error } = await getClient()
        .from("tipos_cambio")
        .upsert({ mes, moneda_id: monedaId, valor_eur: valor }, { onConflict: "mes,moneda_id" });
      if (error) {
        avisarError("No se pudo guardar: " + error.message);
        return;
      }
      await cargarTodo();
    });
  });
}
