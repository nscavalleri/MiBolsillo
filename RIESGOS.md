# Riesgos y límites de Mi Bolsillo

Última revisión: **24 de septiembre de 2026**

Este archivo junta lo que puede salir mal a medida que la app crece, con
números medidos (no estimados) y qué hacer en cada caso. La idea es no tener
que volver a investigarlo desde cero, y que cualquiera que agarre el proyecto
—persona o IA— sepa dónde están los bordes antes de tocar algo.

Cada riesgo tiene: **qué es**, **cómo se nota**, **dónde estamos hoy** y **qué
hacer**.

---

## Resumen en una tabla

| Riesgo | Gravedad | Estado hoy |
|---|---|---|
| Tope de filas de la API | **Alto** (rompe callado) | Mitigado: se subió a 50.000 |
| Quién puede entrar a la app | **Alto** (es plata propia) | Verificado el 24/09/2026 — falta confirmar el registro abierto |
| Permisos de las tablas nuevas (cambio del 30/10/2026) | Medio | Pendiente: cambia cómo se escriben los SQL |
| La app recarga todo después de cada guardado | Medio | Sin resolver, no molesta todavía |
| Egress del plan gratuito | Bajo | 0,2% usado |
| Pausa del proyecto por inactividad | Bajo | No aplica mientras se use |
| Peso de la base | Muy bajo | 2,4% usado |
| Filas duplicadas en `conciliaciones` | Muy bajo | Decidido dejarlo así |

---

## Dónde estamos hoy (medido el 23/09/2026)

| Tabla | Filas |
|---|---|
| `movimientos` | 49 |
| `asignaciones` | 29 |
| `conciliaciones` | 23 |
| `conceptos` | 33 |
| `origenes` | 21 |
| `reservas` | 21 |
| `monedas` | 4 |
| `tipos_cambio` | 3 |
| `evolucion_comentarios` | 1 |
| `conciliacion_checks` | 0 |

**Peso total de la base: 12 MB** de los 500 MB del plan gratuito.

Ojo con ese número: si se suma el peso de todas las tablas da **menos de
1 MB**. Los otros ~11 MB son la maquinaria interna de Supabase y de Postgres,
que viene con cualquier proyecto aunque esté vacío. Los datos propios, hoy, no
pesan prácticamente nada.

---

## Riesgo 1 — El tope de filas de la API ⚠ el más importante

### Qué es

Supabase corta **cualquier** consulta a la API en una cantidad máxima de
filas. El valor por defecto es **1.000**.

Mi Bolsillo se trae las tablas **enteras** en cada carga (`cargarTodo()` en
`js/data-service.js` pide las 11 tablas sin filtros ni paginación). Así que el
día que una tabla pase el tope, la app va a recibir solo las primeras filas y
el resto **no va a existir** para ella.

### Cómo se nota

**Este es el riesgo grave, porque no da ningún error.** La app no se rompe ni
avisa nada: simplemente los saldos, los reportes y la conciliación empiezan a
estar mal, calculados sobre datos incompletos. Se descubre por casualidad,
cuando un número no cierra.

Síntomas posibles, según qué tabla llegue primero al tope:

- `movimientos`: saldos, Snapshot, Distribución, Evolución y Conciliación
  quedan todos cortos.
- `conciliaciones`: los tooltips de "última vez conciliado" empiezan a mostrar
  fechas viejas, o "todavía no conciliaste" en cuentas que sí se conciliaron.

### Dónde estamos

`movimientos` tiene 49 filas. Al ritmo estimado de unos 8 movimientos por día
se llegaría a 1.000 en unos 4 meses, pero el acumulado real va bastante más
lento.

### Qué se hizo

**El 23/09/2026 se subió el tope de 1.000 a 50.000** desde el panel de
Supabase, en `Project Settings > API` (en el panel nuevo puede aparecer como
**Data API**). El link directo, con el ID de este proyecto:

```
https://supabase.com/dashboard/project/tprnfkuuawfirwsmwjzg/settings/api
```

El máximo que permite Supabase es 1.000.000; para más hay que hablar con
soporte.

