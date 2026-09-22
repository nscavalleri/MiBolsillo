// Punto de entrada de la app: conecta todos los módulos entre sí.

import { initSupabase, getClient } from './config.js';
import { setupAllTabs } from './ui-tabs.js';
import { setupAuth, mostrarSegunSesion } from './auth.js';
import { setupFiltros, setupPaginacion } from './gastos.js';
import { setupAddItemRows } from './configuracion.js';
import { setupModal } from './modal.js';
import { setupConciliacion } from './conciliacion.js';
import { setupDistribucion } from './distribucion.js';
import { setupReservas } from './reservas.js';
import { setupEditarModal } from './editar-modal.js';

setupAllTabs();
setupAuth();
setupFiltros();
setupPaginacion();
setupAddItemRows();
setupModal();
setupConciliacion();
setupDistribucion();
setupReservas();
setupEditarModal();

// Al girar la rueda del mouse (o hacer scroll con el trackpad) sobre un
// campo numérico enfocado, el navegador suma/resta de a uno por cada
// "click" de la rueda — muy fácil de disparar sin querer al scrollear la
// página (por ejemplo en "Cantidad" al cargar un gasto). Se desactiva ese
// comportamiento para cualquier <input type="number"> de toda la app,
// sin afectar el scroll normal de la página cuando el campo no está
// enfocado.
//
// Cancelar el comportamiento del navegador, sin embargo, también cancela el
// scroll: con el cursor adentro de una celda enfocada, la rueda no movía
// nada y parecía que la pantalla se hubiera trabado (se nota sobre todo en
// la tabla de Gastos > Asignación, que es larga y se carga celda por
// celda). Por eso, después de frenar el cambio de número, el scroll se
// reenvía a mano: primero al recuadro que tenga scroll propio y todavía
// pueda moverse en ese sentido (la tabla de Asignación), y si no, a la
// página entera.
function contenedorScrollable(elemento, direccion) {
  let actual = elemento.parentElement;
  while (actual && actual !== document.body) {
    const desborda = actual.scrollHeight > actual.clientHeight;
    const overflow = getComputedStyle(actual).overflowY;
    const scrollea = overflow === "auto" || overflow === "scroll";
    if (desborda && scrollea) {
      const puedeBajar = direccion > 0 && actual.scrollTop + actual.clientHeight < actual.scrollHeight - 1;
      const puedeSubir = direccion < 0 && actual.scrollTop > 0;
      if (puedeBajar || puedeSubir) return actual;
    }
    actual = actual.parentElement;
  }
  return null;
}

document.addEventListener("wheel", (e) => {
  if (e.target.tagName === "INPUT" && e.target.type === "number" && document.activeElement === e.target) {
    e.preventDefault();
    const contenedor = contenedorScrollable(e.target, e.deltaY);
    if (contenedor) contenedor.scrollTop += e.deltaY;
    else window.scrollBy(0, e.deltaY);
  }
}, { passive: false });

if (initSupabase()) {
  getClient().auth.onAuthStateChange(() => mostrarSegunSesion());
  mostrarSegunSesion();
}
