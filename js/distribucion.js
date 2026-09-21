// Dashboard > Distribución: filtros y reporte por concepto/moneda.
//
// "Conceptos a incluir" y "Monedas a incluir" son compartidos entre Mensual
// e Histórica (se ven arriba de las dos, no adentro de una sola), porque la
// idea es elegir una sola vez qué conceptos y qué monedas importan y que
// eso valga para cualquiera de las dos vistas. Cada tilde (activo/inactivo
// para conceptos, cada moneda) se guarda al toque en su propia fila
// (conceptos.incluir_en_distribucion / monedas.incluir_en_distribucion,
// columnas agregadas a esas tablas existentes), así se recuerda entre
// sesiones en vez de reiniciarse cada vez que se entra a la pantalla.
//
// "Mensual" arma el reporte del mes elegido, sumarizado por concepto (y por
// moneda, si hay más de una en uso ese mes). "Histórica" arma, para cada
// moneda seleccionada, una tabla con una fila por mes-año y una columna por
// cada concepto seleccionado (sin semáforo: acá solo importa el número).
// Ambas parten de los mismos tildes de conceptos y monedas.
//
// Todo se calcula al vuelo a partir de state.movimientos en cada render, en
// vez de guardar una "foto" mensual como si fuera una conciliación. Se
// eligió así porque si en algún momento se corrige un movimiento de un mes
// viejo (un monto mal cargado, un concepto equivocado), el histórico tiene
// que reflejar ese cambio de una; con una foto guardada quedaría desactua-
// lizada hasta recalcularla a mano. Total de movimientos: mientras sea un
// volumen personal (no decenas de miles), recalcular todo en el navegador
// cada vez es instantáneo, así que no hace falta la complejidad extra de
// guardar y mantener snapshots.
//
// concepto_id y moneda_id son claves foráneas hacia conceptos.id y
// monedas.id; el nombre a mostrar se resuelve con lookups.js.

import { state } from './state.js';
import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';
import { nombreMoneda } from './lookups.js';

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Versión corta (3 letras), para mostrar el mes en columnas angostas como
// la primera columna de la tabla de Histórica (con el nombre completo, un
// mes como "Septiembre 2026" no entraba en una línea y se partía en dos).
const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
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
// de la app: var(--income) / var(--expense)). En Mensual además va, al lado
// del número, un circulito gris a modo de posición reservada (más adelante
// se va a pintar de rojo, amarillo o verde según si ese gasto quedó por
// arriba o por abajo del promedio); en Histórica no aplica, así que se
// puede omitir con conSemaforo=false. El número (y el circulito, si va) se
// arman adentro de un span propio (no en el <td> directamente): poner
// display:flex en el <td> lo saca del layout de tabla y rompe las columnas.
function celdaImporte(v, conSemaforo) {
  const semaforo = conSemaforo ? `<span class="semaforo semaforo-gris"></span>` : "";
  if (!v) return `<td class="valor-cero"><span class="valor-wrap"><span>–</span>${semaforo}</span></td>`;
  const clase = v > 0 ? "valor-positivo" : "valor-negativo";
  return `<td class="${clase}"><span class="valor-wrap"><span>${v.toFixed(2)}</span>${semaforo}</span></td>`;
}

