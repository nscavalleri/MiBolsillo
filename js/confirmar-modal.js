// Cuadro de "¿estás de acuerdo?" con el formato de la app, para reemplazar
// al confirm() gris del navegador cuando hace falta explicar un poco más que
// una línea. Reutiliza el mismo .modal-overlay / .modal-box que los demás
// modales, así se ve igual que el resto (centrado, esquinas redondeadas).
//
// Se usa con await, porque a diferencia del confirm() del navegador esto no
// frena el hilo: la respuesta llega cuando la persona toca un botón.
//
//   if (!await pedirConfirmacion({ titulo: "...", lineas: ["..."] })) return;
//
// Los listeners se enganchan la primera vez que se abre, no al arrancar la
// app, así este archivo no necesita un setup() en main.js.

let resolverActual = null;

function cerrar(respuesta) {
  document.getElementById("confirmarOverlay").classList.remove("open");
  document.removeEventListener("keydown", alPresionarTecla);
  if (resolverActual) {
    const resolver = resolverActual;
    resolverActual = null;
    resolver(respuesta);
  }
}

function alPresionarTecla(e) {
  if (e.key === "Escape") cerrar(false);
}

function engancharBotones() {
  const overlay = document.getElementById("confirmarOverlay");
  if (overlay.dataset.listo) return;
  overlay.dataset.listo = "1";

  document.getElementById("confirmarSi").addEventListener("click", () => cerrar(true));
  document.getElementById("confirmarNo").addEventListener("click", () => cerrar(false));
  document.getElementById("confirmarClose").addEventListener("click", () => cerrar(false));
  // Tocar el fondo oscuro también cancela, como en cualquier cuadro de
  // diálogo; tocar adentro del cuadro no.
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cerrar(false); });
}

// lineas: los párrafos del cuerpo, en el orden en que se leen.
// resumen (opcional): { etiqueta, antes, despues, alertaDespues } se muestra
// como un renglón aparte del tipo "Ahorro   35.00 € → 25.00 €", que es lo
// que se mira primero para decidir.
export function pedirConfirmacion({ titulo, lineas = [], resumen, textoSi = "Sí, hacelo", textoNo = "No, dejalo como estaba" }) {
  engancharBotones();

  document.getElementById("confirmarTitulo").textContent = titulo || "¿Estás de acuerdo?";
  document.getElementById("confirmarSi").textContent = textoSi;
  document.getElementById("confirmarNo").textContent = textoNo;

  const cuerpo = document.getElementById("confirmarTexto");
  cuerpo.innerHTML =
    lineas.map(linea => `<p class="confirmar-linea">${linea}</p>`).join("") +
    (resumen ? `
      <div class="confirmar-resumen">
        <span class="confirmar-etiqueta">${resumen.etiqueta}</span>
        <span class="confirmar-antes">${resumen.antes}</span>
        <span class="confirmar-flecha">→</span>
        <span class="confirmar-despues ${resumen.alertaDespues ? "asig-rojo" : ""}">${resumen.despues}</span>
      </div>` : "");

  document.getElementById("confirmarOverlay").classList.add("open");
  document.addEventListener("keydown", alPresionarTecla);
  document.getElementById("confirmarSi").focus();

  return new Promise(resolver => { resolverActual = resolver; });
}
