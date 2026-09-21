// Configuración de conexión con Supabase y creación del cliente.
// Los valores se encuentran en Supabase > tu proyecto > Settings > API.

export const SUPABASE_URL = "https://tprnfkuuawfirwsmwjzg.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwcm5ma3V1YXdmaXJ3c213anpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MjMxMjMsImV4cCI6MjEwNTI5OTEyM30.Ufz3J0EqaDR8ioe5tSv2qSK4f62h5bvc2eSFcJbDgUc";

let client = null;

// Crea el cliente de Supabase una sola vez. Devuelve null si faltan las
// credenciales (y muestra el aviso en pantalla).
export function initSupabase() {
  if (!SUPABASE_URL.startsWith("http") || SUPABASE_ANON_KEY.startsWith("PEGA_AQUI")) {
    document.getElementById("configWarning").style.display = "block";
    return null;
  }
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

// El resto de los módulos siempre acceden al cliente a través de esta
// función, así todos ven la misma instancia una vez inicializada.
export function getClient() {
  return client;
}