⚠ **Ese cambio no está verificado y no se puede verificar hoy**, porque no hay
1.000 filas con las cuales probarlo. Hay reportes públicos de gente a la que
ese ajuste no le tomó efecto y siguió cortando en 1.000 igual. Cuando
`movimientos` pase las 1.000 filas, **hay que comprobar explícitamente** que
la app las esté viendo todas (comparar el `count(*)` de la base contra
`state.movimientos.length` en la consola del navegador).

### Qué queda pendiente (la solución de verdad)

Subir el tope es un parche que depende de una configuración del panel. La
solución que no depende de nada es **paginar en el código**: que
`cargarTodo()` pida los datos de a tandas (filas 0-999, después 1000-1999, y
así) hasta que no venga nada más, usando `.range()`. Eso funciona sin importar
cómo esté configurado el tope y se puede probar antes de subirlo.

**No es urgente con 49 filas, pero es lo que hay que hacer antes de llegar a
las 1.000.**

---

## Riesgo 2 — La app se baja todo de nuevo después de cada guardado

### Qué es

El patrón de la app, elegido a propósito por simplicidad, es que **casi toda
escritura termina con `await cargarTodo()`**, que vuelve a bajar las 11 tablas
completas. Es lo que mantiene el código simple y predecible, y está bien para
el tamaño actual.

Hay dos excepciones ya implementadas, que sirven de modelo si alguna vez hay
que extender el patrón:

- `guardarCelda()` en `js/asignacion.js` (actualiza `state.asignaciones` en
  memoria, para no perder el foco mientras se escribe).
- El tilde de Conciliación en `js/conciliacion.js`.

### Cómo se nota

En cada guardado se baja de nuevo toda la base. Con pocos datos es
imperceptible; el día que moleste, se va a notar como una demora después de
guardar, sobre todo en el celular con señal mala.

### Dónde estamos

Con 49 movimientos, cada carga completa pesa unos **13 KB**. No se nota.

### Qué hacer

Nada por ahora. Es la palanca más grande para bajar el egress si algún día
hace falta (ver Riesgo 3).

---

## Riesgo 3 — El egress del plan gratuito

### Qué es

El plan gratuito permite **5 GB de egress por mes** (datos que bajan del
servidor). Como la app se baja todo en cada carga, el egress crece con el
tamaño de la base **y** con la cantidad de cargas. No crece en línea recta:
cuanto más grande la base, más pesa cada carga.

### La fórmula

```
egress del mes = (movimientos que hay) × 210 bytes × 1,3 × (cargas por día) × 30
```

- **210 bytes** es lo que pesa un movimiento en JSON. Medido: 200 con
  descripción corta, 227 con una normal, 266 con una larga.
- **× 1,3** es el resto de las tablas que también se bajan.
- **cargas por día**: cada guardado dispara una, más cada vez que se abre la
  app.

### La proyección (con 8 movimientos por día)

| | movimientos | peso de 1 carga | egress/mes con 2 cargas/día | con 12 cargas/día |
|---|---|---|---|---|
| mes 4 | 960 | 0,25 MB | 15 MB | 90 MB |
| mes 12 | 2.880 | 0,75 MB | 45 MB | 270 MB |
| año 2 | 5.760 | 1,5 MB | 90 MB | 540 MB |
| año 5 | 14.400 | 3,75 MB | 225 MB | 1,3 GB |
| año 10 | 28.800 | 7,5 MB | 450 MB | 2,7 GB |

Se llega a los 5 GB mensuales recién **en el año 19**, y eso con el escenario
feo de 12 cargas por día. Con 2 cargas por día, nunca.

Además estas cuentas son el techo pesimista: los datos casi seguro viajan
comprimidos, así que lo real es bastante menos.

### Dónde estamos

~12 MB por mes en el peor caso. **0,2% del límite.**

### Alternativas para bajarlo, si algún día hace falta

Ordenadas por cuánto rinden contra cuánto cuestan:

1. **No recargar todo después de cada guardado.** La palanca más grande y la
   más barata: se pasaría de ~10 cargas por día a 1 o 2, o sea dividir el
   egress por cinco. El patrón ya está probado en dos lugares (ver Riesgo 2).
2. **Pedir solo las columnas que se usan** en vez de `select("*")`. Rinde poco
   (10-15%) y cuesta poco.
3. **No traer los movimientos viejos** — solo los últimos 12 o 18 meses, y el
   resto ya resumido. Es la única que corta el crecimiento de raíz: el peso de
   cada carga pasa a ser constante en vez de crecer para siempre. Cuesta más,
   porque Evolución e Histórica necesitan toda la historia y habría que darles
   los números ya sumados.
