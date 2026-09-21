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
  filtros: { mes: "", tipo: "", concepto: "", origen: "", moneda: "" },
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
  // tampoco se guarda entre sesiones, igual que "ordenHistorico": arranca
  // destildado cada vez que se entra.
  distribucion: { mes: "", ordenHistorico: "asc", convertirEuros: false },
  // Configuración > Tipo de cambio: una fila por cada combinación
  // mes-moneda con un valor cargado (tabla tipos_cambio). La usa
  // "Convertir todo a Euros" de Distribución para pasar todo a euros.
  tiposCambio: [],
};
