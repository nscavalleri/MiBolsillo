// Gastos > Asignación: repartir la plata que hay hoy en cada cuenta entre
// las reservas. Es la versión en pantalla de la planilla que Nadia usaba:
// las cuentas van en las filas, las reservas en las columnas, y en cada
// celda se escribe cuánto de esa cuenta está destinado a esa reserva.
//
// De dónde sale la plata a repartir: de la misma cuenta que Dashboard >
// Snapshot, columna "Total (€)" (dashboard.js exporta saldoEnEurosPorOrigen
// justamente para no duplicar ese cálculo acá). Por eso "Conceptos a
// incluir" de esta pantalla NO es una selección aparte: usa la misma
// columna conceptos.incluir_en_snapshot que Snapshot, así lo que destildás
// en una pantalla se destilda en la otra (fue un pedido explícito).
//
// Los tres colores que se usan en toda la pantalla, siempre con el mismo
// significado:
//   verde  = está justo (no queda plata sin repartir / la reserva llegó a
//            su objetivo)
//   ámbar  = falta trabajo pero no hay error (todavía queda plata sin
//            repartir en esa cuenta)
//   rojo   = algo no cierra: o repartiste más plata de la que hay en esa
//            cuenta, o la reserva no llegó al objetivo que le pusiste.
//
// Se guarda en la tabla asignaciones (origen_id, reserva_id, monto), con
// una fila por combinación cuenta-reserva (UNIQUE en la base). Cada celda
// se guarda sola al salir de ella, igual que la tabla de Tipo de cambio;
// mientras escribís, los totales y los sobrantes se recalculan en vivo sin
// tocar la base (ver guardarCelda al final, que explica por qué acá no se
// recarga todo después de guardar).

import { state } from './state.js';
import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';
import { nombreOrigen } from './lookups.js';
import { renderCheckboxesTabla } from './check-list.js';
import { saldoEnEurosPorOrigen } from './dashboard.js';

// Menos de medio centavo se considera "justo": si no, por los decimales de
// la conversión a euros nunca daría exactamente cero y siempre se vería en
// ámbar o en rojo.
const TOLERANCIA = 0.005;

function numero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formato(v) {
  return numero(v).toFixed(2);
}

function montoAsignado(origenId, reservaId) {
  const fila = state.asignaciones.find(
    a => String(a.origen_id) === String(origenId) && String(a.reserva_id) === String(reservaId)
  );
  return fila ? numero(fila.monto) : 0;
}