4. **Calcular en la base de datos** (una vista o función SQL) y bajarse solo el
   resultado. Es lo máximo que se puede hacer, y también el cambio más grande.

**Criterio sugerido:** hacer la 1 el día que abrir la app en el celular
moleste, no antes.

---

## Riesgo 4 — El proyecto se pausa por inactividad

### Qué es

En el plan gratuito, **los proyectos con poca actividad en 7 días se pausan**
para ahorrar recursos.

Es **por proyecto, no por cuenta**. La documentación lo plantea a nivel
proyecto y no aclara el caso de dos proyectos en la misma cuenta, así que lo
prudente es asumir que **usar uno no salva al otro**.

### Cómo se nota

La app deja de responder: no carga nada y da errores de conexión.

### Qué hacer

No se pierde ningún dato. Se entra al panel de Supabase y se despausa a mano.

Mientras la app se use al menos una vez por semana, no pasa. El caso típico
que sorprende es volver de un viaje largo.

---

## Riesgo 5 — El peso de la base

### Qué es

El plan gratuito da **500 MB**.

### Dónde estamos

12 MB, de los cuales menos de 1 MB son datos propios. **2,4% del límite**, y
creciendo a un ritmo irrelevante: 20.000 movimientos ocuparían unos pocos MB.

### Qué hacer

Nada. Este límite no se va a alcanzar nunca con este uso.

---

## Riesgo 6 — `conciliaciones` acumula filas duplicadas

### Qué es

"Conciliar mes" hace siempre `insert`, nunca `update`. Cada cierre guarda una
foto completa: una fila por cada origen+moneda con saldo, esté tildada o no.
**Cerrar el mismo mes dos veces deja dos juegos completos de filas.**

Con 21 orígenes, cada cierre escribe ~21 filas. Un año de cierres mensuales son
unas 250 filas.

### Por qué está bien así (y por qué NO hay que "arreglarlo")

Ya está analizado y decidido: se deja como está. El detalle completo está en
`Claude outputs/CONTEXTO-PARA-OTRA-IA.md`, pero lo esencial:

⚠ **Cambiarlo por un `upsert`, o borrar las filas del mes antes de insertar,
suena más prolijo y rompe la app.** El tooltip de "última vez conciliado" solo
mira las filas con `conciliado = true`. Si un segundo cierre pisara al primero,
una cuenta tildada en el primer cierre y no en el segundo pasaría de `true` a
`false`, y volvería a decir "todavía no conciliaste esta cuenta" para algo que
sí se concilió.

Si alguna vez se quiere de verdad una fila por mes+origen+moneda, hay que
agregar la lógica de **no degradar** (nunca pasar de tildado a no tildado); no
alcanza con un `onConflict`.

### Otro detalle

`creado_en` **lo llena la base con su DEFAULT; la app nunca lo manda.** Si ese
default faltara, el tooltip mostraría un guion en vez de la fecha.

---

## Riesgo 7 — Quién puede entrar a la app ⚠ el otro importante

### Qué es

La app está publicada en GitHub Pages, así que **la clave de Supabase que usa
está a la vista de cualquiera** en `js/config.js`. Eso es normal y está bien
diseñado así: esa clave (la "anon key") es **pública por diseño**, no es una
contraseña. Identifica al proyecto, no autoriza nada por sí sola. Cualquier
app que corra en un navegador tiene que llevar algo así, y no hay forma de
esconderlo: lo que el JavaScript puede leer, la persona también.

Lo que **nunca** puede estar en el código, porque esas sí se saltean todo:

- la **service_role key**
- la **contraseña de la base de datos**

Lo que realmente protege los datos son tres capas: el login, los permisos
(grants) y RLS.

### Cómo está hoy (verificado el 24/09/2026)

Las tres capas están bien:

| Capa | Estado |
|---|---|
| RLS | Prendido en **las 12 tablas** |
| Políticas | 1 por tabla (menos `tipo_concepto`, ver abajo) |
| Grant a `anon` | **Sin SELECT** — solo REFERENCES, TRIGGER, TRUNCATE |
| Grant a `authenticated` | SELECT, INSERT, UPDATE, DELETE |
| Grant a `service_role` | Sin SELECT |

