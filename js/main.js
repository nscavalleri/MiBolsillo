// Punto de entrada de la app: conecta todos los módulos entre sí.

import { initSupabase, getClient } from './config.js';
import { setupAllTabs } from './ui-tabs.js';
import { setupAuth, mostrarSegunSesion } from './auth.js';
import { setupFiltros } from './gastos.js';
import { setupAddItemRows } from './configuracion.js';
import { setupModal } from './modal.js';
import { setupConciliacion } from './conciliacion.js';
import { setupDistribucion } from './distribucion.js';
import { setupReservas } from './reservas.js';
import { setupEditarModal } from './editar-modal.js';

setupAllTabs();
setupAuth();
setupFiltros();
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
document.addEventListener("wheel", (e) => {
  if (e.target.tagName === "INPUT" && e.target.type === "number" && document.activeElement === e.target) {
    e.preventDefault();
  }
}, { passive: false });

if (initSupabase()) {
  getClient().auth.onAuthStateChange(() => mostrarSegunSesion());
  mostrarSegunSesion();
}