// Arma la lista de tildes para "conceptos" o "monedas" (misma lógica para
// las dos, por eso la tabla se recibe como parámetro) y guarda cada cambio
// al toque en incluir_en_distribucion, para que se recuerde entre sesiones.
// it.incluir_en_distribucion viene de la base (columnas nuevas, ver ALTER
// TABLE); si todavía no existen esas columnas llega undefined, y
// undefined !== false se toma como "incluido" (mismo comportamiento que hoy,
// hasta que se agreguen).
function renderCheckboxesTabla(tabla, items, contenedorId, vacioTexto) {
  const cont = document.getElementById(contenedorId);
  if (items.length === 0) {
    cont.innerHTML = `<div class="empty">${vacioTexto}</div>`;
    return;
  }
  cont.innerHTML = items.map(it => `
    <label class="check-item">
      <input type="checkbox" data-incluir="${tabla}:${it.id}" ${it.incluir_en_distribucion !== false ? "checked" : ""} />
      <span class="${it.activo ? "" : "inactivo"}">${it.nombre}</span>
    </label>
  `).join("");

  cont.querySelectorAll("[data-incluir]").forEach(chk => {
    chk.addEventListener("change", async () => {
      const [tab, id] = chk.dataset.incluir.split(":");
      const { error } = await getClient()
        .from(tab)
        .update({ incluir_en_distribucion: chk.checked })
        .eq("id", id);
      if (error) {
        alert("No se pudo guardar: " + error.message);
        chk.checked = !chk.checked;
        return;
      }
      await cargarTodo();
    });
  });
}

function renderCheckboxesConceptos() {
  renderCheckboxesTabla("conceptos", state.conceptos, "distribConceptosCheckboxes", "Todavía no hay conceptos cargados.");
}

function renderCheckboxesMonedas() {
  renderCheckboxesTabla("monedas", state.monedas, "distribMonedasCheckboxes", "Todavía no hay monedas cargadas.");
}

function renderReporte() {
  const cont = document.getElementById("distribReporte");
  const mes = state.distribucion.mes || mesActualTexto();
  const conceptoIdsIncluidos = new Set(
    state.conceptos.filter(c => c.incluir_en_distribucion !== false).map(c => String(c.id))
  );
  const monedaIdsIncluidas = new Set(
    state.monedas.filter(m => m.incluir_en_distribucion !== false).map(m => String(m.id))
  );

  // Se suma por concepto y, dentro de cada concepto, por moneda (así no se
  // mezclan importes de monedas distintas en un mismo número). El signo
  // sale del tipo de cada movimiento: ingreso suma, egreso resta.
  const porConceptoMoneda = {};
  const monedaIdsUsadas = new Set();
  state.movimientos.forEach(m => {
    if (String(m.fecha).slice(0, 7) !== mes) return;
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    if (!monedaIdsIncluidas.has(String(m.moneda_id))) return;
    const signo = m.tipo === "ingreso" ? 1 : -1;
    const val = signo * Number(m.monto);
    if (!porConceptoMoneda[m.concepto_id]) porConceptoMoneda[m.concepto_id] = {};
    porConceptoMoneda[m.concepto_id][m.moneda_id] = (porConceptoMoneda[m.concepto_id][m.moneda_id] || 0) + val;
    monedaIdsUsadas.add(m.moneda_id);
  });

  if (monedaIdsUsadas.size === 0) {
    cont.innerHTML = `<div class="empty">No hay movimientos en ese mes para los conceptos y monedas seleccionados.</div>`;
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
        html += celdaImporte(v, true);
      });
      html += `</tr>`;
    });

  html += `<tr class="total-row"><td>Total</td>` +
    listaMonedaIds.map(id => celdaImporte(totales[id] || 0, true)).join("") + `</tr>`;
  html += `</table></div>`;

  cont.innerHTML = html;
}

// Se exporta para poder reutilizarla en Configuración > Tipo de cambio
// (misma manera de mostrar un mes-año en poco espacio).
export function formatoMesLegible(mesTexto) {
  const [anio, mes] = mesTexto.split("-");
  return `${MESES_CORTOS[Number(mes) - 1]}-${anio}`;
}

// Para una moneda puntual: agrupa los movimientos de esa moneda (entre los
// conceptos incluidos) por mes-año y por concepto.
function calcularHistoricoPorMoneda(monedaId, conceptoIdsIncluidos) {
  const porMesConcepto = {};
  const mesesUsados = new Set();
  state.movimientos.forEach(m => {
    if (String(m.moneda_id) !== String(monedaId)) return;
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    const mes = String(m.fecha).slice(0, 7);
    const signo = m.tipo === "ingreso" ? 1 : -1;
    const val = signo * Number(m.monto);
    if (!porMesConcepto[mes]) porMesConcepto[mes] = {};
    porMesConcepto[mes][m.concepto_id] = (porMesConcepto[mes][m.concepto_id] || 0) + val;
    mesesUsados.add(mes);
  });
  return { porMesConcepto, mesesUsados };
}

