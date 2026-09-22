// Gastos > Conciliación: muestra la misma tabla que el Dashboard (saldo por
// Origen x Moneda) pero con un tilde por casillero para ir marcando, mes a
// mes, qué saldos ya se verificaron contra el extracto real.
//
// El tilde de cada casillero se guarda al toque en conciliacion_checks (así
// no se pierde si Nadia sigue conciliando otro día). El botón "Conciliar
// mes" saca una foto de los saldos + el estado de cada tilde en ese momento
// y la guarda para siempre en conciliaciones; después reinicia los tildes
// (se borran todas las filas de conciliacion_checks) para que el mes que
// viene se pueda volver a conciliar de cero, sin ningún casillero tildado.
//
// Origen y moneda se guardan como origen_id / moneda_id (claves foráneas
// hacia origenes y monedas), tanto en conciliacion_checks como en
// conciliaciones.

import { state } from './state.js';
import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';
import { pedirConfirmacion } from './confirmar-modal.js';
import { nombreOrigen, nombreMoneda } from './lookups.js';
import { formatoMesLegible } from './distribucion.js';

function clave(origenId, monedaId) {
  return origenId + "::" + monedaId;
}

// La última vez que se cerró el mes para esa combinación de origen y
// moneda. Se elige por mes (que es el dato con sentido para Nadia) y, si dos
// filas comparten mes, por la fecha en que se guardaron.
function ultimaConciliacion(origenId, monedaId) {
  const filas = state.conciliaciones.filter(
    c => String(c.origen_id) === String(origenId) && String(c.moneda_id) === String(monedaId)
  );
  if (filas.length === 0) return null;
  return filas.reduce((a, b) => {
    if (a.mes !== b.mes) return b.mes > a.mes ? b : a;
    return String(b.creado_en || "") > String(a.creado_en || "") ? b : a;
  });
}

function fechaLegible(timestamp) {
  if (!timestamp) return "–";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "–";
  return String(d.getDate()).padStart(2, "0") + "/" +
    String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
}

// Abre el popup compartido (el mismo .modal-overlay que usa el botón "i" de
// Distribución) con la foto del último cierre de esa celda.
function mostrarUltimaConciliacion(origenId, monedaId) {
  const ultima = ultimaConciliacion(origenId, monedaId);
  const linea = (etiqueta, valor) =>
    `<div class="detalle-linea"><span>${etiqueta}</span><span>${valor}</span></div>`;

  document.getElementById("detalleTitulo").textContent =
    `${nombreOrigen(origenId)} · ${nombreMoneda(monedaId)}`;
  document.getElementById("detalleContenido").innerHTML = ultima
    ? `<div class="detalle-grupo">
         <div class="detalle-grupo-titulo">Última vez que cerraste el mes</div>
         ${linea("Mes", formatoMesLegible(ultima.mes))}
         ${linea("Saldo que quedó guardado", Number(ultima.monto).toFixed(2) + " " + nombreMoneda(monedaId))}
         ${linea("¿Lo habías tildado?", ultima.conciliado ? "Sí" : "No")}
         ${linea("Guardado el", fechaLegible(ultima.creado_en))}
       </div>`
    : `<div class="empty">Todavía no cerraste ningún mes para esta cuenta y moneda.</div>`;

  document.getElementById("detalleOverlay").classList.add("open");
}

function calcularPivot() {
  const pivot = {};
  const monedaIdsUsadas = new Set();
  state.movimientos.forEach(m => {
    const signo = m.tipo === "ingreso" ? 1 : -1;
    const val = signo * Number(m.monto);
    if (!pivot[m.origen_id]) pivot[m.origen_id] = {};
    pivot[m.origen_id][m.moneda_id] = (pivot[m.origen_id][m.moneda_id] || 0) + val;
    monedaIdsUsadas.add(m.moneda_id);
  });
  const monedaIds = Array.from(monedaIdsUsadas).sort((a, b) => nombreMoneda(a).localeCompare(nombreMoneda(b)));
  return { pivot, monedaIds };
}

function mesActualTexto() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function actualizarResumen() {
  const resumen = document.getElementById("conciliacionResumen");
  const casilleros = document.querySelectorAll("#conciliacionTable input[type=\"checkbox\"]");
  const marcados = document.querySelectorAll("#conciliacionTable input[type=\"checkbox\"]:checked");
  resumen.textContent = casilleros.length ? `${marcados.length} de ${casilleros.length} conciliados` : "";
}

