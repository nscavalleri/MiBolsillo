// Punto de entrada de la app: conecta todos los módulos entre sí.

import { initSupabase, getClient } from './config.js';
import { setupAllTabs } from './ui-tabs.js';
import { setupAuth, mostrarSegunSesion } from './auth.js';
import { setupFiltros } from './gastos.js';
import { setupAddItemRows } from './configuracion.js';
import { setupModal } from './modal.js';

setupAllTabs();
setupAuth();
setupFiltros();
setupAddItemRows();
setupModal();

if (initSupabase()) {
  getClient().auth.onAuthStateChange(() => mostrarSegunSesion());
  mostrarSegunSesion();
}
