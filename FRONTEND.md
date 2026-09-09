# Guía de integración Frontend — Petrogassa

Este documento explica **qué hace el backend, la lógica de negocio y cómo
consumirlo** desde el frontend. Arranca con la visión general y los flujos, y
después baja al detalle técnico de integración.

- **Contrato exacto de cada endpoint** (parámetros, schemas, respuestas):
  `openapi.yaml` en la raíz, o Swagger en `http://localhost:3100/api/docs`
  (solo fuera de producción).
- Este doc es la **fuente de verdad conceptual**; el openapi es la de detalle.

---

## Índice
1. [Qué es este backend](#1-qué-es-este-backend)
2. [Roles y quién ve qué](#2-roles-y-quién-ve-qué)
3. [Los flujos de negocio](#3-los-flujos-de-negocio)
4. [Convenciones técnicas (leer antes de codear)](#4-convenciones-técnicas-leer-antes-de-codear)
5. [Mapa de endpoints por pantalla](#5-mapa-de-endpoints-por-pantalla)
6. [Páginas que el frontend debe implementar sí o sí](#6-páginas-que-el-frontend-debe-implementar-sí-o-sí)
7. [Detalle de los formularios con archivos (multipart)](#7-detalle-de-los-formularios-con-archivos-multipart)

---

> ⚠️ **POSTULACIONES: AHORA LAS MANEJA GESTIÓN PETROGAS.** El formulario
> "Trabajá con nosotros" **sigue apuntando a las mismas URLs de siempre**, así
> que el frontend no cambia de dirección. Lo que cambió es qué hay detrás: este
> backend ya **no guarda** postulaciones ni CVs, actúa como puente hacia la API
> de Gestión, que es donde RRHH las administra.
>
> Qué implica para el frontend:
> - **Los `id` de puesto ahora son NÚMEROS** (antes UUID). Si los tenías
>   tipados como string, ajustalo.
> - **Los errores de validación los define Gestión** y llegan con el detalle
>   por campo. Ver §7.1.
> - **Desaparecen del panel** las pantallas de Postulaciones y de Puestos: esos
>   datos ya no están de este lado. La de **Títulos académicos se queda**.
>
> Todo lo demás (contenido, novedades, contacto, configuración) sigue igual.

## 1. Qué es este backend

Es la **API de la landing de Petrogas S.A.** Cumple dos funciones:

- **CMS**: casi todo el contenido del sitio es dinámico y se administra desde un
  panel (servicios, certificaciones, clientes, novedades/prensa). El sitio
  público **lee** ese contenido de la API en lugar de tenerlo hardcodeado.
- **RRHH + Contacto**: sirve el formulario "Trabajá con nosotros" —que
  **reenvía** las postulaciones a Gestión Petrogas, sin guardarlas acá— y el
  formulario de contacto, cuyos mensajes sí quedan en el panel.

Lo que **no** es dinámico (sigue estático en el HTML, no lo sirve la API): la
página "Nosotros" y las stats del index. No busques endpoints para eso.

**Público vs panel**: los `GET` de contenido son **públicos** (los consume el
sitio, sin login). Crear/editar/borrar contenido y ver los mensajes de contacto
requiere **sesión** (panel de administración).

---

## 2. Roles y quién ve qué

Hay cuatro roles (`user`, `admin`, `rrhh`, `auditor`). **No hay registro
público**: las cuentas las crea un admin por invitación (ver flujo abajo).

| Rol | Puede |
|---|---|
| **admin** | Todo: servicios, certificaciones, clientes, novedades, mensajes de contacto, invitar/gestionar usuarios, y el catálogo de títulos. |
| **rrhh** | Catálogo de títulos académicos, **novedades/prensa** y subir imágenes. NO gestiona servicios/certificaciones/clientes ni mensajes de contacto. Las postulaciones se administran en Gestión Petrogas, no acá. |
| **auditor** | Solo lo de la certificación: las **certificaciones** (ciclo completo, incluido el borrado definitivo), la **marca de Bureau Veritas** del pie con su texto de alcance, y el **registro de cambios**. Puede subir imágenes y PDFs. NO toca servicios, clientes, novedades, títulos, mensajes, usuarios ni los banners del sitio. |
| **user** | Rol base; sin acceso al panel de administración de contenido. |

**Ojo con la pantalla "Sitio":** tiene dos bloques y el auditor solo puede tocar
uno. La marca de certificación y su alcance van por `PATCH /site-settings`, que
sí puede; las imágenes de las páginas van por `PATCH /site-settings/images`, que
**no**. Si el bloque de banners aparece para un auditor, va a poder completarlo
y recibir un 403 recién al guardar.

**Una cuenta puede tener varios roles**: `roles` es un arreglo. Alguien con
`["rrhh", "auditor"]` ve la unión de las dos secciones, así que el menú se arma
con "¿incluye este rol?" y no con un `switch` sobre el primero.

El frontend puede armar el menú del panel según el rol del usuario logueado.
El rol se conoce consultando `GET /api/users/:id` con la sesión activa (devuelve
el array `roles`).

---

## 3. Los flujos de negocio

Estos son los comportamientos que **no se deducen del openapi** y que el
frontend tiene que respetar.

### 3.1 Alta de usuarios: invitación → activación
No existe "registrarse". El flujo es:
1. Un **admin** invita a alguien: `POST /api/auth/users` con `{ email, roles? }`.
   Se crea una cuenta **pendiente** (sin nombre ni contraseña todavía) y el
   sistema le manda un correo con un enlace.
2. El enlace apunta a **`{FRONTEND_URL}/activate?token=...`** (una página que el
   frontend implementa). Ahí la persona define **nombre, apellido y contraseña**
   y el front llama a `POST /api/auth/activate`.
3. Recién ahí la cuenta queda activa y puede iniciar sesión.

El **primer admin** se siembra solo al desplegar y recibe el mismo correo de
activación. Para el frontend es indistinto: es "un usuario que se activa".

#### 3.1.1 Estados de una cuenta y administración (🔒admin)

Cada usuario que devuelve la API trae un campo **`status`** ya calculado, con
tres valores posibles. Usalo para el badge de la grilla en vez de deducirlo:

| `status` | Qué significa | Qué puede hacer el admin |
|---|---|---|
| `pendiente` | Se la invitó pero nunca aceptó: todavía no tiene contraseña. | Reenviar la invitación, **eliminarla** |
| `activo` | Tiene acceso al panel. | Desactivar, cambiar roles |
| `desactivado` | La tuvo y un admin se la quitó. | Reactivar, cambiar roles |

El campo existe porque `isActive: false` significa **dos cosas distintas** (una
invitación sin aceptar y una baja), y en la grilla hay que distinguirlas.

Puntos a tener en cuenta al armar la pantalla:

- **Desactivar corta el acceso al instante.** No hay que esperar a que venza
  ningún token: la sesión abierta de esa persona deja de funcionar en el
  siguiente request y sus sesiones guardadas quedan revocadas.
- **Cambiar roles también aplica al instante**, sin necesidad de que la persona
  vuelva a entrar.
- `PATCH /users/:id/roles` **reemplaza** el conjunto completo de roles; no es
  un alta parcial. Mandá siempre el arreglo entero y con al menos un rol.
- **Reactivar solo sirve para una cuenta `desactivado`.** Sobre una `pendiente`
  responde 409: esa persona nunca definió contraseña, así que activarla dejaría
  una cuenta inutilizable. Ahí el botón correcto es *reenviar invitación*.
- El admin **no puede desactivarse ni cambiarse los roles a sí mismo** (409).
  Conviene deshabilitar esas acciones en la fila del propio usuario en vez de
  dejar que el backend las rechace.
- **Cerrar sesiones sin dar de baja** (`POST /users/:id/revoke-sessions`). Cierra
  todas las sesiones abiertas de esa persona y devuelve
  `{ "sessionsClosed": N }` para confirmarlo en pantalla. La cuenta **sigue
  activa**: su `status` no cambia y puede volver a entrar con su contraseña.
  Para una notebook perdida o una sesión abierta en una máquina ajena, es esto y
  no "desactivar". El corte es inmediato, no queda ninguna ventana de gracia.
  Un admin no puede cerrar las suyas (409): se dejaría afuera del panel.
- **Solo se borran las invitaciones pendientes** (`DELETE /users/:id`). Una
  cuenta que nunca se aceptó no tiene historia, y es la salida cuando se invitó
  a una dirección mal escrita: al eliminarla, ese email queda libre para
  reinvitarlo. Sobre una cuenta `activo` o `desactivado` responde 409 — esas se
  dan de baja con `desactivar`, que es reversible y conserva el rastro. Pedí
  confirmación antes de eliminar: no se puede deshacer.

Los 409 de esta sección llegan con el sobre de error estándar y un `message`
en español listo para mostrar.

### 3.2 Login y sesión (cookies, no tokens en JS)
El login **no devuelve un token** para guardar. Setea cookies `HttpOnly`
(el JS no las puede leer, es a propósito, por seguridad). Ver
[convenciones técnicas](#4-convenciones-técnicas-leer-antes-de-codear).

### 3.3 Recuperación de contraseña
1. `POST /api/auth/forgot-password` con `{ email }`. **Siempre** responde igual,
   exista o no el email (anti-enumeración). No muestres "ese email no existe".
2. El correo lleva a **`{FRONTEND_URL}/reset-password?token=...`** (otra página
   del frontend). Ahí se define la nueva contraseña → `POST /api/auth/reset-password`.

### 3.4 Postulaciones: las recibe Gestión Petrogas
El formulario "Trabajá con nosotros" es **público** y se envía a
`POST /api/recruitment/applications`, la misma ruta de siempre. Pero este
backend ya no es el dueño de ese dato: **reenvía la postulación a Gestión** y no
guarda nada, ni los datos ni el CV.

Lo que eso significa en la práctica:

- **Las reglas del formulario las define Gestión.** Si algo no valida, su
  respuesta llega con el detalle campo por campo y el formulario la muestra
  (ver §7.1). El sitio no duplica esas reglas, justamente para que no se
  desfasen.
- **Los puestos salen de Gestión** (`GET /api/recruitment/job-profiles`, misma
  ruta), con `id` **numérico** y `name`. Ya no hay pantalla para administrarlos
  en el panel del sitio.
- **El título sí sigue siendo nuestro** (ver 3.5).
- El CV es un **PDF obligatorio** (máx 5 MB, verificado por sus bytes y sin contenido activo). Ver
  [multipart](#7-detalle-de-los-formularios-con-archivos-multipart).
- **No hay pantalla de postulaciones en el panel**: RRHH las ve en Gestión.

### 3.5 Campo "Título": catálogo + texto libre
Para poder filtrar postulaciones por título sin ambigüedades, hay un **catálogo**
de ~140 títulos (`GET /api/recruitment/degree-titles`, público), agrupados por
**nivel educativo** (`level`): `primario`, `secundario` (común/bachiller),
`secundario_tecnico`, `terciario`, `universitario`, `formacion_profesional`.
Podés traer uno solo con `?level=universitario`, o traer todos y agrupar el
autocompletado por nivel (recomendado para que la lista sea navegable).
En el formulario:
- Mostralo como **autocompletado**. Si la persona elige uno del catálogo, mandás
  **`degreeTitleId` Y `degreeTitleName`** (los dos: Gestión guarda el nombre,
  porque el catálogo lo mantiene el sitio y sus ids no significan nada allá).
- Si no encuentra el suyo, puede escribirlo libre → mandás `degreeTitleOther`.
- **Son mutuamente excluyentes**: o el par del catálogo, o el texto libre, nunca
  ambos (Gestión responde 422 si van juntos).

> ⚠️ **Pendiente de confirmar con Gestión:** su documentación dice que el título
> es opcional, pero **su API lo exige** (rechaza el envío si no va ninguno de
> los dos). Hasta que lo aclaren, tratalo como **obligatorio** en el formulario.

### 3.6 Novedades y Prensa
Una sola entidad con una `category` (`novedades` | `prensa`) — así se arma el
filtro de la página. Hay notas **destacadas** (`isFeatured`) para el hero de la
sección. El listado público es **paginado** y solo trae las publicadas
(los borradores solo se ven en el panel). Cada nota trae un `source`
(`manual` | `linkedin`) por si querés badgear las importadas, y `externalUrl`
con el link al post original cuando vino de LinkedIn.

**Destacada ÚNICA (garantizada por el backend):** a lo sumo una nota tiene
`isFeatured: true`. Marcar una como destacada (por `POST /news`,
`PATCH /news/:id` o al aprobar un import de LinkedIn con `isFeatured`)
**des-marca automáticamente la anterior**, de forma atómica en la misma
transacción. El panel NO necesita normalizar nada: un único
`PATCH { isFeatured: true }` alcanza (adiós al workaround de listar y
des-marcar). Reglas asociadas:

- **Cero destacadas es válido**: `PATCH { isFeatured: false }` sobre la única
  destacada funciona y la página simplemente no muestra la card grande.
- **Mandar la destacada a la papelera** deja el sitio sin destacada (no se
  auto-promueve otra al azar; alguien elige la próxima).
- **Restaurar una nota que estaba destacada**: si mientras estuvo en la
  papelera se destacó OTRA, vuelve con `isFeatured: false` (no le roba la
  portada en silencio a la actual). Si no hay ninguna destacada, conserva la
  suya.

### 3.6.1 Novedades desde LinkedIn (curaduría)
No todo lo que se postea en LinkedIn va a la web: hay un paso de **aprobación**.
El flujo es una **bandeja de curaduría** (panel, admin/rrhh):

1. **Sincronizar**: `POST /news/linkedin/sync` trae los posteos recientes de la
   página de LinkedIn y los agrega como **candidatos pendientes**. Es idempotente:
   un candidato ya procesado (aprobado o rechazado) **no vuelve a aparecer**.
2. **Revisar la cola**: `GET /news/linkedin/imports` (pendientes por defecto;
   `?status=approved|rejected` para ver el historial). Cada item trae `text`,
   `mediaUrl` (para previsualizar) y `externalUrl`.
3. **Aprobar** (`POST /news/linkedin/imports/:id/approve`, body `{ category }`
   obligatorio; opcionales `title`, `excerpt`, `isFeatured`) → crea y **publica**
   la nota (copia el texto, descarga la imagen al almacenamiento) y devuelve
   la `NewsPost`.
   O **rechazar** (`POST /news/linkedin/imports/:id/reject`) → se descarta.

> **Aprobar nunca falla por slug duplicado.** El slug se deriva del título, y si
> ya está tomado (por una nota publicada, un borrador o una **en la papelera**)
> el backend le agrega sufijo automáticamente: `mi-titulo`, `mi-titulo-2`,
> `mi-titulo-3`… No hay 409 por esto y **no necesitás pedirle al usuario que
> cambie el título**. El slug final viene en la respuesta (`data.slug`) — si te
> importa que sea prolijo, mostralo o dejá que edite `title` antes de aprobar.
> El único 409 de `approve` es **"Esa importación ya fue procesada"** (alguien la
> aprobó o rechazó antes); ese no trae `conflict`.

> **Importante para el front**: la parte pública (`GET /news`) no cambia — las
> notas aprobadas aparecen ahí como cualquier otra, con su `coverImage` y
> `source: "linkedin"`. La cola de curaduría es **solo del panel**.
>
> **Estado del backend**: el modo por defecto es `stub` (posteos de ejemplo,
> para desarrollar el panel sin depender de LinkedIn). El fetch real requiere que
> LinkedIn apruebe el acceso a su API; hasta entonces `sync` en modo `api`
> responde `503`. Todo el resto del flujo (cola, aprobar, rechazar) ya funciona.

### 3.6.2 Configuración del sitio (marca de Bureau Veritas del footer)
Singleton editable, sin `:id`:

- `GET /api/site-settings` — **público y cacheable** (`Cache-Control: public,
  max-age=300`); lo consume el footer en todas las páginas. Devuelve
  `{ certificationMarkImage, certificationScopeText }` — la imagen ya como
  **URL absoluta**, o ambos en `null` si aún no se cargó nada (nunca 404).
- `PATCH /api/site-settings` (🔒 admin) — semántica por campo: **ausente** = no
  se toca; **null** = se limpia (y la imagen anterior se borra del storage);
  **string** = se reemplaza. La imagen se sube antes por `POST /media/uploads`
  y acá se manda la **key**.

#### Imágenes de cabecera de las páginas fijas (por slot)

Los banners que encabezan cada página fija y las fotos del inicio son editables
desde el panel, identificados por un **slot** con nombre:

- `GET /api/site-settings/images` — **público y cacheable** (`max-age=300`).
  Devuelve un mapa `slot -> URL absoluta`:
  ```json
  { "banner-nosotros": "https://.../abc.webp", "home-hero": "https://.../hero.webp" }
  ```
  **Solo aparecen los slots con imagen cargada.** Si no hay ninguna, viene un
  objeto vacío (**nunca 404**) → usá la imagen por defecto de tu código como
  reserva.
- `PATCH /api/site-settings/images` (🔒 admin) — body `{ slot, imageKey }`.
  `imageKey` con una key la asigna o reemplaza; **`imageKey` en null (o ausente)
  limpia el slot**. Devuelve el mapa completo ya actualizado. La imagen se sube
  antes por `POST /media/uploads`.

Slots en uso (el backend **no** los tiene hardcodeados: agregar una página nueva
es un slot nuevo, sin migración ni deploy del backend):

| Slot | Dónde |
|---|---|
| `banner-nosotros` | `/nosotros` |
| `banner-servicios` | `/servicios` (índice) |
| `banner-certificaciones` | `/certificaciones` |
| `banner-rrhh` | `/rrhh` y `/trabaja-con-nosotros` (comparten banner) |
| `banner-novedades` | `/novedades-y-prensa` |
| `banner-contacto` | `/contacto` |
| `home-hero` | foto grande del hero del index |
| `home-empresa` | foto del bloque "Nuestra empresa" |

El `slot` se valida en kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, máx 60) para
que un typo con espacios o mayúsculas no cree un slot fantasma.

**No entran acá** (ya son editables por su propio recurso): el banner del
**detalle** de un servicio (`services.bannerImage`) y la **portada** de una nota
(`news.coverImage`). El **logo** sigue siendo un asset estático del frontend.

`certificationMarkImage` es UNA sola imagen de Bureau Veritas que lista adentro
todas las normas certificadas (no confundir con el logo por certificación).
`certificationScopeText` es el **alcance** y debe mostrarse **junto a la marca,
visible sin clics** (requisito del manual de BV Rev. 14 §5/§7 cuando el alcance
no cubre todo). Al reemplazar la imagen, la key vieja se limpia sola del
storage; y `DELETE /media/uploads` de una key en uso por la configuración
responde 409 como con el resto del catálogo.

### 3.6.4 Sitemap XML (SEO)

`GET /sitemap.xml` — **público, sin autenticación**. Es la única ruta del
backend que **vive fuera del prefijo `/api`** y que **no devuelve el sobre
estándar**: responde XML crudo con `Content-Type: application/xml`, porque los
buscadores descartan el archivo si viene envuelto en JSON.

Lo genera el backend a partir de la base, así que se mantiene solo:

| Bloque | Contenido |
|---|---|
| Páginas fijas | Las 8 rutas del sitio (`/`, `/nosotros`, `/servicios`, `/certificaciones`, `/rrhh`, `/trabaja-con-nosotros`, `/novedades-y-prensa`, `/contacto`) |
| Servicios | Uno por servicio **activo**, en `/servicios/{slug}` |
| Novedades | Una por nota **publicada**, en `/novedades-y-prensa/{slug}` |

Las URLs dinámicas llevan `<lastmod>` con la fecha de última modificación
(`AAAA-MM-DD`). Nunca aparecen borradores ni elementos de la papelera: publicar
una URL que responde 404 perjudica el posicionamiento, así que los filtros son
exactamente los mismos que usa el sitio público. Al publicar una nota o
restaurarla de la papelera, entra al sitemap sola.

El dominio sale de la variable `PUBLIC_SITE_URL` del backend (en staging apunta
al dominio de staging). La respuesta se cachea una hora.

**Para el frontend**: se puede borrar el `sitemap.xml` estático de `public/` y
derivar esa ruta al backend en el proxy.

### 3.6.5 Registro de cambios y revisión del sitio (🔒admin/auditor)

Control de documentos ISO: **todo cambio sobre el contenido queda asentado**
—quién, cuándo, qué campo, y qué decía antes— y se puede exportar a Excel.

**El número de revisión del footer sale del backend.** Sube solo: **una revisión
por cada día en que se cambió algo**, con **dos dígitos y sin punto**:
`01, 02 … 99`. Nadie lo puede editar, y no hay endpoint que lo intente: es lo que
lo hace confiable ante un auditor.

**A los tres dígitos vuelve a `01`** (la revisión 100 se muestra igual que la 1),
por pedido de control de documentos. Lo que las distingue es la **fecha**, que
viaja siempre junto al número —`revisionDate` en el pie, `occurredAt` en cada
asiento, la columna *Fecha* en el Excel—. Si armás una vista que muestre el
número **solo**, se pierde esa desambiguación: mostralo siempre con su fecha.

Llega en `GET /api/site-settings`, el mismo endpoint que el footer ya consume:

```json
{
  "certificationMarkImage": "https://…",
  "certificationScopeText": "…",
  "revision": "03",
  "revisionDate": "2026-08-27"
}
```

Con `"00"` y `revisionDate: null` el sitio está en su línea de base: el
contenido con el que salió a producción. **El mes lo formatea el frontend** —el
backend devuelve la fecha ISO, como en toda la API—. Y ojo que ese endpoint
cachea 5 minutos, así que el número nuevo puede tardar eso en verse.

**El listado:** `GET /api/change-log`, paginado, con filtros `from`, `to`,
`entityType` y `action`. Cada asiento trae sus `details`, un objeto por campo
cambiado. Cuando un detalle viene con `summary`, ese texto **reemplaza** a los
valores: pasa con los campos largos —el cuerpo de una nota solo registra que
cambió, no su contenido— y con los archivos.

**La exportación:** `GET /api/change-log/export` devuelve un `.xlsx` con el
nombre ya armado en el `Content-Disposition`. Mismos filtros, sin paginar. Si el
rango supera las 50.000 filas responde 400 pidiendo acotarlo.

Dos cosas que van a parecer bugs y no lo son:

- **Los nombres viejos no se actualizan.** Un asiento guarda cómo se llamaba el
  elemento *cuando se lo tocó*. Si después se renombra, el historial sigue
  mostrando el nombre anterior: es justamente lo que tiene que hacer.
- **Aparecen elementos que ya no existen.** Un registro eliminado
  definitivamente sigue figurando. No enlaces el nombre a su ficha, porque puede
  no estar.

---

### 3.7 Contacto
Formulario público → `POST /api/contact`. El backend guarda el mensaje y avisa
por email a la empresa. Para el front es un simple submit con respuesta de éxito.

**Límite:** 5 envíos por minuto por IP. Da margen a quien se equivoca y reenvía
—y a varias personas detrás de una misma IP— sin abrir la puerta al spam.

**Campo trampa (honeypot).** El formulario incluye un campo llamado
`referencia`, oculto y que se manda **siempre vacío**. Una persona no puede
completarlo; los bots lo llenan porque leen el HTML y completan todos los
`<input>`.

Si llega con contenido, el backend descarta el mensaje: no lo guarda, no
notifica, y responde **201 igual que un envío normal**. Es a propósito — un
error le avisaría al bot que lo detectamos y probaría otra cosa. Para el front
no hay ningún caso nuevo que manejar.

Lo que el campo necesita para funcionar, y por qué:

| Atributo | Motivo |
|---|---|
| `type="text"` (no `hidden`) | los bots saltean los campos `hidden` |
| fuera de pantalla (no `display:none`) | `display:none` es trivial de detectar |
| `tabindex="-1"` | que no se llegue con el tabulador |
| `aria-hidden="true"` | que los lectores de pantalla lo salteen |
| `autocomplete="off"` | que el navegador no lo complete solo |
| el nombre `referencia` | no dispara el autocompletado, a diferencia de `empresa`, `sitio-web` o `email2` |

Los dos últimos son los que evitan el falso positivo: si el campo se completara
solo, le estarías descartando el mensaje a una persona real. No lo valides ni lo
chequees del lado del cliente.

---

## 4. Convenciones técnicas (leer antes de codear)

### 4.1 Base URL y sobre de respuesta
Todo cuelga de **`/api`** (ej. `https://tu-dominio/api/services`).

**Toda respuesta exitosa** viene envuelta en este "sobre":
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Servicios obtenidos correctamente",
  "data": { }, 
  "meta": { }   // presente SOLO en listas paginadas
}
```
El contenido real está en **`data`** (objeto, array o `null`). El `message` es
apto para mostrar en un toast.

**Todo error** viene así:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "La contraseña debe tener al menos 8 caracteres...",
  "errors": ["...", "..."],   // errores de validación, o null
  "timestamp": "2026-07-21T14:38:35.432Z",
  "path": "/api/auth/activate"
}
```
Para errores de validación (400), `message` es el primer error y `errors` trae
todos. Mostrá `message` en el toast; usá `errors` si querés marcar campos.

**`errors` tiene dos formas**, según de dónde venga el error:
- **lista** (`string[]`) — validación propia del backend, el caso habitual;
- **mapa** (`{ campo: string[] }`) — los **422 del formulario de postulación**,
  que los valida Gestión Petrogas y devuelve el detalle por campo (ver §7.1).

Si vas a recorrer `errors`, chequeá `Array.isArray()` antes.

> Sugerencia: hacé un wrapper de fetch/axios que desenvuelva `data` y, ante
> `success: false`, tire un error con `message` para tu manejo global de toasts.

### 4.2 Autenticación por cookies (¡importante!)
- El login **setea cookies `HttpOnly`** (`accessToken` y `refreshToken`). **No
  las podés leer desde JS y no hace falta** — el navegador las manda solo.
- **Configurá el cliente HTTP para enviar credenciales siempre:**
  - fetch: `fetch(url, { credentials: 'include' })`
  - axios: `axios.defaults.withCredentials = true`
- El `accessToken` dura ~15 min; el `refreshToken` ~7 días (acotado a
  `/api/auth`).
- **Manejo de expiración**: si una llamada autenticada devuelve **401**, probá
  `POST /api/auth/refresh` (renueva las cookies) y reintentá la request
  original. Si el refresh también da 401, la sesión murió → mandá a login.
- **Refresh concurrente (varias pestañas)**: el refresh token **rota** en cada
  uso, y reutilizar uno ya rotado se interpreta como robo y cierra todas las
  sesiones. Para que eso no golpee al caso legítimo —dos pestañas cuyos access
  tokens vencen a la vez y refrescan en paralelo con la misma cookie— hay una
  **ventana de gracia de 10 segundos**: dentro de ella, la segunda pestaña
  también recibe una sesión válida en vez de que se corte todo. Fuera de esa
  ventana, la detección de robo sigue intacta.
  Igual conviene **serializar el refresh en el cliente** (un único refresh en
  vuelo, y que las demás llamadas esperen su resultado): es menos tráfico y no
  depende de la ventana.
- **Orígenes aceptados en desarrollo**: además de `FRONTEND_URL`, el backend
  acepta `http://localhost:<mismo puerto>` y `http://127.0.0.1:<mismo puerto>`.
  Así el panel funciona lo abras por la IP de red (para probar desde el celular)
  o por localhost, sin tocar configuración. **En producción se acepta
  únicamente `FRONTEND_URL`**, sin excepciones.
- **CORS**: el backend solo acepta el origen configurado en `FRONTEND_URL`, con
  credenciales. Coordiná esa URL con backend (exacta, sin barra final). Nota de
  despliegue: por `SameSite=Strict`, frontend y API conviene que estén en el
  **mismo dominio registrable** (ej. `petrogassa.com` y `api.petrogassa.com`);
  dominios totalmente distintos rompen el envío de cookies.

### 4.3 Login / logout
- `POST /api/auth/login` con `{ email, password }` → `data` es el usuario
  público `{ id, email, name, surname }` y setea las cookies. Guardá ese objeto
  en tu estado de sesión.
- `POST /api/auth/logout` → borra las cookies. Limpiá tu estado local.
- Para saber el rol / rehidratar sesión al recargar: `GET /api/users/:id` con la
  cookie (devuelve la entidad con `roles`, `isActive`, etc., sin password).

### 4.4 Paginación
Los listados paginados aceptan `?page=` (default 1) y `?limit=` (default 10,
máx 100). El `meta` del sobre trae todo lo necesario para la UI de paginado:
```json
"meta": {
  "totalItems": 145, "itemsPerPage": 10, "currentPage": 2, "totalPages": 15,
  "hasNextPage": true, "hasPrevPage": true,
  "nextPageUrl": "/api/news?limit=10&page=3",
  "prevPageUrl": "/api/news?limit=10&page=1"
}
```

### 4.5 Rate limiting
Hay límites por IP; si se exceden, viene **429**. Relevantes para el front:
formulario de **contacto** → 5/min; **forgot-password** → 3/min;
**postulaciones** → 20/min; endpoints de auth en general → 10/min. Mostrá un
mensaje amable ante 429 (el `message` ya viene en español).

### 4.6 Imágenes de contenido
Las entidades con imagen (servicios, clientes, certificaciones, portada de
novedades, ajustes e imágenes del sitio) devuelven en sus `GET` **URLs absolutas**
listas para usar en `<img>`. No tenés que componer nada. (En el panel, la subida
es un paso aparte; ver 5.3.)

**Ojo con el ida y vuelta:** el campo que en el `POST`/`PATCH` se manda como
**key** (`media/2026/08/uuid.png`) vuelve en el `GET` como **URL absoluta**. Son
el mismo campo con dos formas según la dirección.

Si cargás el formulario con la respuesta del `GET` y lo mandás de vuelta tal
cual, el backend **acepta la URL y la guarda como key** — le saca el origen y se
queda con la parte `media/...`. Así que ese patrón es seguro y no tenés que
acordarte de recortar nada.

Lo que **no** acepta es cualquier otra cosa: un nombre de archivo suelto o una
URL de otro sitio dan **400** con el nombre del campo. Antes se guardaban sin
chistar, y como el backend limpia solo los archivos que quedan sin uso, la
imagen anterior se borraba del disco y la ficha quedaba sin foto.

Para limpiar una imagen opcional, mandá `null` (no `""`).

### 4.7 Papelera (borrado recuperable)
El **catálogo de contenido** —servicios, certificaciones, clientes, novedades y
títulos académicos— usa **papelera**: `DELETE` no destruye, manda a la papelera y
se puede restaurar. Son **dos operaciones distintas**, no las confundas:

- **Visibilidad** (`isActive` / `isPublished`, vía `PATCH`): oculta un item que
  sigue existiendo. Reversible. El sitio público no lo muestra; el listado admin
  normal **sí** (para poder reactivarlo).
- **Papelera** (borrado suave): saca el item de **todos** los listados normales
  (público y admin). Solo aparece en la papelera. Reversible con *restaurar*.

Cada recurso del catálogo tiene 3 endpoints extra (roles = los del recurso):

| Acción | Endpoint | Nota |
|---|---|---|
| Enviar a papelera | `DELETE /<recurso>/:id` | Antes borraba; ahora es soft. Devuelve "movido a la papelera" |
| Ver papelera | `GET /<recurso>/admin/trash` | Lista los borrados (más recientes primero) |
| Restaurar | `POST /<recurso>/:id/restore` | Lo devuelve a los listados |
| Borrar definitivo | `DELETE /<recurso>/:id/permanent` | **Irreversible**; recién acá se borra la imagen del almacenamiento. Pedí confirmación fuerte en la UI |

**El borrado definitivo exige pasar por la papelera.** Si mandás `permanent`
sobre un item vivo, responde **409** y no toca nada: es la salida de la papelera,
así que hay que haber entrado. En la práctica el panel nunca debería ver ese 409
—el botón vive dentro de la vista de papelera—, pero si armás una acción de
"eliminar" en el listado normal, son **dos llamadas**: `DELETE /<recurso>/:id` y
después `DELETE /<recurso>/:id/permanent`.

**Títulos académicos:** es el único recurso de RRHH con papelera, porque es el
único que sigue viviendo acá. Las postulaciones y los puestos son de Gestión
Petrogas (ver §3.4), así que este backend no tiene listado de postulaciones ni
estadísticas, y nada le impide borrar un título salvo la regla general de arriba
(hay que mandarlo antes a la papelera). Un título en la papelera desaparece del
autocompletado público al instante.

**Slugs estables:** al editar una nota o un servicio, **cambiar el título NO
cambia el slug** (la URL pública no se rompe). El slug solo cambia si el panel
manda `slug` explícito en el PATCH. Al **crear** sí se deriva del título como
siempre.

**`DELETE /media/uploads` solo borra huérfanos:** si la key está referenciada
responde **409**. Se consultan las seis entidades que guardan keys —servicio,
certificación, cliente, novedad, ajustes del sitio e imágenes del sitio—,
incluidos los registros en la papelera. Usalo solo para limpiar archivos que
quedaron sin dueño.

**No hace falta que borres imágenes al reemplazarlas.** Cuando un `PATCH` deja
una key sin uso, el backend la borra solo, y solo si ninguna otra entidad la
usa. Intercambiar dos imágenes entre dos campos del mismo item no borra ninguna.

Otras garantías (verificadas end-to-end):

- **Restaurar preserva el estado de visibilidad.** `restore` solo limpia
  `deletedAt`; no toca `isPublished`/`isActive`. Si restaurás una nota que estaba
  publicada, vuelve **publicada y reaparece en el sitio público al instante**. Si
  restaurás un cliente que estaba oculto (`isActive:false`), vuelve **oculto**.
  Útil para el texto del modal: "Volverá a estar visible en el sitio" solo aplica
  si el item estaba publicado/activo.
- **La papelera no se purga sola.** No hay retención ni job automático: un item
  queda ahí hasta que alguien haga `permanent`. El único job programado del
  backend es la limpieza de tokens vencidos, que no toca contenido.
- El recurso **sin** papelera (borrado físico directo): **mensajes de contacto**
  —son datos personales y se eliminan de verdad—. Las postulaciones y los CVs ni
  siquiera se guardan acá.

#### 4.7.1 Contrato de errores 409 (valor único)

**La invariante:** un item en la papelera **sigue reservando su slug/nombre
único**. Por eso no podés crear otro que lo use mientras esté ahí, y por eso
**restaurar nunca falla por duplicado** en el flujo normal.

Qué recursos tienen valor único:

| Recurso | Campo único |
|---|---|
| servicios, novedades | `slug` |
| títulos académicos | `name` |
| clientes, certificaciones | *(ninguno — nunca dan 409 por duplicado)* |

> Ojo: este 409 (valor único, con `conflict`) es distinto del 409 del borrado
> definitivo sobre un item que no está en la papelera, que no trae `conflict`.

Los 409 por valor único traen un **`conflict`** con el registro que lo retiene,
para que ofrezcas la solución sin tener que buscarlo:

```json
{
  "success": false,
  "statusCode": 409,
  "message": "Ya existe un servicio con el slug «conflicto-sd» en la papelera. Restaurá ese registro o eliminalo definitivamente para liberar el slug.",
  "errors": null,
  "conflict": { "id": "fa5098f3-…", "field": "slug", "value": "conflicto-sd", "inTrash": true },
  "timestamp": "2026-07-24T12:10:11.114Z",
  "path": "/api/services"
}
```

- `conflict.id` → el registro bloqueante. Si `inTrash: true`, con ese id podés
  ofrecer **"Restaurar ese"** (`POST /<recurso>/:id/restore`) o **"Eliminarlo
  definitivamente"** (`DELETE /<recurso>/:id/permanent`) en el mismo modal.
- `conflict.field` es `"slug"` o `"name"`; `conflict.value` es el valor en
  conflicto (usalo donde esperabas `slug`).
- `message` ya viene armado en español y cambia según `inTrash` → podés mostrarlo
  tal cual.
- El campo `conflict` **solo aparece en estos 409**; el resto de los errores
  conserva el cuerpo de siempre.

**Los 409 de `restore` son dos, y se distinguen por la presencia de `conflict`:**

| Caso | `conflict` | Cuándo |
|---|---|---|
| "El servicio no está en la papelera" | **ausente** | Llamaste `restore` sobre algo que no estaba borrado |
| "No se puede restaurar: ya existe … fuera de la papelera" | **presente** (`inTrash:false`) | Defensivo: no debería ocurrir por la invariante de arriba, pero está definido y cubierto por tests |

---

## 5. Mapa de endpoints por pantalla

Prefijo `/api` omitido. **P** = público, **🔒admin**, **🔒admin/rrhh**.

### 5.1 Sitio público (lo que consume la landing)

| Pantalla / sección | Endpoint | |
|---|---|---|
| Home — servicios destacados | `GET /services` | P |
| Home — "Algunos de nuestros clientes" | `GET /clients` | P |
| Home — novedades (teaser) | `GET /news?featured=true&limit=3` | P |
| Servicios (listado) | `GET /services` | P |
| Servicio (página propia) | `GET /services/:slug` | P |
| Certificaciones | `GET /certifications` | P |
| — cada certificación puede traer `certificatePdf` (URL absoluta o `null`); si no es null, mostrá un botón "Ver / Descargar certificado" que apunte a esa URL. | | |
| Novedades y Prensa (listado + filtro) | `GET /news?category=novedades&page=1` | P |
| Nota (detalle) | `GET /news/:slug` | P |
| Footer — marca de certificación BV + alcance | `GET /site-settings` (cacheable) | P |
| Banners de cabecera de páginas fijas + fotos del inicio | `GET /site-settings/images` (cacheable) | P |
| RRHH — combos del formulario | `GET /recruitment/job-profiles` · `GET /recruitment/degree-titles` | P |
| RRHH — enviar postulación | `POST /recruitment/applications` (multipart) | P |
| Contacto — enviar mensaje | `POST /contact` | P |

### 5.2 Auth (público, pero son "de sesión")
`POST /auth/login` · `POST /auth/logout` · `POST /auth/refresh` ·
`POST /auth/activate` · `POST /auth/forgot-password` · `POST /auth/reset-password`

**`GET /auth/me`** (🔒 requiere sesión) — devuelve el usuario actual **con sus
`roles`**. Llamalo al arrancar la app y después de cada recarga: como las
cookies son `HttpOnly`, es la única manera de saber qué rol tiene quien está
usando el panel, y con eso se decide qué ítems del menú mostrar. Responde 401
si la sesión venció o si un admin desactivó la cuenta.

### 5.3 Panel de administración

**Contenido (🔒admin):**
- Servicios: `GET /services/admin` (incluye inactivos) · `POST /services` ·
  `PATCH /services/:id` · `DELETE /services/:id`
- Certificaciones: `POST /certifications` · `PATCH /certifications/:id` ·
  `DELETE /certifications/:id`
- Clientes: `GET /clients/admin` · `POST /clients` · `PATCH /clients/:id` ·
  `DELETE /clients/:id`
- Mensajes de contacto: `GET /contact/messages?status=&page=` ·
  `PATCH /contact/messages/:id` (marcar leído) · `DELETE /contact/messages/:id`

**Usuarios (🔒admin):** ver [3.1.1](#311-estados-de-una-cuenta-y-administración-admin)
- `GET /users?page=&limit=&search=&role=&status=` — grilla paginada. `search`
  busca en nombre, apellido y email ignorando mayúsculas y acentos; `role` es
  `admin|rrhh|user` y `status` es `pendiente|activo|desactivado`.
- `POST /auth/users` — invitar · `POST /auth/users/:id/resend-activation` — reenviar
- `POST /users/:id/deactivate` — quitar el acceso (efecto inmediato)
- `POST /users/:id/reactivate` — devolverlo
- `PATCH /users/:id/roles` con `{ "roles": ["admin"] }` — reemplaza los roles

**Novedades (🔒admin/rrhh):**
- `GET /news/admin` (incluye borradores, paginado) · `GET /news/admin/:id`
  (para editar) · `POST /news` · `PATCH /news/:id` · `DELETE /news/:id`
- LinkedIn (curaduría): `POST /news/linkedin/sync` (traer posteos) ·
  `GET /news/linkedin/imports?status=&page=` (cola) ·
  `POST /news/linkedin/imports/:id/approve` (body `{ category }`) ·
  `POST /news/linkedin/imports/:id/reject`

**RRHH (🔒admin/rrhh):**
- Catálogo de títulos: `GET /recruitment/degree-titles/admin?page=&limit=&search=&level=`
  (**paginado**, con búsqueda por nombre y filtro por nivel) · `POST` ·
  `PATCH /:id` · `DELETE /:id`

La búsqueda (`search`) es **parcial e insensible a mayúsculas y acentos**:
"tecnico" encuentra "Técnico", "mecanico" encuentra "Mecánico". `limit` máximo 100.

> **Ojo — público vs admin**: el endpoint **público** `GET /recruitment/degree-titles`
> devuelve la lista **completa** (sin
> paginar), porque alimentan los checkboxes y el autocompletado del formulario
> —el frontend los necesita enteros. Solo las variantes **`/admin`** (las tablas
> de gestión) están paginadas.

**Papelera (todos los recursos del catálogo de arriba):** además de su CRUD,
servicios, certificaciones, clientes, novedades y títulos académicos tienen
`GET /<recurso>/admin/trash`, `POST /<recurso>/:id/restore` y
`DELETE /<recurso>/:id/permanent`. El `DELETE /<recurso>/:id` normal manda a la
papelera (soft delete), y el `permanent` **exige** que el item ya esté ahí (409
si no). Ver **4.7** para el detalle.

**Configuración del sitio (🔒admin):**
- `PATCH /site-settings` (marca de certificación BV del footer + texto de
  alcance; ver 3.6.2)
- `PATCH /site-settings/images` (banners de cabecera y fotos del inicio, por
  slot; ver 3.6.2)

**Usuarios (🔒admin):**
- `POST /auth/users` (invitar) · `POST /auth/users/:id/resend-activation`
  (reenviar invitación)

**Subida de archivos (🔒admin/rrhh):**
- `POST /media/uploads` (multipart, campo `file`) → **solo imágenes** PNG/JPEG/WebP,
  máx 4 MB → devuelve `{ key, url }`.
- `POST /media/documents` (multipart, campo `file`) → **solo PDF**, máx 10 MB →
  devuelve `{ key, url }`. Para documentos públicos como el **certificado ISO**.
- **Flujo (igual para ambos)**: subís el archivo primero, obtenés la `key`, y esa
  `key` la mandás en el campo correspondiente al crear/editar la entidad
  (imágenes: `logoImage`, `coverImage`, `cardImage`; PDF: `certificatePdf`). El
  `GET` público después devuelve la URL absoluta ya resuelta.
- `DELETE /media/uploads?key=...` (🔒admin) borra cualquier archivo público
  (imagen o PDF).

**CVs:** el sitio **no los guarda ni los sirve**. El PDF que sube el postulante
se reenvía a Gestión Petrogas en el mismo request y no queda copia de este lado.
Para consultarlos, RRHH entra a Gestión.

---

## 6. Páginas que el frontend debe implementar sí o sí

Estas rutas del frontend son a las que **apuntan los enlaces de los correos**.
Si no existen, los correos quedan rotos.

| Ruta frontend | Qué hace | Llama a |
|---|---|---|
| `/activate?token=...` | Formulario de **nombre + apellido + contraseña** para activar la cuenta invitada. | `POST /api/auth/activate` con `{ token, name, surname, password }` |
| `/reset-password?token=...` | Formulario de **nueva contraseña**. | `POST /api/auth/reset-password` con `{ token, newPassword }` |

El `token` sale del query string de la URL. La política de contraseña (la valida
el backend y devuelve el error si no cumple): mínimo 8 caracteres, con
mayúscula, minúscula, número y símbolo.

---

## 7. Detalle de los formularios con archivos (multipart)

Dos endpoints usan `multipart/form-data` (no JSON). En fetch, armá un
`FormData` y **no** setees `Content-Type` a mano (el navegador pone el boundary).

### 7.1 Postulación — `POST /api/recruitment/applications` (público)

El sitio **reenvía** este formulario a Gestión Petrogas y no guarda nada. Las
reglas de validación son de ellos, no nuestras.

Campos del `FormData`:

| Campo | Obligatorio | Notas |
|---|---|---|
| `fullName` | sí | Nombre y apellido en un solo campo (5–120) |
| `email` | sí | |
| `phone` | sí | Máx 30 |
| `location` | sí | Localidad, máx 120 |
| `jobProfileIds` | sí | **Uno o más**; repetí el campo por cada puesto. Los ids son **números**, de `GET /recruitment/job-profiles` |
| `degreeTitleId` | ver nota | Id del catálogo — va **junto con** `degreeTitleName` |
| `degreeTitleName` | ver nota | Nombre del título elegido; acompaña a `degreeTitleId` |
| `degreeTitleOther` | ver nota | Título escrito a mano — **excluyente** con el par de arriba |
| `cv` | sí | Archivo **PDF**, máx 5 MB |

> **Título académico:** o mandás `degreeTitleId` **+** `degreeTitleName` (los
> dos juntos), o mandás `degreeTitleOther`. Nunca ambas opciones.
>
> Gestión documentó que puede ir vacío, pero **su API lo exige**: rechaza el
> envío si no va ninguno. Hasta que lo confirmen, tratalo como obligatorio.

```js
const fd = new FormData();
fd.append('fullName', 'Juan Pérez');
fd.append('email', 'juan@example.com');
fd.append('phone', '299-5551234');
fd.append('location', 'Cutral-Có');
fd.append('jobProfileIds', 1);      // ids numéricos
fd.append('jobProfileIds', 58);     // repetido para varios puestos
fd.append('degreeTitleId', idTecnicoMecanico);
fd.append('degreeTitleName', 'Técnico Mecánico');   // ¡los dos!
fd.append('cv', fileInput.files[0]);
await fetch('/api/recruitment/applications', { method: 'POST', body: fd });
// → { success: true, data: { id, status: "received" } }
```

**Errores.** Los de validación llegan con **422** y el detalle **campo por
campo**, listo para marcar cada input:

```json
{
  "success": false,
  "statusCode": 422,
  "message": "Debe seleccionar un titulo academico del catalogo o cargar uno manualmente.",
  "errors": {
    "degreeTitleId": ["Debe seleccionar un titulo academico del catalogo o cargar uno manualmente."],
    "cv": ["El CV debe ser un PDF."]
  }
}
```

Recorré `errors` y mostrá cada mensaje bajo su campo; `message` sirve para el
resumen general. Los textos ya vienen en español.

Otros códigos: **400** (falta el archivo `cv`, o el formulario trae demasiados
campos), **413** (CV > 5 MB, con el límite en el mensaje), **429** (demasiados
envíos desde la misma IP), **502/503** (Gestión no responde — mostrá "intentá de
nuevo en unos minutos"; la postulación **no se guardó en ningún lado**, hay que
reenviarla).

**El 422 puede venir de dos lados, y no hace falta distinguirlos.** Casi todas
las reglas las aplica Gestión, pero el sitio verifica tres cosas antes de
reenviar y las rechaza con **exactamente la misma forma**:

| Qué | Campo en `errors` |
|---|---|
| El CV no es un PDF de verdad (se miran los bytes, no la extensión) | `cv` |
| El PDF trae contenido activo (JavaScript, adjuntos) | `cv` |
| Se eligieron más de **3 puestos** | `jobProfileIds` |

Tratalos igual que los de Gestión: recorré `errors` y mostrá cada mensaje bajo su
campo. El máximo de 3 puestos conviene que además lo aplique la interfaz, para
que nadie llene todo el formulario y se entere al enviar.

### 7.2 Subir imagen de contenido — `POST /api/media/uploads` (🔒admin/rrhh)
`FormData` con un solo campo **`file`**: imagen **PNG, JPEG o WebP** (SVG
rechazado), máx 4 MB. Devuelve `{ key, url }`. Guardá la `key` para mandarla al
crear/editar la entidad; usá la `url` para previsualizar en el panel.
Errores: **400** (no es imagen válida), **413** (> 4 MB).

### 7.3 Subir documento PDF — `POST /api/media/documents` (🔒admin/rrhh)
`FormData` con un solo campo **`file`**: **PDF** real (validado por magic bytes),
máx 10 MB. Devuelve `{ key, url }`. Se usa hoy para el **certificado ISO** de una
certificación: subís el PDF, tomás la `key` y la mandás en `certificatePdf` al
crear/editar la certificación (`POST`/`PATCH /certifications`). El PDF es
**público** (URL directa, no firmada, a diferencia de los CV). Errores: **400**
(no es PDF), **413** (> 10 MB).

---

_Última fuente de verdad de contratos: `openapi.yaml` / Swagger `/api/docs`.
Si algo de este doc no coincide con el openapi, gana el openapi (y avisá para
corregir este archivo)._