Que `anon` **no tenga SELECT** es mejor que el default de Supabase: aunque
alguien use la clave pública sin estar logueado, no puede leer nada ni
llegando a RLS. Son dos candados en serie, no uno.

Tres observaciones, ninguna urgente:

- **`anon` tiene TRUNCATE.** Suena feo pero no es explotable: la Data API no
  expone TRUNCATE, y para ejecutarlo por conexión directa haría falta la
  contraseña de la base, no la clave pública. Es un resto del `GRANT ALL`
  original al que después se le revocaron las operaciones que importaban. Se
  puede limpiar por prolijidad, no por seguridad.
- **`service_role` no tiene SELECT.** Hoy no importa porque la app no lo usa
  (las apps de navegador usan la anon key). Importaría el día que se agregue
  algo del lado del servidor.
- **`tipo_concepto` tiene RLS prendido y 0 políticas**, o sea que está
  cerrada a todo el mundo. **No es un error**: la app no la lee (no está en
  `cargarTodo()`), es solo una tabla de referencia. ⚠ Pero si algún día se la
  quiere leer desde la app, va a devolver **cero filas sin dar ningún error**
  —RLS sin políticas no falla, simplemente no devuelve nada— y se va a ver
  como si estuviera vacía. Ahí hay que agregarle su política.

### El riesgo que queda

La política de todas las tablas es `for all to authenticated using (true)`:
**cualquier usuario autenticado ve y edita todo**. Eso está bien mientras la
única usuaria sea Nadia.

⚠ **Pero si el registro de usuarios nuevos está abierto en Supabase, cualquiera
puede crearse una cuenta y leer toda la información financiera.** Esa es la
puerta real, mucho más que la clave visible en el código.

### Qué hacer

**1. Ver cuántos usuarios hay:**

```sql
select count(*) as usuarios from auth.users;
```

Si da más de 1, alguien más se registró y hay que investigarlo.

**2. Cerrar el registro.** En el panel de Supabase, en la sección de
Authentication, está la opción **"Allow new users to sign up"**. Apagarla
**no afecta a los usuarios que ya existen**: Nadia sigue entrando igual, pero
nadie más puede crearse una cuenta.

```
https://supabase.com/dashboard/project/tprnfkuuawfirwsmwjzg/auth
```

**3. (Opcional, cinturón y tiradores.)** Se pueden cambiar las políticas para
que además exijan que sea *esa* persona y no cualquiera autenticada:

```sql
-- Ejemplo para una tabla; habría que repetirlo en las 11.
drop policy if exists "acceso autenticado" on public.movimientos;
create policy "acceso autenticado" on public.movimientos
  for all to authenticated
  using      ((auth.jwt() ->> 'email') = 'nadiascavalleri@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'nadiascavalleri@gmail.com');
```

Es la protección más fuerte, pero deja el mail escrito en la base: el día que
se quiera compartir la app con otra persona hay que tocar las 11 políticas.
Con el registro cerrado alcanza para el uso actual.

---

## Riesgo 8 — Las tablas nuevas necesitan permisos explícitos (desde el 30/10/2026)

### Qué es

Supabase avisó por mail que **el 30 de octubre de 2026** deja de dar acceso
automático a la Data API para las tablas nuevas del esquema `public`.

- **Las tablas que ya existen no se tocan.** Siguen funcionando igual, sin
  hacer nada.
- **Toda tabla nueva** necesita un `GRANT` explícito o la API no la ve,
  *da igual cómo se haya creado* (SQL Editor, Table Editor del panel,
  migración, proyecto nuevo).

### Cómo se nota

Bien fuerte, por suerte: la API devuelve `permission denied for table X` y
`cargarTodo()` lo muestra en el cartel rojo de arriba de la pantalla. Nada que
ver con el tope de filas del Riesgo 1, que falla en silencio.

### Qué hacer

**Desde ahora, todo SQL que cree una tabla tiene que traer los tres bloques
juntos.** Esta es la plantilla de este proyecto:

```sql
-- 1) La tabla
create table public.NOMBRE_TABLA (
  -- columnas
);

-- 2) Permisos de la Data API (obligatorio desde el 30/10/2026)
grant select, insert, update, delete on public.NOMBRE_TABLA to authenticated;
grant select, insert, update, delete on public.NOMBRE_TABLA to service_role;

-- 3) RLS y la política de siempre de esta app
alter table public.NOMBRE_TABLA enable row level security;
create policy "acceso autenticado" on public.NOMBRE_TABLA
  for all to authenticated using (true) with check (true);
```