export function renderConciliacion() {
  const { pivot, monedaIds } = calcularPivot();
  const tabla = document.getElementById("conciliacionTable");
  const boton = document.getElementById("btnConciliarMes");

  if (monedaIds.length === 0) {
    tabla.innerHTML = `<tr><td class="empty">Todavía no hay movimientos cargados.</td></tr>`;
    document.getElementById("conciliacionResumen").textContent = "";
    boton.disabled = true;
    return;
  }
  boton.disabled = false;

  let html = "<tr><th>Origen</th>" + monedaIds.map(id => `<th>${nombreMoneda(id)}</th>`).join("") + "</tr>";
  const origenIds = Object.keys(pivot).sort((a, b) => nombreOrigen(a).localeCompare(nombreOrigen(b)));
  origenIds.forEach(origenId => {
    html += `<tr><td>${nombreOrigen(origenId)}</td>`;
    monedaIds.forEach(monedaId => {
      const v = pivot[origenId][monedaId];
      if (v === undefined) {
        html += `<td class="conciliacion-vacia">–</td>`;
        return;
      }
      const marcado = !!state.conciliacionChecks[clave(origenId, monedaId)];
      html += `
        <td class="conciliacion-celda">
          <button type="button" class="btn-detalle" data-conc-origen="${origenId}" data-conc-moneda="${monedaId}"
                  title="Ver cuándo conciliaste esto por última vez">i</button>
          <span>${v.toFixed(2)}</span>
          <label class="check-conciliado${marcado ? " checked" : ""}">
            <input type="checkbox" data-origen-id="${origenId}" data-moneda-id="${monedaId}" ${marcado ? "checked" : ""} />
            <span class="checkmark">✓</span>
          </label>
        </td>`;
    });
    html += "</tr>";
  });
  tabla.innerHTML = html;

  tabla.querySelectorAll("[data-conc-origen]").forEach(btn => {
    btn.addEventListener("click", () =>
      mostrarUltimaConciliacion(btn.dataset.concOrigen, btn.dataset.concMoneda));
  });

  tabla.querySelectorAll("input[type=\"checkbox\"]").forEach(chk => {
    chk.addEventListener("change", async () => {
      // origen_id / moneda_id son bigint, pero llegan como texto desde el
      // dataset del checkbox; no hace falta convertirlos con Number().
      const origenId = chk.dataset.origenId;
      const monedaId = chk.dataset.monedaId;
      const marcado = chk.checked;
      state.conciliacionChecks[clave(origenId, monedaId)] = marcado;
      chk.closest("label").classList.toggle("checked", marcado);
      actualizarResumen();

      const { error } = await getClient()
        .from("conciliacion_checks")
        .upsert(
          { origen_id: origenId, moneda_id: monedaId, conciliado: marcado, actualizado_en: new Date().toISOString() },
          { onConflict: "origen_id,moneda_id" }
        );
      if (error) {
        alert("No se pudo guardar el tilde: " + error.message);
      }
    });
  });

  actualizarResumen();
}

export function setupConciliacion() {
  document.getElementById("btnConciliarMes").addEventListener("click", async () => {
    const { pivot, monedaIds } = calcularPivot();
    const mes = mesActualTexto();
    const filas = [];
    Object.keys(pivot).forEach(origenId => {
      monedaIds.forEach(monedaId => {
        const v = pivot[origenId][monedaId];
        if (v === undefined) return;
        filas.push({
          mes,
          // origen_id / moneda_id son bigint, pero llegan como texto acá.
          origen_id: origenId,
          moneda_id: monedaId,
          monto: v,
          conciliado: !!state.conciliacionChecks[clave(origenId, monedaId)],
        });
      });
    });

    if (filas.length === 0) {
      alert("Todavía no hay saldos para conciliar.");
      return;
    }

    const marcados = filas.filter(f => f.conciliado).length;
    const confirmado = await pedirConfirmacion({
      titulo: `¿Cerrar la conciliación de ${mes}?`,
      lineas: [
        `Tildaste <strong>${marcados} de ${filas.length}</strong> saldos como conciliados.`,
        "Los que quedaron sin tildar también se guardan, como no conciliados.",
        "Después se reinician todos los tildes para empezar el mes que viene de cero.",
      ],
      textoSi: "Sí, cerrar el mes",
      textoNo: "No, todavía no",
    });
    if (!confirmado) return;

    const { error: errorGuardar } = await getClient().from("conciliaciones").insert(filas);
    if (errorGuardar) {
      alert("No se pudo guardar la conciliación: " + errorGuardar.message);
      return;
    }

    // Se borran todas las filas de conciliacion_checks: así, al abrir el
    // mes que viene, ningún casillero aparece tildado.
    const { error: errorReset } = await getClient().from("conciliacion_checks").delete().gte("id", 0);
    if (errorReset) {
      alert("La conciliación de " + mes + " quedó guardada, pero no se pudieron reiniciar los tildes: " + errorReset.message);
    }

    state.conciliacionChecks = {};
    await cargarTodo();
    alert(`Conciliación de ${mes} guardada. Los tildes se reiniciaron para el próximo mes.`);
  });
}
