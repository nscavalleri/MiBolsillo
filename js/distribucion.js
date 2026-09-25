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
// "Flujo de caja" es una tercera pestaña (a pedido de Nadia) con las
// tarjetas de Gastos/Ingresos fijos y variables (ver más abajo). Tiene su
// PROPIA lista de "Conceptos a incluir" (conceptos.incluir_en_flujo_caja,
// otra columna aparte, igual mecánica que incluir_en_distribucion) para
// poder armar un conjunto de conceptos relevante para el flujo de caja
// distinto del que se usa en Mensual/Histórica, sin pisarse entre las dos.
// Sí comparte con esas dos pestañas la selección de Monedas / "Convertir
// todo a Euros" de arriba (eso no se pidió separar) y el mes elegido en
// Mensual (un solo "mes actual" para toda la sección, editable desde
// cualquiera de las dos pestañas que lo usan).
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
import { renderCheckboxesTabla } from './check-list.js';
import { avisarError } from './aviso-modal.js';

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
//
// Mensual y Flujo de caja tienen cada una su PROPIO par de <select> en el
// HTML (distribMesNombre/distribAnio y distribFlujoMesNombre/distribFlujoAnio)
// para que el selector de mes se vea en las dos pestañas sin tener que saltar
// a Mensual solo para cambiar de mes — pero los dos pares reflejan el mismo
// state.distribucion.mes (un solo "mes actual" para toda la sección), así que
// estas funciones reciben el prefijo del par que corresponda y
// escribirMesSeleccionado() siempre escribe los dos pares a la vez para que
// no se desincronicen.
function poblarSelectMes(prefijo) {
  const sel = document.getElementById(prefijo + "MesNombre");
  if (!sel) return;
  sel.innerHTML = MESES.map((nombre, i) => {
    const valor = String(i + 1).padStart(2, "0");
    return `<option value="${valor}">${nombre}</option>`;
  }).join("");
}

function poblarSelectAnio(prefijo) {
  const sel = document.getElementById(prefijo + "Anio");
  if (!sel) return;
  const anioActual = new Date().getFullYear();
  const anios = [];
  for (let a = anioActual - 5; a <= anioActual + 1; a++) anios.push(a);
  sel.innerHTML = anios.map(a => `<option value="${a}">${a}</option>`).join("");
}

function leerMesSeleccionado(prefijo) {
  const mes = document.getElementById(prefijo + "MesNombre").value;
  const anio = document.getElementById(prefijo + "Anio").value;
  return anio + "-" + mes;
}

function escribirMesSeleccionado(mesTexto) {
  const [anio, mes] = mesTexto.split("-");
  ["distrib", "distribFlujo"].forEach(prefijo => {
    const selMes = document.getElementById(prefijo + "MesNombre");
    const selAnio = document.getElementById(prefijo + "Anio");
    if (selMes) selMes.value = mes;
    if (selAnio) selAnio.value = anio;
  });
}

