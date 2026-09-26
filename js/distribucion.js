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
// "Flujo de caja" es una tercera pestaña (a pedido de Nadia), pero vive en
// su PROPIO archivo (js/flujo-caja.js) — igual que cada pestaña de
// Dashboard/Gastos tiene el suyo (dashboard.js, evolucion.js, gastos.js,
// asignacion.js, conciliacion.js) — así que no se describe acá, ver el
// comentario de arriba de ESE archivo. Tiene su PROPIO mes elegido
// (state.flujoCaja.mes, independiente de state.distribucion.mes de acá: se
// puede estar mirando Julio en Mensual y Septiembre en Flujo de caja al
// mismo tiempo, a propósito). Lo que SÍ vive acá, porque Flujo de caja lo
// reusa en vez de duplicarlo, son varias piezas exportadas: el
// semáforo/promedio (semaforoContraPromedio, promediar), el popup de
// detalle (registrarDetalle, mostrarDetalle, escaparAtributo), la
// conversión a euros (convertirAEuros, esEuros), el formato de mes
// (formatoMesLegible, mesActualTexto) y las funciones de selector de mes
// (poblarSelectMes, poblarSelectAnio, leerMesSeleccionado,
// escribirMesSeleccionado) — estas últimas porque el MECANISMO del
// selector (dos <select> propios en español, ver más abajo) es el mismo en
// las dos pestañas, aunque cada una lo use con su propio mes.
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

