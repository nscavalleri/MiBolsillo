// Selector de fecha chico y compartido por los dos campos "Fecha" de la
// app (Agregar/Editar movimiento en js/modal.js, y Cambio de moneda en
// js/cambio-moneda.js): usa flatpickr en vez del <input type="date">
// nativo del navegador, a pedido de Nadia.
//
// Por qué: el <input type="date"> nativo le mostraba los dígitos en
// mm/dd/aaaa en vez de dd/mm/aaaa, a pesar de que index.html ya tiene
// <html lang="es">. Ese orden de los dígitos lo decide el idioma del
// NAVEGADOR (no el de la página ni su atributo lang) — no hay forma
// estándar de forzarlo solo con HTML/CSS. flatpickr sí permite fijar el
// formato de visualización sin depender de eso.
//
// Cómo funciona: flatpickr se engancha al <input> ORIGINAL (el de
// index.html, id="fecha"/"cambioFecha"), lo oculta (type="hidden") y
// mantiene su valor en dateFormat ("Y-m-d") — el mismo "YYYY-MM-DD" que
// ya devolvía el <input type="date"> nativo por `.value` — así el resto
// del código que lee/escribe document.getElementById(id).value (el
// payload que se manda a Supabase) NO CAMBIA NADA. Para lo que Nadia ve y
// tipea, flatpickr crea un <input> NUEVO al lado (el "altInput"), en
// altFormat ("d/m/Y"). Ese campo visible no tiene id propio por defecto,
// así que acá se le pone uno (id + "Visible") y se lo marca "required" a
// mano: un <input type="hidden"> nunca participa de la validación nativa
// del formulario, así que el "required" del original dejaría de hacer
// algo si no se repite en el visible. Los <label for="..."> de
// index.html apuntan a ese id + "Visible" (no al original), para que
// tocar la etiqueta siga enfocando el campo que se ve en pantalla.
export function initFechaPicker(id) {
  const el = document.getElementById(id);
  if (!el || !window.flatpickr) return null;
  const fp = window.flatpickr(el, {
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d/m/Y",
    allowInput: true,
  });
  if (fp.altInput) {
    fp.altInput.id = id + "Visible";
    if (el.required) fp.altInput.required = true;
  }
  return fp;
}

// Fecha de hoy en "YYYY-MM-DD" (mismo formato que ya devolvía
// input.valueAsDate = new Date() del <input type="date"> nativo, para el
// caso de respaldo si flatpickr no llegó a cargar — ver initFechaPicker).
export function fechaHoyISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