// Qué reservas se muestran como columnas: solo las activas. Una reserva
// desactivada no aparece acá, y la plata que tenía asignada se libera en el
// momento de desactivarla (reservas.js borra sus asignaciones), así ese
// dinero vuelve a contarse como "Sin asignar" en su cuenta en vez de quedar
// reservado para algo que ya no se ve en ningún lado.
function reservasVisibles() {
  return state.reservas
    .filter(r => r.activo)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// Clase de color para lo que quedó sin repartir en una cuenta.
function claseRestante(resto) {
  if (resto < -TOLERANCIA) return "asig-rojo";     // se repartió más de lo que hay
  if (resto > TOLERANCIA) return "asig-ambar";     // todavía queda plata sin repartir
  return "asig-verde";
}

// Clase de color para lo que le falta a una reserva para llegar a su
// objetivo (cantidad_reservada).
function claseFalta(falta) {
  if (falta > TOLERANCIA) return "asig-rojo";      // no llegó al objetivo
  if (falta < -TOLERANCIA) return "asig-ambar";    // se pasó del objetivo
  return "asig-verde";
}

// Al guardar una celda se recarga todo (el patrón de siempre de la app) y
// eso vuelve a armar la tabla entera, con lo cual el cursor se saldría del
// campo en el que estabas justo cuando estás cargando una fila tras otra.
// Por eso, antes de rearmarla, se anota en qué celda estaba el cursor (y lo
// que hubiera escrito ahí sin guardar todavía) para devolverlo a su lugar
// apenas termina el render. Es solo cosmético: no cambia cómo se guarda.
function recordarFoco() {
  const activo = document.activeElement;
  if (!activo || !activo.dataset || !activo.dataset.asigOrigen) return null;
  return {
    origenId: activo.dataset.asigOrigen,
    reservaId: activo.dataset.asigReserva,
    valor: activo.value,
  };
}

function devolverFoco(foco) {
  if (!foco) return;
  const input = document.querySelector(
    `[data-asig-origen="${foco.origenId}"][data-asig-reserva="${foco.reservaId}"]`
  );
  if (!input) return;
  if (foco.valor !== input.value) input.value = foco.valor;
  input.focus();
}

export function renderAsignacion() {
  const tabla = document.getElementById("asignacionTable");
  if (!tabla) return;
  const foco = recordarFoco();

  renderCheckboxesTabla(
    "conceptos", state.conceptos, "asignacionConceptosCheckboxes",
    "Todavía no hay conceptos cargados.", "incluir_en_snapshot", true
  );

  const resumen = document.getElementById("asignacionResumenTable");
  const nota = document.getElementById("asignacionNota");
  const { filas, incompleto } = saldoEnEurosPorOrigen();
  const reservas = reservasVisibles();

  if (nota) nota.style.display = incompleto ? "block" : "none";

  if (filas.length === 0) {
    tabla.innerHTML = `<tr><td class="empty">${
      state.movimientos.length === 0
        ? "Todavía no hay movimientos cargados."
        : "No hay movimientos para los conceptos seleccionados."
    }</td></tr>`;
    if (resumen) resumen.innerHTML = "";
    return;
  }
  if (reservas.length === 0) {
    tabla.innerHTML = `<tr><td class="empty">Todavía no hay reservas activas. Creá una en Configuración &gt; Reservas.</td></tr>`;
    if (resumen) resumen.innerHTML = "";
    return;
  }

  // --- Tabla principal: cuentas en las filas, reservas en las columnas ---
  // La plata que tiene la cuenta va como segunda línea adentro de la celda
  // del nombre, no en una columna aparte: son las dos columnas que quedan
  // fijas al scrollear, y en un celular tres columnas fijas se comían casi
  // toda la pantalla y no entraba ninguna reserva. El número "de verdad"
  // para las cuentas se lee de data-total, no del texto de la celda, para
  // que el formato (el símbolo €, los decimales) no rompa el cálculo.
  let html = `<tr>
    <th>Cuenta</th>
    <th>Sin asignar</th>
    ${reservas.map(r => `
      <th>
        <div class="asig-reserva-nombre">${r.nombre}</div>
        <div class="asig-reserva-total" data-total-reserva="${r.id}">0.00</div>
      </th>`).join("")}
  </tr>`;

  filas.forEach(f => {
    html += `<tr>
      <td class="asig-cuenta">
        <div class="asig-cuenta-nombre">${nombreOrigen(f.origenId)}</div>
        <div class="asig-cuenta-total">${formato(f.total)} €</div>
      </td>
      <td class="asig-restante" data-restante="${f.origenId}" data-total="${f.total}">0.00</td>
      ${reservas.map(r => `
        <td class="asig-celda">
          <input type="number" step="0.01" placeholder="0"
                 data-asig-origen="${f.origenId}" data-asig-reserva="${r.id}"
                 value="${montoAsignado(f.origenId, r.id) || ""}" />
        </td>`).join("")}
    </tr>`;
  });

  const totalGeneral = filas.reduce((suma, f) => suma + f.total, 0);
  html += `<tr class="total-row">
    <td class="asig-cuenta">
      <div class="asig-cuenta-nombre">Total</div>
      <div class="asig-cuenta-total">${formato(totalGeneral)} €</div>
    </td>
    <td class="asig-restante" data-restante-general>0.00</td>
    ${reservas.map(r => `<td class="asig-total-columna" data-total-columna="${r.id}">0.00</td>`).join("")}
  </tr>`;
  tabla.innerHTML = html;

  // --- Resumen por reserva: objetivo vs. lo que se le asignó ---
  if (resumen) {
    resumen.innerHTML = `<tr>
        <th>Reserva</th><th>Objetivo (€)</th><th>Asignado (€)</th><th>Falta (€)</th>
      </tr>` +
      reservas.map(r => `
        <tr>
          <td>${r.nombre}</td>
          <td>${formato(r.cantidad_reservada)}</td>
          <td data-resumen-asignado="${r.id}">0.00</td>
          <td data-resumen-falta="${r.id}">0.00</td>
        </tr>`).join("");
  }

  // Cada celda se guarda sola al salir del campo; mientras se escribe solo
  // se recalculan los números de la pantalla.
  tabla.querySelectorAll("[data-asig-origen]").forEach(input => {
    input.addEventListener("input", recalcular);
    input.addEventListener("change", () => guardarCelda(input));
  });

  habilitarArrastre();
  devolverFoco(foco);
  recalcular();
}

// Arrastrar la tabla para el costado con el mouse, como si se empujara una
// hoja de papel: la barra de desplazamiento horizontal queda abajo de todo
// y obligaba a bajar y volver a subir cada vez que se querían ver las
// reservas de la derecha. En el celular no hace falta (se desliza con el
// dedo, que el navegador ya resuelve solo).
//
// Dos cuidados: no se arrastra si el clic empezó sobre un campo o un botón
// (si no, sería imposible poner el cursor en una celda para escribir), y
// recién se considera "arrastre" después de unos pocos píxeles de
// movimiento, así un clic común para enfocar una celda sigue siendo un clic
// y no un tironcito. Los listeners se enganchan una sola vez (el contenedor
// vive en el HTML y no se vuelve a crear en cada render, a diferencia de la
// tabla de adentro).
function habilitarArrastre() {
  const wrap = document.getElementById("asignacionWrap");
  if (!wrap || wrap.dataset.arrastreListo) return;
  wrap.dataset.arrastreListo = "1";

  let activo = false;
  let xInicial = 0;
  let scrollInicial = 0;
  let arrastrando = false;

  wrap.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest("input, button, select, textarea, label, a")) return;
    activo = true;
    arrastrando = false;
    xInicial = e.pageX;
    scrollInicial = wrap.scrollLeft;
  });

  document.addEventListener("mousemove", (e) => {
    if (!activo) return;
    const corrimiento = e.pageX - xInicial;
    if (!arrastrando && Math.abs(corrimiento) < 4) return;
    arrastrando = true;
    wrap.classList.add("arrastrando");
    wrap.scrollLeft = scrollInicial - corrimiento;
    e.preventDefault();
  });

  document.addEventListener("mouseup", () => {
    activo = false;
    arrastrando = false;
    wrap.classList.remove("arrastrando");
  });
}

