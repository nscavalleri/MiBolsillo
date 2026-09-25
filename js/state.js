// Estado compartido de la aplicación. Es un solo objeto mutable para que
// cualquier módulo pueda leer y modificar sus propiedades sin tener que
// reasignar el import (los módulos ES no permiten reasignar un binding
// importado, pero sí modificar las propiedades de un objeto importado).

export const state = {
  conceptos: [],
  monedas: [],
  origenes: [],
  movimientos: [],
  tipoActual: "egreso",
  editandoId: null,
  filtros: { texto: "", mes: "", tipo: "", concepto: "", origen: "", moneda: "" },
  // Gastos > Movimientos: paginación de la lista. "porPagina" (10, 50 o
  // 100) arranca en 10 acá, pero cargarTodo() lo pisa enseguida con lo
  // último guardado en la tabla configuracion_general (clave
  // "movimientos_por_pagina"), así se recuerda sin importar desde qué
  // navegador o dispositivo entres. "pagina" en cambio es solo de esta
  // visita: arranca siempre en la primera y vuelve a la 1 cada vez que se
  // toca un filtro o se cambia cuántos movimientos se muestran.
  paginacion: { porPagina: 10, pagina: 1 },
  // Estado de los tildes de conciliación en curso (todavía no cerrado con
  // "Conciliar mes"). Clave "origen::moneda" -> true/false. Se guarda en la
  // tabla conciliacion_checks para no perderlo si se recarga la página o se
  // sigue tildando otro día dentro del mismo mes.
  conciliacionChecks: {},
  // Dashboard > Distribución. "mes" (para Mensual) se completa con el mes
  // actual la primera vez que se renderiza. "ordenHistorico" es el orden de
  // las filas en Histórica ("asc" = más antiguo primero, por defecto;
  // "desc" = más reciente primero); no se guarda entre sesiones, se elige
  // cada vez que se entra. Qué conceptos y monedas se incluyen en los
  // reportes no se guarda acá: son las columnas *.incluir_en_distribucion
  // (así se recuerdan entre sesiones, igual que "activo").
  // "convertirEuros" (tildar "Convertir todo a Euros" en Monedas a incluir)
  // arranca en false acá, pero cargarTodo() lo pisa enseguida con lo último
  // guardado en la tabla configuracion_general (ver state.configuracionGeneral
  // más abajo), así se recuerda sin importar desde qué navegador o
  // dispositivo entres. "ordenHistorico" en cambio sí arranca de cero cada
  // vez que se entra.
  distribucion: { mes: "", ordenHistorico: "asc", convertirEuros: false },
  // Dashboard > Flujo de caja: tiene su PROPIO "mes" (no el de Distribución
  // > Mensual), para poder mirar un mes distinto del que está elegido ahí —
  // a propósito, a pedido de Nadia. Se completa con el mes actual la
  // primera vez que se renderiza, igual que distribucion.mes. Desde que
  // Flujo de caja también tiene sus propias sub-pestañas Mensual/Histórica
  // (a pedido de Nadia, espejo de Distribución), "ordenHistorico" es el
  // orden de esa Histórica — independiente de distribucion.ordenHistorico,
  // mismo criterio que ese: no se guarda entre sesiones, arranca en "asc"
  // cada vez que se entra. Qué conceptos entran (incluir_en_flujo_caja) SÍ
  // es compartido entre Mensual y Histórica de acá, a pedido de Nadia —
  // mismo mecanismo que Distribución (una sola lista arriba de las dos).
  flujoCaja: { mes: "", ordenHistorico: "asc" },
  // Configuración > Tipo de cambio: una fila por cada combinación
  // mes-moneda con un valor cargado (tabla tipos_cambio). La usa
  // "Convertir todo a Euros" de Distribución para pasar todo a euros.
  tiposCambio: [],
  // Configuración > Reservas: montos reservados en euros (nombre, cantidad,
  // descripción opcional y activo/inactivo), con su propio ABM (reservas.js).
  reservas: [],
  // Gastos > Asignación: cuánto de cada cuenta está destinado a cada
  // reserva (tabla asignaciones: origen_id, reserva_id, monto en euros).
  // Una fila por combinación cuenta-reserva; las combinaciones sin plata
  // asignada simplemente no tienen fila.
  asignaciones: [],
  // Gastos > Conciliación: el histórico de meses ya cerrados (tabla
  // conciliaciones). Es la foto que quedó guardada de cada cierre: mes,
  // saldo, si estaba tildado y cuándo se guardó. No se usa para calcular
  // nada, solo para mostrar cuándo fue la última vez que se concilió cada
  // combinación de origen y moneda.
  conciliaciones: [],
  // Dashboard > Evolución: la nota libre de cada mes (tabla
  // evolucion_comentarios: mes/comentario). Qué movimientos son
  // "excepcionales" no vive acá: es la columna movimientos.excepcional, así
  // que viaja con cada movimiento.
  evolucionComentarios: [],
  // Preferencias generales de la app, guardadas en Supabase (tabla
  // configuracion_general: clave/valor) en vez del navegador, para que se
  // recuerden sin importar desde dónde entres. Por ahora tiene
  // "convertir_euros" ("true"/"false", como texto: la tabla es genérica
  // para poder sumar otras preferencias más adelante sin tener que agregar
  // columnas nuevas) y "movimientos_por_pagina" ("10" / "50" / "100",
  // también como texto), pero data-service.js guarda todas las filas acá tal
  // cual vienen, así que cualquier módulo puede leer otras claves futuras.
  configuracionGeneral: {},
};