⚠ **No copiar el `grant select ... to anon` que trae el mail de Supabase.**
Esta app requiere login, así que `anon` no necesita leer nada — y hoy
justamente no tiene SELECT en ninguna tabla, que es parte de lo que la
protege (ver Riesgo 7).

Nota: si algún `insert` llegara a fallar con un error de permisos que menciona
una *sequence*, hay que agregar
`grant usage on sequence public.NOMBRE_SEQ to authenticated;`. No pasa con
columnas `identity`, solo con `serial`.

---

## Lo que NO es un riesgo

**La velocidad de la app.** Se midió cuánto tarda cada pantalla en dibujarse
con **20.000 movimientos**:

| Pantalla | Tiempo |
|---|---|
| Dashboard > Evolución | 126 ms |
| Dashboard > Distribución | 61 ms |
| Gastos > Conciliación | 6 ms |
| Gastos > Asignación | 8 ms |
| Gastos > Movimientos | 1 ms |

Imperceptible. El JavaScript no es el cuello de botella ni de cerca, así que
no tiene sentido optimizarlo. Lo que pesa es **bajar** los datos, no
procesarlos.

---

## Límites del plan gratuito (referencia)

| | Free |
|---|---|
| Base de datos | 500 MB |
| Egress | 5 GB / mes |
| Almacenamiento de archivos | 1 GB |
| Usuarios activos por mes | 50.000 |
| Proyectos activos | 2 |
| Inactividad | se pausa a la semana |
| Tope de filas por consulta | 1.000 por defecto, hasta 1.000.000 |

---

## Cómo medir todo esto

Pegar en el **SQL Editor** de Supabase. Son consultas de solo lectura, no
tocan nada.

**Peso total de la base:**

```sql
select pg_size_pretty(pg_database_size(current_database())) as peso_total;
```

**Filas y peso de cada tabla propia** (el `where` deja afuera las tablas
internas de Supabase, como `refresh_tokens` o `schema_migrations`):

```sql
select
  relname                                        as tabla,
  n_live_tup                                     as filas,
  pg_size_pretty(pg_total_relation_size(relid))  as peso
from pg_stat_user_tables
where schemaname = 'public'
order by n_live_tup desc;
```

`n_live_tup` es una estimación. Para el número exacto de las tablas que crecen:

```sql
select 'movimientos'         as tabla, count(*) as filas from movimientos
union all select 'conciliaciones',        count(*) from conciliaciones
union all select 'conciliacion_checks',   count(*) from conciliacion_checks
union all select 'asignaciones',          count(*) from asignaciones
union all select 'tipos_cambio',          count(*) from tipos_cambio
union all select 'evolucion_comentarios', count(*) from evolucion_comentarios
order by 2 desc;
```

El egress consumido en el mes **no sale por SQL**: se ve en el panel de
Supabase, en la sección de uso del proyecto (`Settings > Usage`).

---

## Cuándo volver a mirar esto

| Señal | Qué hacer |
|---|---|
| **Antes del 30/10/2026** | Confirmar que el registro de usuarios está cerrado (Riesgo 7) y adoptar la plantilla de `CREATE TABLE` con grants (Riesgo 8) |
| Se crea **cualquier tabla nueva** | Usar la plantilla completa del Riesgo 8: tabla + grants + RLS + política |
| `select count(*) from auth.users` da más de **1** | Investigar quién se registró (Riesgo 7) |
| `movimientos` pasa de **800** | Implementar la paginación con `.range()` (Riesgo 1) y verificar que la app vea todas las filas |
| La app tarda al guardar en el celular | Dejar de recargar todo en cada guardado (Riesgo 3, alternativa 1) |
| El egress del mes pasa de **1 GB** | Revisar las alternativas 2 y 3 del Riesgo 3 |
| La app deja de responder tras varios días sin usarla | Despausar el proyecto en el panel (Riesgo 4) |
| Se cierra el mismo mes muchas veces | Solo revisar que `conciliaciones` no se desmadre; no "arreglar" el duplicado (Riesgo 6) |
