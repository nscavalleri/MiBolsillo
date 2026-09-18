// Gastos > Conciliación: muestra la misma tabla que el Dashboard (saldo por
// Origen x Moneda) pero con un tilde por casillero para ir marcando, mes a
// mes, qué saldos ya se verificaron contra el extracto real.
//
// El tilde de cada casillero se guarda al toque en conciliacion_checks (así
// no se pierde si Nadia sigue conciliando otro día). El botón "Conciliar
// mes" saca una foto de los saldos + el estado de cada tilde en ese momento
// y la guarda para siempre en conciliaciones; después reinicia los tildes
// para que el mes que viene se pueda volver a conciliar de cero.

import { state } from './state.js';
import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';

function clave(origen, moneda) {
  return origen + "::" + moneda;
}

function calcularPivot() {
  const pivot = {};
  const monedasUsadas = new Set();
  state.movimientos.forEach(m => {
    const signo = m.tipo === "ingreso" ? 1 : -1;
    const val = signo * Number(m.monto);
    if (!pivot[m.origen]) pivot[m.origen] = {};
    pivot[m.origen][m.moneda] = (pivot[m.origen][m.moneda] || 0) + val;
    monedasUsadas.add(m.moneda);
  });
  return { pivot, monedas: Array.from(monedasUsadas).sort() };
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
  const { pivot, monedas } = calcularPivot();
  const tabla = document.getElementById("conciliacionTable");
  const boton = document.getElementById("btnConciliarMes");

  if (monedas.length === 0) {
    tabla.innerHTML = `<tr><td class="empty">Todavía no hay movimientos cargados.</td></tr>`;
    document.getElementById("conciliacionResumen").textContent = "";
    boton.disabled = true;
    return;
  }
  boton.disabled = false;

  let html = "<tr><th>Origen</th>" + monedas.map(mo => `<th>${mo}</th>`).join("") + "</tr>";
  Object.keys(pivot).sort().forEach(origen => {
    html += `<tr><td>${origen}</td>`;
    monedas.forEach(mo => {
      const v = pivot[origen][mo];
      if (v === undefined) {
        html += `<td class="conciliacion-vacia">–</td>`;
        return;
      }
      const marcado = !!state.conciliacionChecks[clave(origen, mo)];
      html += `
        <td class="conciliacion-celda">
          <span>${v.toFixed(2)}</span>
          <label class="check-conciliado${marcado ? " checked" : ""}">
            <input type="checkbox" data-origen="${origen}" data-moneda="${mo}" ${marcado ? "checked" : ""} />
            <span class="checkmark">✓</span>
          </label>
        </td>`;
    });
    html += "</tr>";
  });
  tabla.innerHTML = html;

  tabla.querySelectorAll("input[type=\"checkbox\"]").forEach(chk => {
    chk.addEventListener("change", async () => {
      const origen = chk.dataset.origen;
      const moneda = chk.dataset.moneda;
      const marcado = chk.checked;
      state.conciliacionChecks[clave(origen, moneda)] = marcado;
      chk.closest("label").classList.toggle("checked", marcado);
      actualizarResumen();

      const { error } = await getClient()
        .from("conciliacion_checks")
        .upsert(
          { origen, moneda, conciliado: marcado, actualizado_en: new Date().toISOString() },
          { onConflict: "origen,moneda" }
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
    const { pivot, monedas } = calcularPivot();
    const mes = mesActualTexto();
    const filas = [];
    Object.keys(pivot).forEach(origen => {
      monedas.forEach(mo => {
        const v = pivot[origen][mo];
        if (v === undefined) return;
        filas.push({
          mes,
          origen,
          moneda: mo,
          monto: v,
          conciliado: !!state.conciliacionChecks[clave(origen, mo)],
        });
      });
    });

    if (filas.length === 0) {
      alert("Todavía no hay saldos para conciliar.");
      return;
    }

    const marcados = filas.filter(f => f.conciliado).length;
    const confirmado = confirm(
      `Vas a cerrar la conciliación de ${mes} con ${marcados} de ${filas.length} saldos tildados como conciliados.\n\nLos que quedaron sin tildar también se guardan (como no conciliados). Después se reinician todos los tildes para el mes que viene.\n\n¿Confirmás?`
    );
    if (!confirmado) return;

    const { error: errorGuardar } = await getClient().from("conciliaciones").insert(filas);
    if (errorGuardar) {
      alert("No se pudo guardar la conciliación: " + errorGuardar.message);
      return;
    }

    const { error: errorReset } = await getClient().from("conciliacion_checks").delete().gte("id", 0);
    if (errorReset) {
      alert("La conciliación de " + mes + " quedó guardada, pero no se pudieron reiniciar los tildes: " + errorReset.message);
    }

    state.conciliacionChecks = {};
    await cargarTodo();
    alert(`Conciliación de ${mes} guardada. Los tildes se reiniciaron para el próximo mes.`);
  });
}