function escaparAtributo(texto) {
  return String(texto).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// --- Promedio histórico por concepto -------------------------------------
//
// El "Promedio" de la columna nueva de Mensual es, para cada concepto, el
// promedio de lo que movió por mes. Dos decisiones que tomó Nadia y que
// conviene no cambiar sin preguntarle:
//
//   1. Solo cuentan los meses en los que ESE concepto tuvo algo cargado. Si
//      al Colegio le pagaste en 3 meses de 9, se divide por 3 y no por 9. Si
//      se dividiera por todos los meses, cualquier concepto esporádico
//      (Regalos, Salud) tendría un promedio irrisorio y todos sus meses con
//      movimiento se verían "carísimos".
//   2. El mes que se está mirando NO entra en su propio promedio: la
//      comparación es "este mes contra cómo venías", así que un mes muy alto
//      no se sube a sí mismo la vara. Consecuencia: en el primer mes de la
//      historia de un concepto no hay con qué comparar, y ahí el promedio
//      muestra "–" y el circulito queda gris.
//
// Se arma todo de UNA pasada por los movimientos (y no buscando en
// state.movimientos una vez por celda) porque el reporte puede tener veinte
// conceptos por cuatro monedas.
function historicoPorConcepto(mesExcluido) {
  const porMoneda = {};   // "concepto|moneda" -> { mes: total en esa moneda }
  const enEuros = {};     // "concepto"        -> { mes: total convertido }
  const faltaTasa = {};   // "concepto"        -> { mes: true }
  state.movimientos.forEach(m => {
    const mes = String(m.fecha).slice(0, 7);
    if (mes === mesExcluido) return;
    const signo = m.tipo === "ingreso" ? 1 : -1;
    const val = signo * Number(m.monto);

    const claveMoneda = m.concepto_id + "|" + m.moneda_id;
    if (!porMoneda[claveMoneda]) porMoneda[claveMoneda] = {};
    porMoneda[claveMoneda][mes] = (porMoneda[claveMoneda][mes] || 0) + val;

    // La conversión usa el tipo de cambio de CADA mes, igual que el resto de
    // Distribución (no el más reciente, que es lo que hace Snapshot).
    const { valor, ok } = convertirAEuros(mes, m.moneda_id, val);
    if (!enEuros[m.concepto_id]) enEuros[m.concepto_id] = {};
    enEuros[m.concepto_id][mes] = (enEuros[m.concepto_id][mes] || 0) + valor;
    if (!ok) {
      if (!faltaTasa[m.concepto_id]) faltaTasa[m.concepto_id] = {};
      faltaTasa[m.concepto_id][mes] = true;
    }
  });
  return { porMoneda, enEuros, faltaTasa };
}

// Promedia un { mes: total }. mesesConFalta (opcional) son los meses a los
// que les faltó algún tipo de cambio: esos NO se promedian, porque su total
// quedó incompleto y contarlo tiraría el promedio para abajo por una plata
// que sí existió. Es el mismo criterio que usa toda la app con el ⚠: lo que
// no se puede convertir no se cuenta como cero.
function promediar(porMes, mesesConFalta) {
  if (!porMes) return { promedio: null, incompleto: false };
  const todos = Object.keys(porMes);
  const buenos = mesesConFalta ? todos.filter(mes => !mesesConFalta[mes]) : todos;
  const incompleto = buenos.length !== todos.length;
  if (buenos.length === 0) return { promedio: null, incompleto };
  return { promedio: buenos.reduce((s, mes) => s + porMes[mes], 0) / buenos.length, incompleto };
}

// Junta varios { mes: total } en uno solo, para la fila "Total" (que es la
// suma de los conceptos que estén tildados, así que su promedio tiene que
// salir de los mismos conceptos y no de todos).
function sumarPorMes(lista) {
  const acc = {};
  lista.forEach(porMes => {
    Object.entries(porMes || {}).forEach(([mes, v]) => { acc[mes] = (acc[mes] || 0) + v; });
  });
  return acc;
}

function unirMeses(lista) {
  const acc = {};
  lista.forEach(mapa => Object.keys(mapa || {}).forEach(mes => { acc[mes] = true; }));
  return acc;
}

// --- Los dos umbrales de porcentaje ---------------------------------------
//
// Son DOS números distintos, con su propia fila en configuracion_general,
// porque miden cosas distintas y Nadia los quiere con valores distintos:
//
//   distribucion_umbral_promedio_pct  (5)  ±% alrededor del promedio de un
//       concepto dentro del cual se considera que "estás en tu promedio" y el
//       circulito va ámbar. Es SIMÉTRICO: cuenta igual para arriba que para
//       abajo.
//
//   evolucion_umbral_crecimiento_pct  (1)  % que tiene que CRECER el
//       patrimonio de un mes al siguiente para contar como que subió y
//       pintarse verde. Es ASIMÉTRICO: solo se mira para arriba, porque
//       cualquier caída va roja por poca que sea.
//
// No hay pantalla para cambiarlos: se editan directamente en la base, igual
// que todo lo que vive en esa tabla. Si la fila no está o tiene cualquier
// cosa, se usa el valor por defecto de acá.
function leerUmbral(clave, porDefecto) {
  const v = Number(state.configuracionGeneral[clave]);
  return Number.isFinite(v) && v >= 0 ? v : porDefecto;
}

export function umbralPromedioDistribucion() {
  return leerUmbral("distribucion_umbral_promedio_pct", 5);
}

export function umbralCrecimientoEvolucion() {
  return leerUmbral("evolucion_umbral_crecimiento_pct", 1);
}

// El color del circulito, con tres estados:
//
//   ámbar  = estás en tu promedio (la diferencia no llega al umbral, ni para
//            arriba ni para abajo). No es ni bueno ni malo: es lo normal.
//   verde  = te fue mejor que tu promedio, por más del umbral.
//   rojo   = te fue peor que tu promedio, por más del umbral.
//   gris   = todavía no hay promedio con qué comparar.
//
// Verde y rojo salen de UNA sola comparación, aunque parezcan dos reglas
// distintas: en un ingreso (total positivo) cobrar MÁS que el promedio es lo
// bueno; en un gasto (total negativo) gastar de más hace el número más
// negativo, o sea MENOR que el promedio. En los dos casos, total >= promedio
// es lo bueno.
//
// El porcentaje se mide contra el VALOR ABSOLUTO del promedio, si no un
// promedio negativo (un gasto) daría el porcentaje al revés. Y si el promedio
// es cero no se puede sacar un porcentaje de nada: ahí cualquier diferencia
// cuenta como real y el circulito va verde o rojo, nunca ámbar.
function semaforoContraPromedio(total, promedio, unidad) {
  if (promedio == null) {
    return {
      clase: "semaforo-gris",
      titulo: "Todavía no hay meses anteriores con movimientos en este concepto, así que no hay promedio con qué comparar",
    };
  }
  const sufijo = unidad ? " " + unidad : "";
  const umbral = umbralPromedioDistribucion();
  const diferencia = total - promedio;
  const porcentaje = promedio === 0 ? Infinity : Math.abs(diferencia) / Math.abs(promedio) * 100;
  const base = `Este mes ${total.toFixed(2)}${sufijo} · promedio ${promedio.toFixed(2)}${sufijo}`;

  if (porcentaje <= umbral) {
    return {
      clase: "semaforo-amarillo",
      titulo: `${base} — estás en tu promedio (menos de ${umbral}% de diferencia)`,
    };
  }

  const verde = total >= promedio;
  const esGasto = total < 0 || promedio < 0;
  const lectura = verde
    ? (esGasto ? "gastaste menos que de costumbre" : "entró más que de costumbre")
    : (esGasto ? "gastaste más que de costumbre" : "entró menos que de costumbre");
  return {
    clase: verde ? "semaforo-verde" : "semaforo-rojo",
    titulo: `${base} — ${lectura} (${porcentaje.toFixed(1)}% de diferencia)`,
  };
}

// La celda de la columna "Promedio". Va en gris (no en verde/rojo como los
// importes) a propósito: el número que importa es el del mes, y el promedio
// es solo la vara contra la que se lo compara. Si se pintara igual que los
// demás, la tabla quedaría toda de colores y no se sabría dónde mirar.
function celdaPromedio(promedio, incompleto) {
  // Esta columna no tiene adornos (ni botón "i" ni circulito), así que no
  // necesita el span de ancho fijo: el número se alinea solo contra el borde
  // derecho de su celda.
  if (promedio == null) return `<td class="col-promedio valor-cero">–</td>`;
  const marca = incompleto
    ? `<span class="valor-incompleto" title="A algún mes anterior le falta el tipo de cambio de alguna moneda, en Configuración &gt; Tipo de cambio; esos meses no entran en el promedio">⚠</span>`
    : "";
  return `<td class="col-promedio">${marca}${promedio.toFixed(2)}</td>`;
}

// Una celda de importe: verde si es mayor a cero, rojo si es menor, y un
// guión gris si no hubo movimientos (mismo criterio de color que el resto
// de la app: var(--income) / var(--expense)). En Mensual además va, al lado
// del número, el circulito del semáforo, que compara ese mes contra el
// promedio histórico del concepto (ver semaforoContraPromedio); en Histórica
// no aplica, así que se puede omitir. El número (y el circulito, si va) se
// arman adentro de un span propio (no en el <td> directamente): poner
// display:flex en el <td> lo saca del layout de tabla y rompe las columnas.
//
// "semaforo" acepta tres cosas: algo falso (sin circulito), true (circulito
// gris, que es como estaba antes de que el semáforo tuviera sentido, y lo que
// sigue usando cualquier llamador que no calcule promedios) o un objeto
// { clase, titulo } para pintarlo.
//
// incompleto=true agrega un ⚠ (usado por "Convertir todo a Euros" cuando a
// alguna moneda de esa celda le falta el tipo de cambio de ese mes, así que
// el número mostrado quedó sin esa parte). detalleRef (opcional, del tipo
// "reporte:3" o "historico:3", ver registrarDetalle) agrega el botón "i"
// que abre el popup con el detalle de esa celda.
// Se exporta para poder reutilizarla en Dashboard > Snapshot (columna
// "Total (€)"): mismo criterio de color/advertencia que acá. tituloIncompleto
// es opcional porque el texto del ⚠ menciona "este mes", que no aplica en
// Snapshot (no está atado a un mes); Snapshot pasa su propio texto.
export function celdaImporte(v, semaforoInfo, incompleto, detalleRef, tituloIncompleto) {
  const sem = semaforoInfo === true ? { clase: "semaforo-gris", titulo: "" } : semaforoInfo;
  const semaforo = sem
    ? `<span class="semaforo ${sem.clase}"${sem.titulo ? ` title="${escaparAtributo(sem.titulo)}"` : ""}></span>`
    : "";
  const marca = incompleto
    ? `<span class="valor-incompleto" title="${tituloIncompleto || "Falta cargar el tipo de cambio de alguna moneda para este mes, en Configuración > Tipo de cambio"}">⚠</span>`
    : "";
  const boton = detalleRef
    ? `<button type="button" class="btn-detalle" data-detalle="${detalleRef}" title="Ver el detalle de este total">i</button>`
    : "";
  // El número y los adornos (el botón "i" y el circulito) van en dos spans
  // separados y NO todos sueltos adentro del wrap. Es lo que permite alinear
  // el número: antes se centraba el grupo entero, así que el número terminaba
  // corrido a la izquierda tantos pixeles como midieran los adornos que le
  // tocaran al lado — 18 px en una celda con botón, 7 en una vacía, 0 si no
  // tenía ninguno. Cada celda caía en un lugar distinto y la columna se veía
  // torcida. Con los adornos en su propio span de ancho fijo, todos los
  // números terminan en la misma raya (ver el CSS de .valor-numero).
  // El "espejo" es un hueco vacío del mismo ancho que los adornos, puesto del
  // otro lado del número. Con los dos, el número queda EXACTAMENTE en el
  // centro de la celda y entonces el nombre de la columna —que va centrado—
  // le cae justo encima. Sin el espejo, los adornos empujan el número hacia
  // la izquierda y la columna se ve torcida.
  // El ⚠ va adentro del espejo y no suelto, así ocupa un lugar que ya estaba
  // reservado y tampoco corre el número.
  const adornos = `<span class="valor-adornos">${boton}${semaforo}</span>`;
  const espejo = `<span class="valor-espejo">${marca}</span>`;
  if (!v) return `<td class="valor-cero"><span class="valor-wrap">${espejo}<span class="valor-numero">–</span>${adornos}</span></td>`;
  const clase = v > 0 ? "valor-positivo" : "valor-negativo";
  return `<td class="${clase}"><span class="valor-wrap">${espejo}<span class="valor-numero">${v.toFixed(2)}</span>${adornos}</span></td>`;
}

// Registro de "detalle de celda", para el botón "i" y su popup. Mensual e
// Histórica tienen cada uno su propia lista (se vacía al principio de cada
// render de esa tabla en particular: renderReporte()/renderHistorico()
// pueden dispararse por separado, por ejemplo al cambiar solo el mes o
// solo el orden, así que cada una solo toca la suya).
let detallesReporte = [];
let detallesHistorico = [];

function registrarDetalle(registro, prefijo, titulo, grupos) {
  const id = registro.length;
  registro.push({ titulo, grupos });
  return `${prefijo}:${id}`;
}

function formatoFechaCorta(fecha) {
  const partes = String(fecha).split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}` : fecha;
}

// Una línea de detalle a partir de un movimiento puntual: fecha (+
// descripción si tiene) e importe con signo, tal como está cargado (sin
// convertir).
function lineaMovimiento(m) {
  const signo = m.tipo === "ingreso" ? "+" : "-";
  return {
    texto: `${formatoFechaCorta(m.fecha)}${m.descripcion ? " · " + m.descripcion : ""}`,
    monto: `${signo}${Number(m.monto).toFixed(2)}`,
  };
}

// Arma el detalle de un concepto en modo "Convertir todo a Euros": un
// grupo por cada moneda que aportó a ese total, con sus movimientos, el
// subtotal en esa moneda y cómo se convirtió a euros (o el aviso de que
// falta el tipo de cambio de ese mes).
function detalleConceptoEnEuros(registro, prefijo, titulo, movsPorMoneda, mes) {
  const monedaIds = Object.keys(movsPorMoneda).sort((a, b) => nombreMoneda(a).localeCompare(nombreMoneda(b)));
  const grupos = monedaIds.map(monedaId => {
    const movs = movsPorMoneda[monedaId];
    const subtotal = movs.reduce((acc, m) => acc + (m.tipo === "ingreso" ? 1 : -1) * Number(m.monto), 0);
    let nota;
    if (esEuros(monedaId)) {
      nota = `Subtotal: ${subtotal.toFixed(2)} € (sin conversión)`;
    } else {
      const tasa = tasaAEuros(mes, monedaId);
      nota = tasa == null
        ? `Subtotal: ${subtotal.toFixed(2)} ${nombreMoneda(monedaId)} — falta el tipo de cambio de ${formatoMesLegible(mes)}, no se pudo convertir`
        : `Subtotal: ${subtotal.toFixed(2)} ${nombreMoneda(monedaId)} × ${tasa} = ${(subtotal * tasa).toFixed(2)} €`;
    }
    return { etiqueta: nombreMoneda(monedaId), lineas: movs.map(lineaMovimiento), nota };
  });
  return registrarDetalle(registro, prefijo, titulo, grupos);
}

function mostrarDetalle(d) {
  document.getElementById("detalleTitulo").textContent = d.titulo;
  document.getElementById("detalleContenido").innerHTML = d.grupos.map(g => `
    <div class="detalle-grupo">
      ${g.etiqueta ? `<div class="detalle-grupo-titulo">${g.etiqueta}</div>` : ""}
      ${g.lineas.map(l => `<div class="detalle-linea"><span>${l.texto}</span><span>${l.monto}</span></div>`).join("")}
      ${g.nota ? `<div class="detalle-nota">${g.nota}</div>` : ""}
    </div>
  `).join("");
  document.getElementById("detalleOverlay").classList.add("open");
}

// true si esa moneda es "Euros" (por nombre, igual que en tipo-cambio.js):
// convertir euros a euros es directo, no hace falta ningún tipo de cambio.
// Se exporta para que Dashboard > Evolución use exactamente el mismo
// criterio de "qué es un euro" y la misma conversión mes a mes, en vez de
// tener su propia copia que después se desincronice.
export function esEuros(monedaId) {
  const m = state.monedas.find(x => String(x.id) === String(monedaId));
  return !!m && m.nombre.trim().toLowerCase() === "euros";
}

// El tipo de cambio a euros de una moneda puntual, para un mes puntual
// (tabla tipos_cambio, cargada en Configuración > Tipo de cambio). null si
// todavía no se cargó ese mes para esa moneda.
function tasaAEuros(mes, monedaId) {
  const fila = state.tiposCambio.find(
    tc => tc.mes === mes && String(tc.moneda_id) === String(monedaId)
  );
  return fila && fila.valor_eur != null ? Number(fila.valor_eur) : null;
}

// Convierte un importe (ya con signo, ingreso/egreso) de una moneda a
// euros. ok=false cuando faltó el tipo de cambio y por lo tanto no se pudo
// convertir (el importe se pierde, no se cuenta ni de más ni de menos).
export function convertirAEuros(mes, monedaId, monto) {
  if (esEuros(monedaId)) return { valor: monto, ok: true };
  const tasa = tasaAEuros(mes, monedaId);
  if (tasa == null) return { valor: 0, ok: false };
  return { valor: monto * tasa, ok: true };
}

// Arma la lista de tildes para "conceptos" o "monedas" (misma función,
// compartida con Dashboard > Snapshot, ver check-list.js) y guarda cada
// cambio al toque en incluir_en_distribucion, para que se recuerde entre
// sesiones. it.incluir_en_distribucion viene de la base (columna agregada
// con ALTER TABLE); si todavía no existe esa columna llega undefined, y
// undefined !== false se toma como "incluido" (mismo comportamiento que hoy,
// hasta que se agregue). Conceptos suma además "Seleccionar todas" /
// "Deseleccionar todas" (Monedas no la necesitaba, así que se dejó sin
// esos botones).
function renderCheckboxesConceptos() {
  renderCheckboxesTabla("conceptos", state.conceptos, "distribConceptosCheckboxes", "Todavía no hay conceptos cargados.", "incluir_en_distribucion", true);
}

// Lista de conceptos de Flujo de caja: misma función reutilizable, pero
// guarda en su propia columna (conceptos.incluir_en_flujo_caja) para que
// tildar/destildar acá no toque para nada la lista de Mensual/Histórica.
function renderCheckboxesConceptosFlujo() {
  renderCheckboxesTabla("conceptos", state.conceptos, "distribFlujoConceptosCheckboxes", "Todavía no hay conceptos cargados.", "incluir_en_flujo_caja", true);
}

function renderCheckboxesMonedas() {
  renderCheckboxesTabla("monedas", state.monedas, "distribMonedasCheckboxes", "Todavía no hay monedas cargadas.", "incluir_en_distribucion", false);
  // Mientras "Convertir todo a Euros" está tildado, estos tildes no tienen
  // efecto (se usan todas las monedas, convertidas) — se deshabilitan para
  // que se note, sin tocar lo que cada uno tenga guardado en la base.
  const deshabilitado = state.distribucion.convertirEuros;
  document.querySelectorAll('#distribMonedasCheckboxes input[type="checkbox"]').forEach(chk => {
    chk.disabled = deshabilitado;
  });
  const cont = document.getElementById("distribMonedasCheckboxes");
  if (cont) cont.classList.toggle("check-grid-deshabilitado", deshabilitado);
}

// Suma, por concepto, los importes de todas las monedas convertidos a
// euros ese mes (se usa cuando "Convertir todo a Euros" está tildado: ahí
// no importa qué monedas estén tildadas más abajo, entran todas). Devuelve
// los totales y qué conceptos quedaron con alguna conversión incompleta
// (les faltó el tipo de cambio de alguna moneda).
function totalesEnEurosDelMes(mes, conceptoIdsIncluidos) {
  const totales = {};
  const incompletos = {};
  const movsPorConcepto = {}; // concepto_id -> moneda_id -> [movimientos]
  state.movimientos.forEach(m => {
    if (String(m.fecha).slice(0, 7) !== mes) return;
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    const signo = m.tipo === "ingreso" ? 1 : -1;
    const montoOriginal = signo * Number(m.monto);
    const { valor, ok } = convertirAEuros(mes, m.moneda_id, montoOriginal);
    totales[m.concepto_id] = (totales[m.concepto_id] || 0) + valor;
    if (!ok) incompletos[m.concepto_id] = true;
    if (!movsPorConcepto[m.concepto_id]) movsPorConcepto[m.concepto_id] = {};
    if (!movsPorConcepto[m.concepto_id][m.moneda_id]) movsPorConcepto[m.concepto_id][m.moneda_id] = [];
    movsPorConcepto[m.concepto_id][m.moneda_id].push(m);
  });
  return { totales, incompletos, movsPorConcepto };
}

function renderReporteEnEuros(cont, mes, conceptoIdsIncluidos) {
  const { totales, incompletos, movsPorConcepto } = totalesEnEurosDelMes(mes, conceptoIdsIncluidos);
  const conceptosConDatos = state.conceptos
    .filter(c => totales[c.id] !== undefined)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  if (conceptosConDatos.length === 0) {
    cont.innerHTML = `<div class="empty">No hay movimientos en ese mes para los conceptos seleccionados.</div>`;
    return;
  }

  // El promedio histórico de cada concepto, sin contar este mes (ver
  // historicoPorConcepto). Se calcula una vez para toda la tabla.
  const { enEuros, faltaTasa } = historicoPorConcepto(mes);

  let total = 0;
  let totalIncompleto = false;
  const movsPorMonedaTotal = {};
  let html = `<div class="pivot-wrap"><table class="pivot distrib-pivot"><tr><th>Concepto</th><th>Total (€)</th><th class="col-promedio">Promedio (€)</th></tr>`;
  conceptosConDatos.forEach(c => {
    const v = totales[c.id] || 0;
    total += v;
    if (incompletos[c.id]) totalIncompleto = true;
    Object.entries(movsPorConcepto[c.id] || {}).forEach(([monedaId, movs]) => {
      if (!movsPorMonedaTotal[monedaId]) movsPorMonedaTotal[monedaId] = [];
      movsPorMonedaTotal[monedaId].push(...movs);
    });
    const detalleRef = detalleConceptoEnEuros(
      detallesReporte, "reporte", `${c.nombre} — ${formatoMesLegible(mes)}`, movsPorConcepto[c.id] || {}, mes
    );
    const { promedio, incompleto } = promediar(enEuros[c.id], faltaTasa[c.id]);
    html += `<tr><td>${c.nombre}</td>` +
      celdaImporte(v, semaforoContraPromedio(v, promedio, "€"), !!incompletos[c.id], detalleRef) +
      celdaPromedio(promedio, incompleto) +
      `</tr>`;
  });
  const detalleTotalRef = detalleConceptoEnEuros(
    detallesReporte, "reporte", `Total — ${formatoMesLegible(mes)}`, movsPorMonedaTotal, mes
  );
  // El promedio de la fila "Total" sale de los mismos conceptos que se están
  // mostrando, no de todos: si no, no cerraría con el total de arriba.
  const idsMostrados = conceptosConDatos.map(c => c.id);
  const { promedio: promedioTotal, incompleto: totalPromIncompleto } = promediar(
    sumarPorMes(idsMostrados.map(id => enEuros[id])),
    unirMeses(idsMostrados.map(id => faltaTasa[id]))
  );
  html += `<tr class="total-row"><td>Total</td>` +
    celdaImporte(total, semaforoContraPromedio(total, promedioTotal, "€"), totalIncompleto, detalleTotalRef) +
    celdaPromedio(promedioTotal, totalPromIncompleto) +
    `</tr>`;
  html += `</table></div>`;
  html += `<p class="tipo-cambio-nota">Convertido a euros con los tipos de cambio de Configuración &gt; Tipo de cambio, para este mismo mes. ⚠ = falta cargar el tipo de cambio de alguna moneda ese mes, ese total está incompleto. Tocá el botón "i" de cada celda para ver el detalle.</p>`;

  cont.innerHTML = html;
}

// --- Flujo de caja: tarjetas "Gastos fijos/variables" e "Ingresos --------
// --- fijos/variables" --------------------------------------------------
//
// Pestaña propia de Distribución (a pedido de Nadia), con cuatro tarjetas:
// el total de EGRESOS del mes separado en Gastos fijos/variables, y el
// total de INGRESOS del mes separado en Ingresos fijos/variables — las dos
// parejas según conceptos.tipo_gasto ("fijo" o "variable", ver
// Configuración > Conceptos). Cada tarjeta solo cuenta movimientos de SU
// tipo a propósito (Gastos = egresos, Ingresos = ingresos): la
// clasificación fijo/variable es del CONCEPTO, no del movimiento, así que
// un concepto que normalmente es de ingreso pero tuviera alguna vez un
// movimiento cargado como egreso entraría en Gastos ese mes, y viceversa.
//
// Las cuatro tarjetas usan las mismas funciones de cálculo parametrizadas
// por "tipoMovimiento" ("egreso" o "ingreso") en vez de tener una copia
// para cada una — sería el mismo código repetido dos veces si no.
//
// Tienen su propia lista de "Conceptos a incluir" (conceptos.
// incluir_en_flujo_caja), independiente de la que usan Mensual/Histórica,
// pero comparten con esas dos pestañas la selección de "Monedas a incluir"
// / "Convertir todo a Euros" de arriba (eso no se pidió separar).
let detallesFijoVariable = [];

function tipoGastoDe(conceptoId) {
  const c = state.conceptos.find(x => String(x.id) === String(conceptoId));
  // Cualquier cosa que no sea "fijo" (incluido null/undefined, por si algún
  // concepto viejo no tuviera la columna todavía) cuenta como "variable",
  // que es el valor por defecto de la columna en la base.
  return c && c.tipo_gasto === "fijo" ? "fijo" : "variable";
}

// signo: +1 para que un ingreso quede en positivo (igual que en el resto de
// la app) y -1 para que un egreso quede en negativo — mismo criterio que
// usa renderReporte() más arriba con sus movimientos.
function signoDe(tipoMovimiento) {
  return tipoMovimiento === "ingreso" ? 1 : -1;
}

function totalesFijoVariableEnEuros(tipoMovimiento, mes, conceptoIdsIncluidos) {
  const porConcepto = { fijo: {}, variable: {} };  // tipo -> concepto_id -> total en €
  const incompletos = { fijo: {}, variable: {} };  // tipo -> concepto_id -> true
  const totales = { fijo: 0, variable: 0 };
  const totalIncompleto = { fijo: false, variable: false };
  const signo = signoDe(tipoMovimiento);
  state.movimientos.forEach(m => {
    if (m.tipo !== tipoMovimiento) return;
    if (String(m.fecha).slice(0, 7) !== mes) return;
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    const tipo = tipoGastoDe(m.concepto_id);
    const { valor, ok } = convertirAEuros(mes, m.moneda_id, signo * Number(m.monto));
    porConcepto[tipo][m.concepto_id] = (porConcepto[tipo][m.concepto_id] || 0) + valor;
    totales[tipo] += valor;
    if (!ok) { incompletos[tipo][m.concepto_id] = true; totalIncompleto[tipo] = true; }
  });
  return { porConcepto, incompletos, totales, totalIncompleto };
}

function totalesFijoVariablePorMoneda(tipoMovimiento, mes, conceptoIdsIncluidos, monedaIdsIncluidas) {
  const porConceptoMoneda = { fijo: {}, variable: {} }; // tipo -> concepto_id -> moneda_id -> total
  const totalesPorMoneda = { fijo: {}, variable: {} };  // tipo -> moneda_id -> total
  const signo = signoDe(tipoMovimiento);
  state.movimientos.forEach(m => {
    if (m.tipo !== tipoMovimiento) return;
    if (String(m.fecha).slice(0, 7) !== mes) return;
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    if (!monedaIdsIncluidas.has(String(m.moneda_id))) return;
    const tipo = tipoGastoDe(m.concepto_id);
    const val = signo * Number(m.monto);
    if (!porConceptoMoneda[tipo][m.concepto_id]) porConceptoMoneda[tipo][m.concepto_id] = {};
    porConceptoMoneda[tipo][m.concepto_id][m.moneda_id] = (porConceptoMoneda[tipo][m.concepto_id][m.moneda_id] || 0) + val;
    totalesPorMoneda[tipo][m.moneda_id] = (totalesPorMoneda[tipo][m.moneda_id] || 0) + val;
  });
  return { porConceptoMoneda, totalesPorMoneda };
}

// Promedio histórico (de gasto o de ingreso, según tipoMovimiento) por tipo
// ("fijo"/"variable"), para el semáforo y el promedio de las tarjetas de
// Flujo de caja. Mismo criterio que historicoPorConcepto de más arriba (no
// cuenta el mes que se está mirando; un mes al que le faltó algún tipo de
// cambio no entra en el promedio en euros), pero acá se suma TODO lo que
// sea de ese tipo junto, sin separar por concepto — es el promedio de
// "cuánto gasté/ingresé fijo/variable por mes", no el de un concepto en
// particular.
function historicoFijoVariable(tipoMovimiento, mesExcluido, conceptoIdsIncluidos) {
  const porMoneda = { fijo: {}, variable: {} };  // tipo -> moneda_id -> { mes: total }
  const enEuros = { fijo: {}, variable: {} };    // tipo -> { mes: total }
  const faltaTasa = { fijo: {}, variable: {} };  // tipo -> { mes: true }
  const signo = signoDe(tipoMovimiento);
  state.movimientos.forEach(m => {
    if (m.tipo !== tipoMovimiento) return;
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    const mes = String(m.fecha).slice(0, 7);
    if (mes === mesExcluido) return;
    const tipo = tipoGastoDe(m.concepto_id);
    const val = signo * Number(m.monto);

    if (!porMoneda[tipo][m.moneda_id]) porMoneda[tipo][m.moneda_id] = {};
    porMoneda[tipo][m.moneda_id][mes] = (porMoneda[tipo][m.moneda_id][mes] || 0) + val;

    const { valor, ok } = convertirAEuros(mes, m.moneda_id, val);
    enEuros[tipo][mes] = (enEuros[tipo][mes] || 0) + valor;
    if (!ok) faltaTasa[tipo][mes] = true;
  });
  return { porMoneda, enEuros, faltaTasa };
}

// Línea "Prom. X" debajo de cada importe de las tarjetas de Gastos
// fijos/variables. Igual que celdaPromedio() del reporte de arriba: "–"
// cuando no hay meses anteriores con qué comparar, y ⚠ cuando a algún mes
// anterior le faltó el tipo de cambio de alguna moneda (así que ese mes no
// entró en el promedio y el número mostrado puede estar incompleto).
function textoPromedio(promedio, incompleto, unidad) {
  if (promedio == null) return `<span class="fijovar-promedio">Promedio: –</span>`;
  const marca = incompleto ? "⚠ " : "";
  const sufijo = unidad ? " " + unidad : "";
  return `<span class="fijovar-promedio">${marca}Promedio: ${promedio.toFixed(2)}${sufijo}</span>`;
}

function spanSemaforo(sem) {
  return `<span class="semaforo ${sem.clase}"${sem.titulo ? ` title="${escaparAtributo(sem.titulo)}"` : ""}></span>`;
}

function nombreConceptoOrdenable(id) {
  const c = state.conceptos.find(x => String(x.id) === String(id));
  return c ? c.nombre : "";
}

// Arma el detalle que abre el botón "i" de cada tarjeta: reusa el mismo
// popup (#detalleOverlay) y la misma forma de "grupos" que el resto de la
// app, pero acá cada línea es un CONCEPTO con su total de ese mes (no un
// movimiento puntual) — es un resumen, no una lista de movimientos. Con
// "Convertir todo a Euros" es un solo grupo; sin convertir, un grupo por
// moneda seleccionada, y en cada uno solo aparecen los conceptos que
// tuvieron algo en esa moneda ese mes.
function detalleFijoVariable(tipo, titulo, datosEuros, datosPorMoneda, monedaIdsOrdenadas) {
  let grupos;
  if (datosEuros) {
    const porConcepto = datosEuros.porConcepto[tipo];
    const ids = Object.keys(porConcepto).sort((a, b) => nombreConceptoOrdenable(a).localeCompare(nombreConceptoOrdenable(b)));
    grupos = [{
      etiqueta: null,
      lineas: ids.map(id => ({
        texto: nombreConceptoOrdenable(id),
        monto: `${porConcepto[id].toFixed(2)} €${datosEuros.incompletos[tipo][id] ? " ⚠" : ""}`,
      })),
    }];
  } else {
    const porConceptoMoneda = datosPorMoneda.porConceptoMoneda[tipo];
    grupos = monedaIdsOrdenadas.map(monedaId => {
      const ids = Object.keys(porConceptoMoneda)
        .filter(id => porConceptoMoneda[id][monedaId])
        .sort((a, b) => nombreConceptoOrdenable(a).localeCompare(nombreConceptoOrdenable(b)));
      if (ids.length === 0) return null;
      return {
        etiqueta: nombreMoneda(monedaId),
        lineas: ids.map(id => ({ texto: nombreConceptoOrdenable(id), monto: porConceptoMoneda[id][monedaId].toFixed(2) })),
      };
    }).filter(Boolean);
  }
  if (grupos.length === 0) {
    grupos = [{ etiqueta: null, lineas: [{ texto: "Sin movimientos este mes", monto: "" }] }];
  }
  return registrarDetalle(detallesFijoVariable, "fijovar", titulo, grupos);
}

function tarjetaFijoVariable(tipo, titulo, mes, datosEuros, datosPorMoneda, monedaIdsOrdenadas, historico) {
  const tituloDetalle = `${titulo} — ${formatoMesLegible(mes)}`;
  let montoHtml;
  if (datosEuros) {
    const v = datosEuros.totales[tipo];
    const marca = datosEuros.totalIncompleto[tipo]
      ? `<span class="valor-incompleto" title="Falta cargar el tipo de cambio de alguna moneda para este mes, en Configuración &gt; Tipo de cambio">⚠</span>`
      : "";
    const clase = v > 0 ? "positivo" : v < 0 ? "negativo" : "cero";
    // El promedio y el semáforo comparan contra los meses ANTERIORES (nunca
    // contra este mismo mes) usando el mismo umbral y el mismo criterio que
    // la columna "Promedio" del reporte de arriba (semaforoContraPromedio):
    // verde/rojo según si gastaste más o menos del umbral de diferencia, y
    // ámbar cuando estás dentro de ese margen.
    const { promedio, incompleto } = promediar(historico.enEuros[tipo], historico.faltaTasa[tipo]);
    const sem = semaforoContraPromedio(v, promedio, "€");
    montoHtml = `
      <div class="fijovar-item">
        <span class="fijovar-linea">${marca}<span class="${clase}">${v ? v.toFixed(2) : "–"} €</span>${spanSemaforo(sem)}</span>
        ${textoPromedio(promedio, incompleto, "€")}
      </div>`;
  } else if (monedaIdsOrdenadas.length === 0) {
    montoHtml = `<div class="fijovar-item"><span class="fijovar-linea"><span class="cero">–</span></span></div>`;
  } else {
    const totalesTipo = datosPorMoneda.totalesPorMoneda[tipo];
    // Se muestran TODAS las monedas que tuvieron algo ese mes en cualquiera
    // de las dos tarjetas (no solo en esta), igual que hace la tabla de
    // arriba con sus columnas: así, si una moneda tuvo movimientos variables
    // pero ninguno fijo ese mes, la tarjeta de Fijos también la lista en
    // 0.00 en vez de omitirla.
    montoHtml = monedaIdsOrdenadas.map(monedaId => {
      const v = totalesTipo[monedaId] || 0;
      const clase = v > 0 ? "positivo" : v < 0 ? "negativo" : "cero";
      const { promedio } = promediar(historico.porMoneda[tipo][monedaId]);
      const sem = semaforoContraPromedio(v, promedio, nombreMoneda(monedaId));
      return `
        <div class="fijovar-item">
          <span class="fijovar-linea"><span class="${clase}">${v ? v.toFixed(2) : "–"} ${nombreMoneda(monedaId)}</span>${spanSemaforo(sem)}</span>
          ${textoPromedio(promedio, false, nombreMoneda(monedaId))}
        </div>`;
    }).join("");
  }
  const detalleRef = detalleFijoVariable(tipo, tituloDetalle, datosEuros, datosPorMoneda, monedaIdsOrdenadas);
  return `
    <div class="card card-fijovar">
      <div class="fijovar-header">
        <h3>${titulo}</h3>
        <button type="button" class="btn-detalle" data-detalle="${detalleRef}" title="Ver el detalle por concepto">i</button>
      </div>
      <div class="fijovar-monto">${montoHtml}</div>
    </div>`;
}

// Arma un par de tarjetas (fijo/variable) para un contenedor y un
// tipoMovimiento puntual ("egreso" -> Gastos, "ingreso" -> Ingresos). Se
// llama una vez por cada par (ver renderFlujoCaja), pasándole el título que
// corresponda a cada una.
function renderGrupoFijoVariable(contenedorId, tipoMovimiento, tituloFijo, tituloVariable, mes, conceptoIdsIncluidos, monedaIdsIncluidas) {
  const cont = document.getElementById(contenedorId);
  if (!cont) return;
  const historico = historicoFijoVariable(tipoMovimiento, mes, conceptoIdsIncluidos);
  if (state.distribucion.convertirEuros) {
    const datosEuros = totalesFijoVariableEnEuros(tipoMovimiento, mes, conceptoIdsIncluidos);
    cont.innerHTML =
      tarjetaFijoVariable("fijo", tituloFijo, mes, datosEuros, null, [], historico) +
      tarjetaFijoVariable("variable", tituloVariable, mes, datosEuros, null, [], historico);
    return;
  }
  const datosPorMoneda = totalesFijoVariablePorMoneda(tipoMovimiento, mes, conceptoIdsIncluidos, monedaIdsIncluidas);
  const monedaIdsOrdenadas = Array.from(
    new Set([...Object.keys(datosPorMoneda.totalesPorMoneda.fijo), ...Object.keys(datosPorMoneda.totalesPorMoneda.variable)])
  ).sort((a, b) => nombreMoneda(a).localeCompare(nombreMoneda(b)));
  cont.innerHTML =
    tarjetaFijoVariable("fijo", tituloFijo, mes, null, datosPorMoneda, monedaIdsOrdenadas, historico) +
    tarjetaFijoVariable("variable", tituloVariable, mes, null, datosPorMoneda, monedaIdsOrdenadas, historico);
}

// Pestaña "Flujo de caja": las cuatro tarjetas (Gastos fijos/variables,
// Ingresos fijos/variables). Usa su PROPIA lista de conceptos
// (incluir_en_flujo_caja), no la de Mensual/Histórica. detallesFijoVariable
// se reinicia acá UNA sola vez para las cuatro tarjetas (no una vez por
// grupo): así las referencias "fijovar:0", "fijovar:1", etc. que arma cada
// una no se pisan entre el grupo de Gastos y el de Ingresos.
function renderFlujoCaja() {
  detallesFijoVariable = [];
  const mes = state.distribucion.mes || mesActualTexto();
  const conceptoIdsIncluidos = new Set(
    state.conceptos.filter(c => c.incluir_en_flujo_caja !== false).map(c => String(c.id))
  );
  const monedaIdsIncluidas = new Set(
    state.monedas.filter(m => m.incluir_en_distribucion !== false).map(m => String(m.id))
  );
  renderGrupoFijoVariable("distribFijoVariable", "egreso", "Gastos fijos", "Gastos variables", mes, conceptoIdsIncluidos, monedaIdsIncluidas);
  renderGrupoFijoVariable("distribFijoVariableIngresos", "ingreso", "Ingresos fijos", "Ingresos variables", mes, conceptoIdsIncluidos, monedaIdsIncluidas);
}

function renderReporte() {
  detallesReporte = [];
  const cont = document.getElementById("distribReporte");
  const mes = state.distribucion.mes || mesActualTexto();
  const conceptoIdsIncluidos = new Set(
    state.conceptos.filter(c => c.incluir_en_distribucion !== false).map(c => String(c.id))
  );
  const monedaIdsIncluidas = new Set(
    state.monedas.filter(m => m.incluir_en_distribucion !== false).map(m => String(m.id))
  );

  if (state.distribucion.convertirEuros) {
    renderReporteEnEuros(cont, mes, conceptoIdsIncluidos);
    return;
  }

  // Se suma por concepto y, dentro de cada concepto, por moneda (así no se
  // mezclan importes de monedas distintas en un mismo número). El signo
  // sale del tipo de cada movimiento: ingreso suma, egreso resta. Se
  // guardan también los movimientos de cada combinación concepto+moneda
  // (movsPorConceptoMoneda) para el botón "i" de cada celda.
  const porConceptoMoneda = {};
  const movsPorConceptoMoneda = {};
  const monedaIdsUsadas = new Set();
  state.movimientos.forEach(m => {
    if (String(m.fecha).slice(0, 7) !== mes) return;
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    if (!monedaIdsIncluidas.has(String(m.moneda_id))) return;
    const signo = m.tipo === "ingreso" ? 1 : -1;
    const val = signo * Number(m.monto);
    if (!porConceptoMoneda[m.concepto_id]) porConceptoMoneda[m.concepto_id] = {};
    porConceptoMoneda[m.concepto_id][m.moneda_id] = (porConceptoMoneda[m.concepto_id][m.moneda_id] || 0) + val;
    if (!movsPorConceptoMoneda[m.concepto_id]) movsPorConceptoMoneda[m.concepto_id] = {};
    if (!movsPorConceptoMoneda[m.concepto_id][m.moneda_id]) movsPorConceptoMoneda[m.concepto_id][m.moneda_id] = [];
    movsPorConceptoMoneda[m.concepto_id][m.moneda_id].push(m);
    monedaIdsUsadas.add(m.moneda_id);
  });

  if (monedaIdsUsadas.size === 0) {
    cont.innerHTML = `<div class="empty">No hay movimientos en ese mes para los conceptos y monedas seleccionados.</div>`;
    return;
  }

  const listaMonedaIds = Array.from(monedaIdsUsadas).sort((a, b) => nombreMoneda(a).localeCompare(nombreMoneda(b)));

  // El promedio histórico de cada concepto en cada moneda, sin contar este
  // mes. Acá no se convierte nada: cada moneda se promedia con la suya, que
  // es lo mismo que hace el resto de esta tabla.
  const { porMoneda } = historicoPorConcepto(mes);

  let html = `<div class="pivot-wrap"><table class="pivot distrib-pivot"><tr><th>Concepto</th>` +
    listaMonedaIds.map(id =>
      `<th>${nombreMoneda(id)}</th><th class="col-promedio">Prom. ${nombreMoneda(id)}</th>`
    ).join("") + `</tr>`;

  // Solo se listan los conceptos que tuvieron movimientos ese mes (para no
  // llenar el reporte de filas en cero); los que no tuvieron simplemente no
  // aparecen.
  const totales = {};
  const movsPorMonedaTotal = {};
  state.conceptos
    .filter(c => porConceptoMoneda[c.id])
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach(c => {
      const fila = porConceptoMoneda[c.id];
      html += `<tr><td>${c.nombre}</td>`;
      listaMonedaIds.forEach(monedaId => {
        const v = fila[monedaId] || 0;
        totales[monedaId] = (totales[monedaId] || 0) + v;
        const movs = (movsPorConceptoMoneda[c.id] && movsPorConceptoMoneda[c.id][monedaId]) || [];
        if (!movsPorMonedaTotal[monedaId]) movsPorMonedaTotal[monedaId] = [];
        movsPorMonedaTotal[monedaId].push(...movs);
        const detalleRef = movs.length
          ? registrarDetalle(
              detallesReporte, "reporte",
              `${c.nombre} — ${nombreMoneda(monedaId)} — ${formatoMesLegible(mes)}`,
              [{ etiqueta: null, lineas: movs.map(lineaMovimiento) }]
            )
          : null;
        const { promedio } = promediar(porMoneda[c.id + "|" + monedaId]);
        html += celdaImporte(v, semaforoContraPromedio(v, promedio, nombreMoneda(monedaId)), false, detalleRef) +
          celdaPromedio(promedio, false);
      });
      html += `</tr>`;
    });

  // Igual que en la vista de euros: el promedio de la fila "Total" sale solo
  // de los conceptos que se están mostrando.
  const idsMostrados = state.conceptos.filter(c => porConceptoMoneda[c.id]).map(c => c.id);
  html += `<tr class="total-row"><td>Total</td>` +
    listaMonedaIds.map(monedaId => {
      const movs = movsPorMonedaTotal[monedaId] || [];
      const detalleRef = movs.length
        ? registrarDetalle(
            detallesReporte, "reporte",
            `Total ${nombreMoneda(monedaId)} — ${formatoMesLegible(mes)}`,
            [{ etiqueta: null, lineas: movs.map(lineaMovimiento) }]
          )
        : null;
      const v = totales[monedaId] || 0;
      const { promedio } = promediar(sumarPorMes(idsMostrados.map(id => porMoneda[id + "|" + monedaId])));
      return celdaImporte(v, semaforoContraPromedio(v, promedio, nombreMoneda(monedaId)), false, detalleRef) +
        celdaPromedio(promedio, false);
    }).join("") + `</tr>`;
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
// conceptos incluidos) por mes-año y por concepto, y guarda esos mismos
// movimientos aparte (movsPorMesConcepto) para el botón "i" de cada celda.
function calcularHistoricoPorMoneda(monedaId, conceptoIdsIncluidos) {
  const porMesConcepto = {};
  const movsPorMesConcepto = {};
  const mesesUsados = new Set();
  state.movimientos.forEach(m => {
    if (String(m.moneda_id) !== String(monedaId)) return;
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    const mes = String(m.fecha).slice(0, 7);
    const signo = m.tipo === "ingreso" ? 1 : -1;
    const val = signo * Number(m.monto);
    if (!porMesConcepto[mes]) porMesConcepto[mes] = {};
    porMesConcepto[mes][m.concepto_id] = (porMesConcepto[mes][m.concepto_id] || 0) + val;
    if (!movsPorMesConcepto[mes]) movsPorMesConcepto[mes] = {};
    if (!movsPorMesConcepto[mes][m.concepto_id]) movsPorMesConcepto[mes][m.concepto_id] = [];
    movsPorMesConcepto[mes][m.concepto_id].push(m);
    mesesUsados.add(mes);
  });
  return { porMesConcepto, movsPorMesConcepto, mesesUsados };
}

// Arma la sección (colapsable) de una moneda: una tabla con una fila por
// mes-año y una columna por cada concepto seleccionado (aparecen todos los
// conceptos tildados, tengan o no movimientos en esta moneda puntual, para
// que las columnas sean las mismas en todas las secciones).
function renderSeccionHistorica(moneda, conceptosIncluidos, conceptoIdsIncluidos, orden) {
  const { porMesConcepto, movsPorMesConcepto, mesesUsados } = calcularHistoricoPorMoneda(moneda.id, conceptoIdsIncluidos);
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
      const movs = (movsPorMesConcepto[mes] && movsPorMesConcepto[mes][c.id]) || [];
      const detalleRef = movs.length
        ? registrarDetalle(
            detallesHistorico, "historico",
            `${c.nombre} — ${moneda.nombre} — ${formatoMesLegible(mes)}`,
            [{ etiqueta: null, lineas: movs.map(lineaMovimiento) }]
          )
        : null;
      tabla += celdaImporte(v, false, false, detalleRef);
    });
    tabla += `</tr>`;
  });
  tabla += `</table>`;

  return `
    <div class="card card-ancho">
      <details class="collapsible" open>
        <summary>${moneda.nombre}</summary>
        <div class="pivot-wrap">${tabla}</div>
      </details>
    </div>`;
}

// Igual que calcularHistoricoPorMoneda, pero para todas las monedas juntas
// convertidas a euros (se usa con "Convertir todo a Euros" tildado): agrupa
// por mes-año y por concepto, sumando el equivalente en euros de cada
// moneda, y marca qué celdas mes-concepto quedaron con alguna conversión
// incompleta por falta de tipo de cambio.
function calcularHistoricoEnEuros(conceptoIdsIncluidos) {
  const porMesConcepto = {};
  const movsPorMesConcepto = {}; // mes -> concepto_id -> moneda_id -> [movs]
  const mesesUsados = new Set();
  const incompletos = new Set(); // claves "mes|concepto_id"
  state.movimientos.forEach(m => {
    if (!conceptoIdsIncluidos.has(String(m.concepto_id))) return;
    const mes = String(m.fecha).slice(0, 7);
    const signo = m.tipo === "ingreso" ? 1 : -1;
    const montoOriginal = signo * Number(m.monto);
    const { valor, ok } = convertirAEuros(mes, m.moneda_id, montoOriginal);
    if (!porMesConcepto[mes]) porMesConcepto[mes] = {};
    porMesConcepto[mes][m.concepto_id] = (porMesConcepto[mes][m.concepto_id] || 0) + valor;
    if (!ok) incompletos.add(mes + "|" + m.concepto_id);
    if (!movsPorMesConcepto[mes]) movsPorMesConcepto[mes] = {};
    if (!movsPorMesConcepto[mes][m.concepto_id]) movsPorMesConcepto[mes][m.concepto_id] = {};
    if (!movsPorMesConcepto[mes][m.concepto_id][m.moneda_id]) movsPorMesConcepto[mes][m.concepto_id][m.moneda_id] = [];
    movsPorMesConcepto[mes][m.concepto_id][m.moneda_id].push(m);
    mesesUsados.add(mes);
  });
  return { porMesConcepto, movsPorMesConcepto, mesesUsados, incompletos };
}

function renderSeccionHistoricaEuros(conceptosIncluidos, conceptoIdsIncluidos, orden) {
  const { porMesConcepto, movsPorMesConcepto, mesesUsados, incompletos } = calcularHistoricoEnEuros(conceptoIdsIncluidos);
  let listaMeses = Array.from(mesesUsados).sort();
  if (orden === "desc") listaMeses.reverse();

  if (listaMeses.length === 0) {
    return `
      <div class="card">
        <details class="collapsible" open>
          <summary>Total en Euros</summary>
          <p class="empty">No hay movimientos para los conceptos seleccionados.</p>
        </details>
      </div>`;
  }

  let tabla = `<table class="pivot distrib-pivot"><tr><th>Mes</th>` +
    conceptosIncluidos.map(c => `<th>${c.nombre}</th>`).join("") + `</tr>`;
  listaMeses.forEach(mes => {
    tabla += `<tr><td>${formatoMesLegible(mes)}</td>`;
    conceptosIncluidos.forEach(c => {
      const v = (porMesConcepto[mes] && porMesConcepto[mes][c.id]) || 0;
      const movsPorMoneda = (movsPorMesConcepto[mes] && movsPorMesConcepto[mes][c.id]) || {};
      const detalleRef = Object.keys(movsPorMoneda).length
        ? detalleConceptoEnEuros(detallesHistorico, "historico", `${c.nombre} — ${formatoMesLegible(mes)}`, movsPorMoneda, mes)
        : null;
      tabla += celdaImporte(v, false, incompletos.has(mes + "|" + c.id), detalleRef);
    });
    tabla += `</tr>`;
  });
  tabla += `</table>`;

  return `
    <div class="card card-ancho">
      <details class="collapsible" open>
        <summary>Total en Euros</summary>
        <div class="pivot-wrap">${tabla}</div>
        <p class="tipo-cambio-nota">⚠ = falta cargar el tipo de cambio de alguna moneda para ese mes. Tocá el botón "i" de cada celda para ver el detalle.</p>
      </details>
    </div>`;
}

function renderHistorico() {
  detallesHistorico = [];
  const cont = document.getElementById("distribHistoricoSecciones");
  const conceptosIncluidos = state.conceptos
    .filter(c => c.incluir_en_distribucion !== false)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const conceptoIdsIncluidos = new Set(conceptosIncluidos.map(c => String(c.id)));

  if (conceptosIncluidos.length === 0) {
    cont.innerHTML = `<div class="card"><p class="empty">Elegí al menos un concepto arriba para armar el histórico.</p></div>`;
    return;
  }

  if (state.distribucion.convertirEuros) {
    cont.innerHTML = renderSeccionHistoricaEuros(conceptosIncluidos, conceptoIdsIncluidos, state.distribucion.ordenHistorico);
    return;
  }

  const monedasIncluidas = state.monedas
    .filter(m => m.incluir_en_distribucion !== false)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  if (monedasIncluidas.length === 0) {
    cont.innerHTML = `<div class="card"><p class="empty">Elegí al menos una moneda arriba (o tildá "Convertir todo a Euros") para armar el histórico.</p></div>`;
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
  const chkEuros = document.getElementById("distribConvertirEuros");
  if (chkEuros) chkEuros.checked = state.distribucion.convertirEuros;
  renderCheckboxesConceptos();
  renderCheckboxesConceptosFlujo();
  renderCheckboxesMonedas();
  renderReporte();
  renderHistorico();
  renderFlujoCaja();
}

export function setupDistribucion() {
  poblarSelectMes("distrib");
  poblarSelectAnio("distrib");
  poblarSelectMes("distribFlujo");
  poblarSelectAnio("distribFlujo");
  // Mensual y Flujo de caja comparten state.distribucion.mes: cambiar el
  // mes desde cualquiera de las dos pestañas actualiza el otro selector (ver
  // escribirMesSeleccionado) y vuelve a renderizar las dos, para que no
  // queden desincronizadas si el mes se cambia mientras se está en la otra.
  ["distrib", "distribFlujo"].forEach(prefijo => {
    ["MesNombre", "Anio"].forEach(sufijo => {
      document.getElementById(prefijo + sufijo).addEventListener("change", () => {
        state.distribucion.mes = leerMesSeleccionado(prefijo);
        escribirMesSeleccionado(state.distribucion.mes);
        renderReporte();
        renderFlujoCaja();
      });
    });
  });

  document.getElementById("distribOrdenHistorico").addEventListener("change", (e) => {
    state.distribucion.ordenHistorico = e.target.value;
    renderHistorico();
  });

  // Se guarda en configuracion_general (Supabase) en vez del navegador,
  // para que se recuerde sin importar desde qué dispositivo entres. Mismo
  // criterio que el resto de la app: se guarda y recién después se
  // recarga todo con cargarTodo() (que es quien pisa
  // state.distribucion.convertirEuros con lo recién guardado).
  document.getElementById("distribConvertirEuros").addEventListener("change", async (e) => {
    const valor = e.target.checked;
    const { error } = await getClient()
      .from("configuracion_general")
      .upsert({ clave: "convertir_euros", valor: String(valor) }, { onConflict: "clave" });
    if (error) {
      avisarError("No se pudo guardar: " + error.message);
      e.target.checked = !valor;
      return;
    }
    await cargarTodo();
  });

  // Botón "i" de cada celda de Mensual/Histórica: se delega en el
  // document (los botones se recrean en cada render, no tendría sentido
  // engancharles un listener uno por uno cada vez).
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-detalle]");
    if (!btn) return;
    const [prefijo, idTexto] = btn.dataset.detalle.split(":");
    const fuente = prefijo === "historico" ? detallesHistorico
      : prefijo === "fijovar" ? detallesFijoVariable
      : detallesReporte;
    const d = fuente[Number(idTexto)];
    if (d) mostrarDetalle(d);
  });

  document.getElementById("detalleClose").addEventListener("click", () => {
    document.getElementById("detalleOverlay").classList.remove("open");
  });
}
