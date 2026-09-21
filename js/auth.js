// Login / logout y qué vista mostrar según haya o no una sesión activa.

import { getClient } from './config.js';
import { cargarTodo } from './data-service.js';

export async function mostrarSegunSesion() {
  const { data: { session } } = await getClient().auth.getSession();
  if (session) {
    document.getElementById("loginView").style.display = "none";
    document.getElementById("appView").style.display = "block";
    await cargarTodo();
  } else {
    document.getElementById("loginView").style.display = "block";
    document.getElementById("appView").style.display = "none";
  }
}

export function setupAuth() {
  document.getElementById("btnLogin").addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const errEl = document.getElementById("loginError");
    errEl.style.display = "none";
    const { error } = await getClient().auth.signInWithPassword({ email, password });
    if (error) {
      errEl.textContent = "No se pudo iniciar sesión: " + error.message;
      errEl.style.display = "block";
      return;
    }
    await mostrarSegunSesion();
  });

  document.getElementById("btnLogout").addEventListener("click", async () => {
    await getClient().auth.signOut();
    await mostrarSegunSesion();
  });
}
