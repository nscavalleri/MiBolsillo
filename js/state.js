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
  // Dashboard > Distribución > Mensual. "mes" se completa con el mes actual
  // la primera vez que se renderiza. Qué conceptos se incluyen en el reporte
  // no se guarda acá: es la columna conceptos.incluir_en_distribucion (así
  // se recuerda entre sesiones, igual que "activo").
  distribucion: { mes: "" },
};