// Recalcula, a partir de lo que hay escrito en los campos (no de lo que
// está guardado), los tres números que se miran mientras se reparte: lo que
// queda sin asignar en cada cuenta, cuánto juntó cada reserva y cuánto le
// falta a cada una para su objetivo.
function recalcular() {
  const tabla = document.getElementById("asignacionTable");
  if (!tabla) return;
  const inputs = Array.from(tabla.querySelectorAll("[data-asig-origen]"));

  const porOrigen = {};
  const porReserva = {};
  inputs.forEach(input => {
    const valor = input.value === "" ? 0 : numero(input.value);
    const o = input.dataset.asigOrigen;
    const r = input.dataset.asigReserva;
    porOrigen[o] = (porOrigen[o] || 0) + valor;
    porReserva[r] = (porReserva[r] || 0) + valor;
  });

  // Sin asignar de cada cuenta = lo que tiene menos lo repartido.
  let restanteGeneral = 0;
  tabla.querySelectorAll("[data-restante]").forEach(celda => {
    const origenId = celda.dataset.restante;
    const total = numero(celda.dataset.total);
    const resto = total - (porOrigen[origenId] || 0);
    restanteGeneral += resto;
    celda.textContent = formato(resto);
    celda.className = "asig-restante " + claseRestante(resto);
  });
  const celdaGeneral = tabla.querySelector("[data-restante-general]");
  if (celdaGeneral) {
    celdaGeneral.textContent = formato(restanteGeneral);
    celdaGeneral.className = "asig-restante " + claseRestante(restanteGeneral);
  }

  // Total de cada reserva, arriba de su columna y en la fila de totales.
  tabla.querySelectorAll("[data-total-reserva]").forEach(el => {
    el.textContent = formato(porReserva[el.dataset.totalReserva] || 0);
  });
  tabla.querySelectorAll("[data-total-columna]").forEach(el => {
    el.textContent = formato(porReserva[el.dataset.totalColumna] || 0);
  });

  // Resumen: cuánto le falta a cada reserva para llegar a su objetivo.
  const resumen = document.getElementById("asignacionResumenTable");
  if (!resumen) return;
  resumen.querySelectorAll("[data-resumen-asignado]").forEach(celda => {
    const reservaId = celda.dataset.resumenAsignado;
    const asignado = porReserva[reservaId] || 0;
    celda.textContent = formato(asignado);

    const reserva = state.reservas.find(r => String(r.id) === String(reservaId));
    const objetivo = numero(reserva && reserva.cantidad_reservada);
    const falta = objetivo - asignado;
    const celdaFalta = resumen.querySelector(`[data-resumen-falta="${reservaId}"]`);
    if (celdaFalta) {
      celdaFalta.textContent = formato(falta);
      celdaFalta.className = claseFalta(falta);
    }
  });
}

// Excepción, a propósito, al patrón "guardar y después cargarTodo()" que
// usa el resto de la app: acá NO se recarga todo después de guardar una
// celda. Motivo concreto, visto en las pruebas: al pasar de una celda a la
// siguiente con Tab, la celda que dejás se guarda y la recarga volvía a
// armar la tabla entera justo mientras ya estabas escribiendo en la de al
// lado, borrando lo tipeado. Como ninguna otra pantalla usa las
// asignaciones, alcanza con actualizar la lista en memoria; los totales y
// los colores ya se recalculan solos a partir de lo que hay escrito. Si el
// guardado falla sí se recarga todo, para que la pantalla vuelva a mostrar
// lo que realmente quedó en la base y no una cifra que no se guardó.
function actualizarEnMemoria(origen_id, reserva_id, monto) {
  const fila = state.asignaciones.find(
    a => String(a.origen_id) === String(origen_id) && String(a.reserva_id) === String(reserva_id)
  );
  if (fila) fila.monto = monto;
  else state.asignaciones.push({ origen_id, reserva_id, monto });
}

async function guardarCelda(input) {
  const origen_id = input.dataset.asigOrigen;
  const reserva_id = input.dataset.asigReserva;
  const monto = input.value === "" ? 0 : numero(input.value);

  const { error } = await getClient()
    .from("asignaciones")
    .upsert({ origen_id, reserva_id, monto }, { onConflict: "origen_id,reserva_id" });
  if (error) {
    alert("No se pudo guardar: " + error.message);
    await cargarTodo();
    return;
  }
  actualizarEnMemoria(origen_id, reserva_id, monto);
}