// Se exporta para que js/flujo-caja.js sepa a qué mes caer por defecto la
// primera vez, antes de que state.distribucion.mes tenga algo cargado —
// mismo criterio que usa Mensual acá abajo.
export function mesActualTexto() {
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
// y su PROPIO mes en el estado (state.distribucion.mes y state.flujoCaja.mes
// respectivamente, independientes entre sí): estas cuatro funciones reciben
// el prefijo del par que corresponda para no tener que escribir una versión
// por pestaña. Se exportan para que js/flujo-caja.js arme y lea su propio
// par de <select> con las mismas funciones, en vez de tener su propia
// copia.
export function poblarSelectMes(prefijo) {
  const sel = document.getElementById(prefijo + "MesNombre");
  if (!sel) return;
  sel.innerHTML = MESES.map((nombre, i) => {
    const valor = String(i + 1).padStart(2, "0");
    return `<option value="${valor}">${nombre}</option>`;
  }).join("");
}

export function poblarSelectAnio(prefijo) {
  const sel = document.getElementById(prefijo + "Anio");
  if (!sel) return;
  const anioActual = new Date().getFullYear();
  const anios = [];
  for (let a = anioActual - 5; a <= anioActual + 1; a++) anios.push(a);
  sel.innerHTML = anios.map(a => `<option value="${a}">${a}</option>`).join("");
}

export function leerMesSeleccionado(prefijo) {
  const mes = document.getElementById(prefijo + "MesNombre").value;
  const anio = document.getElementById(prefijo + "Anio").value;
  return anio + "-" + mes;
}

export function escribirMesSeleccionado(prefijo, mesTexto) {
  const [anio, mes] = mesTexto.split("-");
  const selMes = document.getElementById(prefijo + "MesNombre");
  const selAnio = document.getElementById(prefijo + "Anio");
  if (selMes) selMes.value = mes;
  if (selAnio) selAnio.value = anio;
}

// Se exporta para que js/flujo-caja.js arme el título de su propio
// semáforo (spanSemaforo) con el mismo escapado que usa acá celdaImporte.
export function escaparAtributo(texto) {
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
// Se exporta para que js/flujo-caja.js promedie sus propios totales (por
// tipo fijo/variable) con el mismo criterio, en vez de reimplementarlo.
export function promediar(porMes, mesesConFalta) {
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
// Se exporta para que js/flujo-caja.js pinte el mismo semáforo (mismo
// umbral, mismo criterio) en sus propias tarjetas.
export function semaforoContraPromedio(total, promedio, unidad) {
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

// La celda de la columna "Proporción" (va después de "Promedio", a pedido
// de Nadia): qué porcentaje representa el total de ESTE concepto dentro
// del total de ingresos (si dio positivo ese mes) o del total de egresos
// (si dio negativo) — ingresos y egresos se suman POR SEPARADO, sumarlos
// juntos no tendría sentido (un gasto grande no "compite" por espacio con
// un ingreso, son dos bolsas distintas). Mismo color que la columna del
// importe: verde si es ingreso, rojo si es egreso — reusa las clases
// valor-positivo/valor-negativo/valor-cero que ya existen (mismo criterio
// que celdaImporte), así que no hace falta CSS nuevo. No lleva el
// circulito del semáforo ni el botón "i": es un porcentaje derivado del
// total de al lado, no un total en sí mismo con su propio detalle.
function celdaProporcion(v, totalIngreso, totalEgreso) {
  if (!v) return `<td class="valor-cero">–</td>`;
  if (v > 0) {
    const pct = totalIngreso > 0 ? (v / totalIngreso) * 100 : 0;
    return `<td class="valor-positivo">${pct.toFixed(1)}%</td>`;
  }
  const pct = totalEgreso > 0 ? (-v / totalEgreso) * 100 : 0;
  return `<td class="valor-negativo">${pct.toFixed(1)}%</td>`;
}

// La fila "Total" no muestra proporción (queda en blanco): ese número es
// ingresos MENOS egresos ya mezclados, así que no hay un "total de qué"
// único contra el que compararlo — no sería ni el total de ingresos ni el
// de egresos, sería otra cosa.
function celdaProporcionVacia() {
  return `<td class="valor-cero">–</td>`;
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

// Se exporta para que js/flujo-caja.js registre el detalle de sus propias
// tarjetas en SU propia lista (detallesFijoVariable, con prefijo "fijovar"),
// con el mismo mecanismo que usan reporte/histórico acá.
export function registrarDetalle(registro, prefijo, titulo, grupos) {
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

// Se exporta para que js/flujo-caja.js abra el mismo popup compartido
// (#detalleOverlay) con el detalle de sus propias tarjetas.
export function mostrarDetalle(d) {
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

  // Total de ingresos y de egresos del mes, sumados aparte, para la
  // columna "Proporción" de cada fila (ver celdaProporcion). Sale de
  // "totales", que ya tiene el total en euros de cada concepto.
  let totalIngresoEuros = 0;
  let totalEgresoEuros = 0;
  Object.values(totales).forEach(v => {
    if (v > 0) totalIngresoEuros += v;
    else if (v < 0) totalEgresoEuros += -v;
  });

  let total = 0;
  let totalIncompleto = false;
  const movsPorMonedaTotal = {};
  let html = `<div class="pivot-wrap"><table class="pivot distrib-pivot"><tr><th>Concepto</th><th>Total (€)</th><th class="col-promedio">Promedio (€)</th><th>Proporción (€)</th></tr>`;
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
      celdaProporcion(v, totalIngresoEuros, totalEgresoEuros) +
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
    celdaProporcionVacia() +
    `</tr>`;
  html += `</table></div>`;
  html += `<p class="tipo-cambio-nota">Convertido a euros con los tipos de cambio de Configuración &gt; Tipo de cambio, para este mismo mes. ⚠ = falta cargar el tipo de cambio de alguna moneda ese mes, ese total está incompleto. Tocá el botón "i" de cada celda para ver el detalle.</p>`;

  cont.innerHTML = html;
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

  // Total de ingresos y de egresos de cada moneda, sumados aparte, para la
  // columna "Proporción" de cada fila (ver celdaProporcion): cada concepto
  // se compara contra el total de su propio signo en esa moneda, no contra
  // la suma de todo junto. Sale de porConceptoMoneda, que ya tiene el total
  // de cada concepto en cada moneda.
  const totalIngresoPorMoneda = {};
  const totalEgresoPorMoneda = {};
  listaMonedaIds.forEach(monedaId => {
    let ingreso = 0, egreso = 0;
    Object.values(porConceptoMoneda).forEach(fila => {
      const v = fila[monedaId] || 0;
      if (v > 0) ingreso += v;
      else if (v < 0) egreso += -v;
    });
    totalIngresoPorMoneda[monedaId] = ingreso;
    totalEgresoPorMoneda[monedaId] = egreso;
  });

  // El promedio histórico de cada concepto en cada moneda, sin contar este
  // mes. Acá no se convierte nada: cada moneda se promedia con la suya, que
  // es lo mismo que hace el resto de esta tabla.
  const { porMoneda } = historicoPorConcepto(mes);

  let html = `<div class="pivot-wrap"><table class="pivot distrib-pivot"><tr><th>Concepto</th>` +
    listaMonedaIds.map(id =>
      `<th>${nombreMoneda(id)}</th><th class="col-promedio">Prom. ${nombreMoneda(id)}</th><th>% ${nombreMoneda(id)}</th>`
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
          celdaPromedio(promedio, false) +
          celdaProporcion(v, totalIngresoPorMoneda[monedaId], totalEgresoPorMoneda[monedaId]);
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
        celdaPromedio(promedio, false) +
        celdaProporcionVacia();
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
  escribirMesSeleccionado("distrib", state.distribucion.mes);
  const selOrden = document.getElementById("distribOrdenHistorico");
  if (selOrden) selOrden.value = state.distribucion.ordenHistorico;
  const chkEuros = document.getElementById("distribConvertirEuros");
  if (chkEuros) chkEuros.checked = state.distribucion.convertirEuros;
  renderCheckboxesConceptos();
  renderCheckboxesMonedas();
  renderReporte();
  renderHistorico();
  // Flujo de caja (js/flujo-caja.js) se renderiza aparte: data-service.js
  // llama a renderFlujoCaja() directamente, no acá — mismo criterio que ya
  // se usaba con renderEvolucion(), cada pestaña se re-renderiza desde su
  // propio archivo en vez de anidarla adentro de otra.
}

export function setupDistribucion() {
  poblarSelectMes("distrib");
  poblarSelectAnio("distrib");
  ["MesNombre", "Anio"].forEach(sufijo => {
    document.getElementById("distrib" + sufijo).addEventListener("change", () => {
      state.distribucion.mes = leerMesSeleccionado("distrib");
      renderReporte();
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
  // engancharles un listener uno por uno cada vez). Flujo de caja tiene su
  // propio listener igual a este en js/flujo-caja.js, para el prefijo
  // "fijovar" — cada uno ignora los data-detalle que no son suyos, así que
  // los dos conviven sin pisarse.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-detalle]");
    if (!btn) return;
    const [prefijo, idTexto] = btn.dataset.detalle.split(":");
    if (prefijo !== "historico" && prefijo !== "reporte") return;
    const fuente = prefijo === "historico" ? detallesHistorico : detallesReporte;
    const d = fuente[Number(idTexto)];
    if (d) mostrarDetalle(d);
  });

  document.getElementById("detalleClose").addEventListener("click", () => {
    document.getElementById("detalleOverlay").classList.remove("open");
  });
}
