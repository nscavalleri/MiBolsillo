// Dashboard > Distribución > Mensual: reporte de gastos/ingresos del mes
// elegido, sumarizado por concepto (y por moneda, si hay más de una en uso
// ese mes). Cada concepto (activo o inactivo) tiene un tilde para elegir si
// se incluye o no en el reporte; por defecto están todos incluidos.
// "Histórica" todavía no está implementada (queda en "próximamente", como
// las demás secciones pendientes del dashboard).
//
// concepto_id y moneda_id son claves foráneas hacia conceptos.id y
// monedas.id; el nombre a mostrar se resuelve con lookups.js.

import { state } from './state.js';
import { nombreMoneda } from './lookups.js';

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function mesActualTexto() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

// El <input type="month"> nativo muestra los nombres de mes según el idioma
// del navegador/sistema operativo (por eso aparecía en inglés, sin forma
// confiable de forzarlo). Para tenerlo siempre en español se arman dos
// <select> propios (mes y año) en vez de depender del control nativo.
function poblarSelectMes() {
  const sel = document.getElementById("distribMesNombre");
  sel.innerHTML = MESES.map((nombre, i) => {
    const valor = String(i + 1).padStart(2, "0");
    return `<option value="${valor}">${nombre}</option>`;
  }).join("");
}

function poblarSelectAnio() {
  const sel = document.getElementById("distribAnio");
  const anioActual = new Date().getFullYear();
  const anios = [];
  for (let a = anioActual - 5; a <= anioActual + 1; a++) anios.push(a);
  sel.innerHTML = anios.map(a => `<option value="${a}">${a}</option>`).join("");
}

function leerMesSeleccionado() {
  const mes = document.getElementById("distribMesNombre").value;
  const anio = document.getElementById("distribAnio").value;
  return anio + "-" + mes;
}

function escribirMesSeleccionado(mesTexto) {
  const [anio, mes] = mesTexto.split("-");
  document.getElementById("distribMesNombre").value = mes;
  document.getElementById("distribAnio").value = anio;
}

// Una celda de importe: verde si es mayor a cero, rojo si es menor, y un
// guión gris si no hubo movimientos (mismo criterio de color que el resto
// de la app: var(--income) / var(--expense)). Al lado va un circulito gris
// a modo de posición reservada: más adelante se va a pintar de rojo,
// amarillo o verde según si ese gasto quedó por arriba o por abajo del
// promedio (todavía no calculado).
function celdaImporte(v) {
  const semaforo = `<span class="semaforo semaforo-gris"></span>`;
  if (!v) return `<td class="valor-cero"><span>–</span>${semaforo}</td>`;
  const clase = v > 0 ? "valor-positivo" : "valor-negativo";
  return `<td class="${clase}"><span>${v.toFixed(2)}</span>${semaforo}</td>`;
}

function renderCheckboxesConceptos() {
  const cont = document.getElementById("distribConceptosCheckboxes");
  if (state.conceptos.length === 0) {
    cont.innerHTML = `<div class="empty">Todavía no hay conceptos cargados.</div>`;
    return;
  }
  const excluidos = state.distribucion.conceptosExcluidos;
  cont.innerHTML = state.conceptos.map(c => `
    <label class="check-item">
      <input type="checkbox" data-concepto-check="${c.id}" ${excluidos.has(String(c.id)) ? "" : "checked"} />
      <span class="${c.activo ? "" : "inactivo"}">${c.nombre}</span>
    </label>
  `).join("");

  cont.querySelectorAll("[data-concepto-check]").forEach(chk => {
    chk.addEventListener("change", () => {
      const id = chk.dataset.conceptoCheck;
      if (chk.checked) state.distribucion.conceptosExcluidos.delete(id);
      else state.distribucion.conceptosExcluidos.add(id);
      renderReporte();
    });
  });
}

function renderReporte() {
  const cont = document.getElementById("distribReporte");
  const mes = state.distribucion.mes || mesActualTexto();
  const excluidos = state.distribucion.conceptosExcluidos;

  // Se suma por concepto y, dentro de cada concepto, por moneda (así no se
  // mezclan importes de monedas distintas en un mismo número). El signo
  // sale del tipo de cada movimiento: ingreso suma, egreso resta.
  const porConceptoMoneda = {};
  const monedaIdsUsadas = new Set();
  state.movimientos.forEach(m => {
    if (String(m.fecha).slice(0, 7) !== mes) return;
    if (excluidos.has(String(m.concepto_id))) return;
    const signo = m.tipo === "ingreso" ? 1 : -1;
    const val = signo * Number(m.monto);
    if (!porConceptoMoneda[m.concepto_id]) porConceptoMoneda[m.concepto_id] = {};
    porConceptoMoneda[m.concepto_id][m.moneda_id] = (porConceptoMoneda[m.concepto_id][m.moneda_id] || 0) + val;
    monedaIdsUsadas.add(m.moneda_id);
  });

  if (monedaIdsUsadas.size === 0) {
    cont.innerHTML = `<div class="empty">No hay movimientos en ese mes para los conceptos seleccionados.</div>`;
    return;
  }

  const listaMonedaIds = Array.from(monedaIdsUsadas).sort((a, b) => nombreMoneda(a).localeCompare(nombreMoneda(b)));

  let html = `<div class="pivot-wrap"><table class="pivot distrib-pivot"><tr><th>Concepto</th>` +
    listaMonedaIds.map(id => `<th>${nombreMoneda(id)}</th>`).join("") + `</tr>`;

  // Solo se listan los conceptos que tuvieron movimientos ese mes (para no
  // llenar el reporte de filas en cero); los que no tuvieron simplemente no
  // aparecen.
  const totales = {};
  state.conceptos
    .filter(c => porConceptoMoneda[c.id])
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach(c => {
      const fila = porConceptoMoneda[c.id];
      html += `<tr><td>${c.nombre}</td>`;
      listaMonedaIds.forEach(monedaId => {
        const v = fila[monedaId] || 0;
        totales[monedaId] = (totales[monedaId] || 0) + v;
        html += celdaImporte(v);
      });
      html += `</tr>`;
    });

  html += `<tr class="total-row"><td>Total</td>` +
    listaMonedaIds.map(id => celdaImporte(totales[id] || 0)).join("") + `</tr>`;
  html += `</table></div>`;

  cont.innerHTML = html;
}

export function renderDistribucion() {
  if (!state.distribucion.mes) state.distribucion.mes = mesActualTexto();
  const selMes = document.getElementById("distribMesNombre");
  // Solo se completa si los select todavía no tienen nada elegido (primer
  // render), para no pisar el mes que ya haya elegido la usuaria.
  if (selMes && !selMes.value) escribirMesSeleccionado(state.distribucion.mes);
  renderCheckboxesConceptos();
  renderReporte();
}

export function setupDistribucion() {
  poblarSelectMes();
  poblarSelectAnio();
  ["distribMesNombre", "distribAnio"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => {
      state.distribucion.mes = leerMesSeleccionado();
      renderReporte();
    });
  });
}
