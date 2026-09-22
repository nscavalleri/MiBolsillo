// Cartel de "tomá nota de esto" con el formato de la app, para reemplazar al
// cartel gris del navegador (ese que arriba dice "nscavalleri.github.io
// dice"). Reutiliza el mismo .modal-overlay / .modal-box que los demás
// modales, así se ve igual que todo el resto.
//
// Son dos funciones, y lo único que cambia entre una y otra es el título:
//
//   avisar("Conciliación de 2026-09 guardada.")     -> título "Listo"
//   avisarError("No se pudo guardar: " + e.message) -> título en rojo
//
// Las dos devuelven una promesa que se resuelve cuando la persona cierra el
// cartel, por si alguna vez hace falta esperar. Casi ningún lugar lo espera
// (se avisa y se sigue), y está bien así: a diferencia del cartel del
// navegador, esto no frena nada.
//
// Tiene su propio recuadro (#avisoOverlay) y NO comparte el de
// confirmar-modal.js a propósito: hay lugares donde primero se pide una
// confirmación y enseguida se avisa cómo salió, y con un solo recuadro uno
// le pisaría el texto al otro.
//
// Los listeners se enganchan la primera vez que se abre, no al arrancar la
// app, así este archivo no necesita un setup() en main.js.

let resolverActual = null;

function cerrar() {
  document.getElementById("avisoOverlay").classList.remove("open");
  document.removeEventListener("keydown", alPresionarTecla);
  if (resolverActual) {
    const resolver = resolverActual;
    resolverActual = null;
    resolver();
  }
}

function alPresionarTecla(e) {
  if (e.key === "Escape" || e.key === "Enter") cerrar();
}

function engancharBotones() {
  const overlay = document.getElementById("avisoOverlay");
  if (overlay.dataset.listo) return;
  overlay.dataset.listo = "1";

  document.getElementById("avisoOk").addEventListener("click", cerrar);
  document.getElementById("avisoClose").addEventListener("click", cerrar);
  // Tocar el fondo oscuro también cierra, como en cualquier cuadro de
  // diálogo; tocar adentro del cuadro no.
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cerrar(); });
}

// mensaje: un texto, o varios párrafos si se pasa una lista.
function mostrar(mensaje, titulo, esError) {
  engancharBotones();

  const lineas = Array.isArray(mensaje) ? mensaje : [mensaje];
  const tituloEl = document.getElementById("avisoTitulo");
  tituloEl.textContent = titulo;
  tituloEl.classList.toggle("aviso-error", esError);

  // textContent y no innerHTML: estos mensajes suelen traer adentro el texto
  // de un error de la base, que no es nuestro y no tiene por qué
  // interpretarse como HTML.
  const cuerpo = document.getElementById("avisoTexto");
  cuerpo.innerHTML = "";
  lineas.forEach(linea => {
    const p = document.createElement("p");
    p.className = "confirmar-linea";
    p.textContent = linea;
    cuerpo.appendChild(p);
  });

  document.getElementById("avisoOverlay").classList.add("open");
  document.addEventListener("keydown", alPresionarTecla);
  document.getElementById("avisoOk").focus();

  return new Promise(resolver => { resolverActual = resolver; });
}

// Algo salió como se esperaba y solo hace falta dejar constancia.
export function avisar(mensaje, titulo = "Listo") {
  return mostrar(mensaje, titulo, false);
}

// Algo no se pudo hacer. El título va en rojo para que se distinga de un
// aviso común sin tener que leerlo entero.
export function avisarError(mensaje, titulo = "Algo salió mal") {
  return mostrar(mensaje, titulo, true);
}