// Arma la sección (colapsable) de una moneda: una tabla con una fila por
// mes-año y una columna por cada concepto seleccionado (aparecen todos los
// conceptos tildados, tengan o no movimientos en esta moneda puntual, para
// que las columnas sean las mismas en todas las secciones).
function renderSeccionHistorica(moneda, conceptosIncluidos, conceptoIdsIncluidos, orden) {
  const { porMesConcepto, mesesUsados } = calcularHistoricoPorMoneda(moneda.id, conceptoIdsIncluidos);
  let listaMeses = Array.from(mesesUsados).sort(); // "YYYY-MM" ordena bien como texto
  if (orden === "desc") listaMeses.reverse();

  if (listaMeses.length === 0) {
    return `
      <div class="card">
        <details class="collapsible" open>
          <summary>${moneda.nombre}</summary>
          <p class="empty">No hay movimientos en ${moneda.nombre} para los conceptos seleccionados.</p>
        </details>
      </div>`;
  }

  let tabla = `<table class="pivot distrib-pivot"><tr><th>Mes</th>` +
    conceptosIncluidos.map(c => `<th>${c.nombre}</th>`).join("") + `</tr>`;
  listaMeses.forEach(mes => {
    tabla += `<tr><td>${formatoMesLegible(mes)}</td>`;
    conceptosIncluidos.forEach(c => {
      const v = (porMesConcepto[mes] && porMesConcepto[mes][c.id]) || 0;
      tabla += celdaImporte(v, false);
    });
    tabla += `</tr>`;
  });
  tabla += `</table>`;

  return `
    <div class="card">
      <details class="collapsible" open>
        <summary>${moneda.nombre}</summary>
        <div class="pivot-wrap">${tabla}</div>
      </details>
    </div>`;
}

function renderHistorico() {
  const cont = document.getElementById("distribHistoricoSecciones");
  const conceptosIncluidos = state.conceptos
    .filter(c => c.incluir_en_distribucion !== false)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const conceptoIdsIncluidos = new Set(conceptosIncluidos.map(c => String(c.id)));
  const monedasIncluidas = state.monedas
    .filter(m => m.incluir_en_distribucion !== false)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  if (conceptosIncluidos.length === 0 || monedasIncluidas.length === 0) {
    cont.innerHTML = `<div class="card"><p class="empty">Elegí al menos un concepto y una moneda arriba para armar el histórico.</p></div>`;
    return;
  }

  cont.innerHTML = monedasIncluidas
    .map(moneda => renderSeccionHistorica(moneda, conceptosIncluidos, conceptoIdsIncluidos, state.distribucion.ordenHistorico))
    .join("");
}

export function renderDistribucion() {
  if (!state.distribucion.mes) state.distribucion.mes = mesActualTexto();
  // Un <select> sin nada elegido todavía no queda "vacío": el navegador
  // hace propia la primera opción de la lista (por eso aparecía siempre
  // "Enero" y el primer año del rango). Por eso acá se escribe el valor
  // directamente desde el estado en cada render, en vez de preguntar si el
  // select "ya tiene algo cargado".
  escribirMesSeleccionado(state.distribucion.mes);
  const selOrden = document.getElementById("distribOrdenHistorico");
  if (selOrden) selOrden.value = state.distribucion.ordenHistorico;
  renderCheckboxesConceptos();
  renderCheckboxesMonedas();
  renderReporte();
  renderHistorico();
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

  document.getElementById("distribOrdenHistorico").addEventListener("change", (e) => {
    state.distribucion.ordenHistorico = e.target.value;
    renderHistorico();
  });
}
