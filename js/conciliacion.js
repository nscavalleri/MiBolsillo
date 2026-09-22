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

function clave(origenId, monedaId) {
  return origenId + "::" + monedaId;
}

// La última vez que este saldo se dio por conciliado de verdad. Solo cuentan
// los cierres en los que el casillero estaba TILDADO: un mes que se cerró con
// este casillero sin tildar no es una conciliación de esta cuenta, así que no
// tiene por qué aparecer como "la última vez".
// Se elige por mes (que es el dato con sentido) y, si dos filas comparten
// mes, por la fecha en que se guardaron.
function ultimaConciliacion(origenId, monedaId) {
  const filas = state.conciliaciones.filter(
    c => c.conciliado &&
         String(c.origen_id) === String(origenId) && String(c.moneda_id) === String(monedaId)
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

// El texto que se ve al pasar el mouse por el icono de info. Va como
// atributo "title" y no como popup: fue un pedido explícito, alcanza con
// verlo al pasar por encima sin tener que abrir y cerrar nada.
function textoUltimaConciliacion(origenId, monedaId) {
  const ultima = ultimaConciliacion(origenId, monedaId);
  if (!ultima) return "Todavía no conciliaste esta cuenta y moneda en ningún cierre de mes";
  return `Última vez conciliado — ${fechaLegible(ultima.creado_en)}\n` +
         `Saldo guardado — ${Number(ultima.monto).toFixed(2)} ${nombreMoneda(monedaId)}`;
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

  // El <thead> va aparte del <tbody> para que la fila con los nombres de
  // las monedas pueda quedar clavada arriba al scrollear (ver el CSS de
  // .conciliacion-scroll).
  let html = "<thead><tr><th>Origen</th>" + monedaIds.map(id => `<th>${nombreMoneda(id)}</th>`).join("") + "</tr></thead><tbody>";
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
          <span class="conciliacion-wrap">
            <button type="button" class="btn-detalle" data-dif-origen="${origenId}" data-dif-moneda="${monedaId}"
                    title="Calcular diferencia contra lo que tenés en realidad">Δ</button>
            <span class="valor-conciliacion" title="${textoUltimaConciliacion(origenId, monedaId)}">${v.toFixed(2)}</span>
            <label class="check-conciliado${marcado ? " checked" : ""}">
              <input type="checkbox" data-origen-id="${origenId}" data-moneda-id="${monedaId}" ${marcado ? "checked" : ""} />
              <span class="checkmark">✓</span>
            </label>
          </span>
        </td>`;
    });
    html += "</tr>";
  });
  html += "</tbody>";
  tabla.innerHTML = html;

  tabla.querySelectorAll("[data-dif-origen]").forEach(btn => {
    btn.addEventListener("click", () =>
      abrirDiferencia(btn.dataset.difOrigen, btn.dataset.difMoneda, pivot[btn.dataset.difOrigen][btn.dataset.difMoneda]));
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

// --- Calcular y registrar la diferencia de una celda --------------------
//
// Nadia mira su extracto real y escribe cuánta plata tiene de verdad en esa
// cuenta y esa moneda. La app le muestra la diferencia contra lo que tiene
// registrado y, si quiere, la deja asentada como un movimiento más, para
// que el saldo de la app pase a coincidir con la realidad.
//
// El signo: si tiene MÁS de lo registrado es un ingreso que faltaba cargar;
// si tiene MENOS, un egreso.

// Concepto con el que se dan de alta esos movimientos. Se busca por nombre
// (que es lo estable de cara a Nadia) y, si no aparece, se cae al id 6, que
// es el que tiene hoy en su base.
const CONCEPTO_CONCILIACION_ID = 6;
const DESCRIPCION_AUTOMATICA = "Agregado automáticamente durante la conciliación";

function conceptoConciliacion() {
  const porNombre = state.conceptos.find(
    c => String(c.nombre).trim().toLowerCase() === "conciliación" ||
         String(c.nombre).trim().toLowerCase() === "conciliacion"
  );
  if (porNombre) return porNombre.id;
  const porId = state.conceptos.find(c => String(c.id) === String(CONCEPTO_CONCILIACION_ID));
  return porId ? porId.id : null;
}

// Lo que se está calculando en este momento, o null si el modal está
// cerrado.
let diferenciaActual = null;

function hoyTexto() {
  const d = new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function abrirDiferencia(origenId, monedaId, registrado) {
  diferenciaActual = { origenId, monedaId, registrado: Number(registrado) };

  document.getElementById("diferenciaSubtitulo").textContent =
    `${nombreOrigen(origenId)} · ${nombreMoneda(monedaId)}`;
  document.getElementById("diferenciaRegistrado").textContent =
    Number(registrado).toFixed(2) + " " + nombreMoneda(monedaId);
  document.getElementById("diferenciaReal").value = "";
  document.getElementById("diferenciaResultado").innerHTML = "";
  document.getElementById("btnRegistrarDiferencia").style.display = "none";
  document.getElementById("diferenciaOverlay").classList.add("open");
  document.getElementById("diferenciaReal").focus();
}

function cerrarDiferencia() {
  document.getElementById("diferenciaOverlay").classList.remove("open");
  diferenciaActual = null;
}

function calcularDiferencia() {
  if (!diferenciaActual) return;
  const campo = document.getElementById("diferenciaReal");
  const resultado = document.getElementById("diferenciaResultado");
  const boton = document.getElementById("btnRegistrarDiferencia");

  if (campo.value.trim() === "" || Number.isNaN(Number(campo.value))) {
    resultado.innerHTML = `<p class="conciliacion-ayuda">Escribí cuánto tenés en realidad para poder comparar.</p>`;
    boton.style.display = "none";
    return;
  }

  const real = Number(campo.value);
  const diferencia = real - diferenciaActual.registrado;
  const moneda = nombreMoneda(diferenciaActual.monedaId);
  diferenciaActual.real = real;
  diferenciaActual.diferencia = diferencia;

  // Menos de medio centavo se considera "igual": no tiene sentido asentar un
  // movimiento por un redondeo.
  if (Math.abs(diferencia) < 0.005) {
    resultado.innerHTML = `<div class="dif-resultado asig-verde">Está justo: no hay diferencia que registrar.</div>`;
    boton.style.display = "none";
    return;
  }

  const esIngreso = diferencia > 0;
  const monto = Math.abs(diferencia).toFixed(2);
  const linea = (etiqueta, valor) =>
    `<div class="detalle-linea"><span>${etiqueta}</span><span>${valor}</span></div>`;

  resultado.innerHTML = `
    <div class="dif-resultado ${esIngreso ? "asig-verde" : "asig-rojo"}">
      Tenés <strong>${monto} ${moneda}</strong> ${esIngreso ? "de más" : "de menos"} que lo registrado.
    </div>
    <div class="detalle-grupo">
      <div class="detalle-grupo-titulo">Se va a agregar este movimiento</div>
      ${linea("Tipo", esIngreso ? "Ingreso" : "Egreso")}
      ${linea("Fecha", hoyTexto())}
      ${linea("Concepto", "Conciliación")}
      ${linea("Cantidad", monto + " " + moneda)}
      ${linea("Origen", nombreOrigen(diferenciaActual.origenId))}
      <div class="detalle-nota">${DESCRIPCION_AUTOMATICA}</div>
    </div>`;
  boton.style.display = "block";
}

async function registrarDiferencia() {
  if (!diferenciaActual || !diferenciaActual.diferencia) return;
  const conceptoId = conceptoConciliacion();
  if (conceptoId == null) {
    alert('No encontré el concepto "Conciliación". Crealo en Configuración > Conceptos y volvé a intentar.');
    return;
  }

  const { error } = await getClient().from("movimientos").insert({
    fecha: hoyTexto(),
    tipo: diferenciaActual.diferencia > 0 ? "ingreso" : "egreso",
    descripcion: DESCRIPCION_AUTOMATICA,
    monto: Math.abs(diferenciaActual.diferencia).toFixed(2),
    concepto_id: conceptoId,
    moneda_id: diferenciaActual.monedaId,
    origen_id: diferenciaActual.origenId,
  });
  if (error) { alert("No se pudo registrar la diferencia: " + error.message); return; }

  cerrarDiferencia();
  await cargarTodo();
}

export function setupConciliacion() {
  const overlayDif = document.getElementById("diferenciaOverlay");
  if (overlayDif) {
    document.getElementById("diferenciaClose").addEventListener("click", cerrarDiferencia);
    overlayDif.addEventListener("click", (e) => { if (e.target === overlayDif) cerrarDiferencia(); });
    document.getElementById("btnCalcularDiferencia").addEventListener("click", calcularDiferencia);
    document.getElementById("btnRegistrarDiferencia").addEventListener("click", registrarDiferencia);
    // Enter en el campo calcula, que es lo que se espera de un formulario.
    document.getElementById("diferenciaReal").addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      calcularDiferencia();
    });
  }

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
