# Petrogassa · Landing Backend

Backend de autenticación de la landing de **Petrogassa**, construido con [NestJS](https://nestjs.com/) a partir de un template base reutilizable. **Modelo cerrado**: no hay registro público; un **admin** da de alta usuarios **por invitación** y cada invitado activa su cuenta definiendo nombre, apellido y contraseña. Autenticación por cookies `HttpOnly` (JWT de acceso + refresh token opaco rotado en base de datos), respuestas con un formato estándar y una configuración de Docker endurecida para producción.

## 🌟 Características

- **Sin registro público**: el alta es solo por invitación de un admin (`POST /auth/users`). El **admin inicial se siembra** al arrancar desde `ADMIN_EMAIL` (ver más abajo); **ninguna contraseña vive en variables de entorno**.
- **Alta por invitación**: el admin crea la cuenta con solo el email (opcionalmente el rol); el usuario recibe un correo con un enlace y define **nombre, apellido y contraseña** al activar (`POST /auth/activate`).
- **Contraseñas**: hasheo con `bcrypt` (cost 12) y política de 8–64 caracteres (mayúscula, minúscula, número y símbolo).
- **Sesiones seguras**: JWT de acceso entregado en cookie `HttpOnly` + `SameSite=Strict` + `Secure` (en producción). El refresh token viaja en una cookie acotada a `Path=/api/auth`. Un cambio de contraseña invalida los access tokens previos (`passwordChangedAt`).
- **Tokens hasheados en reposo**: los refresh tokens y los tokens de activación/reset se guardan **hasheados (SHA-256)**; el valor crudo solo existe en la cookie o el enlace del correo. Un volcado de la base de datos no permite tomar sesiones ni activar/resetear cuentas.
- **Rotación + detección de reutilización**: cada refresh rota el token; si un token ya rotado se vuelve a presentar (robo probable), se **revocan todas las sesiones** del usuario.
- **Reset seguro**: al cambiar la contraseña se invalidan todas las sesiones y los reset tokens pendientes. Flujo anti-enumeración en "olvidé mi contraseña".
- **Autorización**: guard de roles (`@Auth(UserRoles.ADMIN)`) y protección contra IDOR (`GET /users/:id` solo permite el propio usuario o un admin).
- **Endurecimiento HTTP**: `helmet`, `trust proxy` (para rate limiting correcto detrás de reverse proxy) y rate limiting **global** (`@nestjs/throttler`) con límites estrictos en los endpoints de auth.
- **Respuestas estándar**: sobre uniforme `{ success, statusCode, message, data, meta? }` para éxitos y `{ success, statusCode, message, errors, timestamp, path }` para errores.
- **Correos**: proveedor **seleccionable por configuración** (`MAIL_PROVIDER`): [EnvíaloSimple Transaccional](https://envialosimple.com/es-int/transaccional) (por defecto) o [Resend](https://resend.com), detrás de un puerto `MailProvider`. Cambiar de proveedor es cambiar una variable de entorno, sin tocar código. Se usan para activación de cuenta, reset de contraseña y notificación del formulario de contacto.
- **Base de datos**: PostgreSQL con TypeORM.
- **Docker**: imagen multi-stage, usuario no-root, healthcheck, y configuración dev/prod separada.

## 📦 Formato de respuestas

Todas las respuestas exitosas se envuelven en un sobre estándar mediante un interceptor global. El `message` de nivel superior se define por endpoint con el decorador `@ResponseMessage('...')`.

### Éxito (objeto simple)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Usuario obtenido correctamente",
  "data": { "id": "uuid", "email": "user@example.com", "name": "Ana", "surname": "Pérez" }
}
```

### Éxito (lista paginada)

Para endpoints paginados, devolvé un `PaginatedResult` con el helper `paginate()`; el interceptor agrega el `meta` completo y las URLs de navegación (preservando los demás query params):

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Lista de productos obtenida",
  "data": [ { "id": 1, "name": "Teclado Mecánico" }, { "id": 2, "name": "Ratón Inalámbrico" } ],
  "meta": {
    "totalItems": 145,
    "itemsPerPage": 10,
    "currentPage": 2,
    "totalPages": 15,
    "hasNextPage": true,
    "hasPrevPage": true,
    "nextPageUrl": "/api/products?limit=10&page=3",
    "prevPageUrl": "/api/products?limit=10&page=1"
  }
}
```

### Error

Los errores los formatean los Exception Filters e incluyen `timestamp` y `path` para trazabilidad:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "La contraseña debe tener al menos 8 caracteres...",
  "errors": ["...", "..."],
  "timestamp": "2026-07-17T14:38:35.432Z",
  "path": "/api/auth/activate"
}
```

### Cómo escribir un endpoint estándar

```ts
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { paginate } from '@/common/utils/pagination.util';

@Get()
@ResponseMessage('Lista de productos obtenida')
async findAll(@Query() query: PaginationQueryDto) {
    const [items, total] = await this.service.findAndCount(query);
    return paginate(items, total, query); // el interceptor arma data + meta
}
```

Para omitir el envoltorio en un endpoint puntual, usá `@IgnoreResponseInterceptor()`.

## 📋 Requisitos previos

- **Node.js** v22+ (las imágenes Docker usan `node:24-alpine`).
- **pnpm**: la versión está fijada en `package.json` (`packageManager`) y se activa con `corepack enable`.
- **PostgreSQL** (local o contenedor Docker).
- Una cuenta del proveedor de correo elegido: [EnvíaloSimple](https://envialosimple.com/es-int/transaccional) (por defecto) o [Resend](https://resend.com), con el dominio verificado.

## ⚙️ Configuración del entorno

Las variables se validan estrictamente con `Joi` (`src/config/validation.schema.ts`): si falta alguna obligatoria, la app **no arranca**. Creá `.env.dev` y `.env.prod` en la raíz (ambos ya están en `.gitignore`).

### `.env.dev` (desarrollo)

`.env.example` es la lista completa y comentada de las variables, y se mantiene
sincronizada con el schema por un test (`validation.schema.spec.ts`). Copiala y
completá los huecos:

```bash
cp .env.example .env.dev
```

Lo que hay que completar a mano para desarrollo:

| Variable | Qué poner |
|---|---|
| `JWT_SECRET` | `openssl rand -hex 32` (uno distinto por entorno) |
| `ENVIALOSIMPLE_API_KEY` | La API key del dominio en EnvíaloSimple. Con `MAIL_PROVIDER=resend`, va `RESEND_API_KEY` en su lugar |
| `MAIL_FROM_EMAIL` | Una casilla de un dominio verificado en el proveedor |
| `ADMIN_EMAIL` | Tu casilla: ahí llega la invitación del admin inicial |
| `CONTACT_INBOX_EMAIL` | Casilla que recibe los mensajes del formulario de contacto |
| `GESTION_API_TOKEN` | El token que entrega Gestión Petrogas para el puente de postulaciones. **Es un secreto**: vive solo en el `.env`, nunca llega al frontend |
| `DATABASE_*` | Credenciales de tu Postgres local o del contenedor |

Las demás traen valores de desarrollo que funcionan tal cual. `LINKEDIN_FETCH_MODE=stub`
usa posteos de ejemplo, así que las credenciales de LinkedIn pueden quedar vacías.

> **`JWT_SECRET` debe tener al menos 32 caracteres.** Si falta alguna variable
> obligatoria, Joi las lista **todas juntas** al arrancar, con su nombre.

### `.env.prod` (producción)

Misma estructura, con `NODE_ENV=production`, un `JWT_SECRET` fuerte, credenciales de BD robustas, `DATABASE_HOST=db` (nombre del servicio en Docker) y un dominio verificado en `MAIL_FROM_EMAIL`. `MAIL_FROM_EMAIL`, `FRONTEND_URL` y `ADMIN_EMAIL` son **obligatorias**, y la API key del proveedor activo también lo es **condicionalmente**: con `MAIL_PROVIDER=envialosimple` se exige `ENVIALOSIMPLE_API_KEY`; con `resend`, `RESEND_API_KEY`. Joi bloquea el arranque con un mensaje explícito si falta la que corresponde.

**Cambiar de proveedor de correo:** poner `MAIL_PROVIDER=envialosimple` o `resend`, cargar su API key y reiniciar. El contenido de los correos y el resto del backend no cambian: cada proveedor es un adaptador del puerto `MailProvider` (`src/mail/providers/`). Nota: **solo Resend soporta claves de idempotencia**; con EnvíaloSimple ese campo se ignora (un reintento podría duplicar el correo).

## 👤 Admin inicial y alta de usuarios

No hay registro público. El acceso se gestiona así:

1. **Seed del admin**: al primer arranque, si no existe ningún admin, se crea una cuenta **pendiente** con `ADMIN_EMAIL` y se le envía un correo de activación. El admin abre el enlace (`/activate?token=...`) y define su **nombre, apellido y contraseña**. No hay contraseña de admin en variables de entorno.
   - Si el correo no llegara (o el token de 48 h expiró), generá un enlace nuevo desde la terminal:
     ```bash
     pnpm admin:link admin@petrogassa.com
     ```
2. **Alta de usuarios** (admin autenticado): `POST /api/auth/users` con `{ "email": "...", "roles": ["user"] }` (roles opcional; el admin puede crear otros admins). Se crea la cuenta pendiente y se envía la invitación.
3. **Activación** (el invitado): `POST /api/auth/activate` con `{ "token", "name", "surname", "password" }`. La cuenta queda activa y ya puede iniciar sesión.
4. **Reenvío de invitación** (admin): `POST /api/auth/users/:id/resend-activation`.

## 🚀 Ejecución en desarrollo

Recomendado: base de datos en Docker, backend en tu máquina. Los archivos se guardan en la carpeta local que indique `STORAGE_PATH` (se crea sola; está en `.gitignore`).

```bash
pnpm install                              # corepack activa la versión pineada de pnpm
docker compose --env-file .env.dev up -d  # base de datos
pnpm start:dev                            # backend en modo watch
```

La API queda en `http://localhost:3100/api`. La documentación Swagger (solo fuera de producción) en `http://localhost:3100/api/docs`.

> El puerto es **3100**, no el 3000 habitual de Nest: en esta máquina conviven varios proyectos y el 3000 lo ocupa otro backend. Se define con `PORT` en el `.env`.

## 🗄️ Almacenamiento de archivos (filesystem)

Las imágenes del sitio se guardan **en disco**, no en un servicio externo. En producción esa ruta es un volumen del host montado en el contenedor; en desarrollo, una carpeta local que se crea sola.

Debajo de `STORAGE_PATH` hay **una sola** carpeta, `public/`, con las imágenes y los PDFs del sitio (prefijo de key `media/`), y se publica entera por HTTP.

**No hay área privada.** Todo lo que entra al almacenamiento es público por definición: `StorageService` no sabe escribir fuera de `public/`. Los CV de las postulaciones no tocan disco —van directo a Gestión Petrogas—, así que hoy no hace falta. Si mañana hay que guardar algo que no deba publicarse, requiere **código nuevo**, no elegir otro prefijo de key.

- El backend sirve `public/` como estáticos con `Cache-Control: public, max-age=1y, immutable`. Es seguro cachear tan agresivo porque cada archivo tiene un nombre UUID irrepetible: al reemplazar una imagen cambia la key, así que **el contenido de una URL nunca cambia**.
- `MEDIA_PUBLIC_BASE_URL` define la base de las URLs que se guardan/devuelven. Es **obligatoria y sin valor por defecto**: en producción tiene que apuntar al dominio real, o las entidades quedan guardando URLs a `localhost`. Normalmente es el propio backend; si mañana un **nginx o un CDN** sirven esa misma carpeta, se apunta esa variable ahí y **no hay que tocar código**.
- Las keys en la base siguen con el mismo formato que tenían con S3 (`media/2026/07/<uuid>.webp`), así que el contenido ya cargado sigue siendo válido.
- La escritura es **atómica** (archivo temporal + `rename`): un lector nunca ve un archivo a medio escribir, ni siquiera si la escritura es lenta o el proceso muere a mitad de camino.
- Las keys se validan contra **path traversal**: una key con `..` o una ruta absoluta no puede salir de la raíz pública. Es un riesgo propio del filesystem que con S3 no existía.

**Al desplegar:** por defecto el volumen cae en `../data/storage`, junto al proyecto y **fuera de todo docroot**. `HOST_STORAGE_PATH` solo hace falta para llevarlo a otro disco o a un montaje de red, y en ese caso tiene que ser una ruta **absoluta**.

Dos cosas que se pagan caro si se pasan por alto:

- El contenedor corre como **usuario no root, UID 1000**, así que esa carpeta del host tiene que dejarlo escribir. Conviene **crearla a mano antes del primer arranque**: si la crea Docker queda de `root` y las subidas fallan sin aviso hasta que alguien las prueba.
- Esa carpeta **entra en el esquema de backups**, junto con la base. Ahí viven las imágenes del sitio: si se pierde, la base queda apuntando a archivos que no existen.

## 📦 Ejecución en producción (Docker)

La forma verificada de desplegar es con Docker. La interpolación de `${VARIABLES}` en Compose **no** lee `env_file`, así que hay que pasar `--env-file`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

La documentación Swagger queda **deshabilitada** en producción.

### Qué levanta, y de dónde sale cada imagen

Son **tres servicios** y **dos Dockerfiles**, uno por proyecto. La base de datos no se construye: se usa la imagen oficial.

| Servicio | Imagen | Puerto en el host |
|---|---|---|
| `backend` | `backend/Dockerfile`, etapa `production` | `127.0.0.1:3100` |
| `frontend` | `frontend/Dockerfile` (React compilado + nginx) | `127.0.0.1:3101` |
| `db` | `postgres:17-alpine`, oficial | ninguno |

La imagen del backend es liviana, corre como **usuario no root** y trae `HEALTHCHECK`.

El compose vive **solo en este repositorio** y es el único archivo que hay que invocar, pero construye el frontend usando `../frontend` como contexto. Por eso los dos proyectos tienen que estar **uno al lado del otro** en el servidor:

```
app-2026/
├── backend/    <- este repositorio (acá está el compose)
├── frontend/   <- repositorio del frontend
└── data/       <- base de datos e imágenes subidas
```

Los tres servicios escuchan **solo en loopback**: el despliegue asume un nginx en el host que termina TLS y hace de proxy.

> **Por qué el frontend está en el compose del backend.** Este archivo no es "del backend": es el que orquesta el despliegue completo, y tiene que vivir en algún repositorio. Puesto acá, desplegar es **un solo comando** y el frontend se construye solo.
>
> La alternativa era un compose en la carpeta padre, por encima de los dos proyectos. Es más prolijo conceptualmente —ninguno de los dos manda sobre el otro— pero crea un tercer archivo que **no pertenece a ningún repositorio**, que nadie versiona y que alguien tiene que acordarse de copiar al servidor y de mantener sincronizado. Se eligió el acoplamiento a conciencia: es visible en una línea (`context: ../frontend`) y se paga una sola vez, al ubicar las carpetas.
>
> El precio concreto de esta decisión es que **este repositorio no se despliega solo**: sin la carpeta hermana, `docker compose build` falla.

### Consideraciones del frontend

**`VITE_API_URL` es una variable de BUILD, no de runtime.** Vite la incrusta dentro del JavaScript al compilar, así que cambiarla exige **reconstruir la imagen**; reiniciar el contenedor no hace absolutamente nada. Por eso va en `args` del compose y no en `environment`.

Tiene que ser **absoluta, con el prefijo `/api` y sin barra final** (`https://petrogassa.com/api`). El `/api` relativo que se usa en desarrollo no sirve acá, y el motivo es que esa misma variable tiene un segundo consumidor:

**El build consulta la API.** Después de `vite build`, `scripts/prerender.mjs` le pide al backend los servicios y las novedades para escribir en cada HTML las etiquetas de vista previa de LinkedIn y WhatsApp, que son robots que no ejecutan JavaScript. Ese `fetch` corre en Node, que exige una URL absoluta: con una relativa falla.

**Si la API no responde, el build NO falla**: avisa y sigue. Se pierden las vistas previas de las páginas de detalle, no el despliegue.

Eso tiene una consecuencia práctica el día del estreno, cuando el dominio todavía apunta al sitio anterior: la primera construcción muestra ese aviso, y **una vez que nginx apunta al sitio nuevo conviene reconstruir el frontend** para que las vistas previas se generen.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build frontend
```

Por lo mismo, esas etiquetas **quedan congeladas en el momento del build**. Si se publica una novedad y se quiere que se vea con foto y título al compartirla, hay que reconstruir esa imagen.

### Qué tiene que repartir el nginx del host

| Ruta | A dónde |
|---|---|
| `/api/...` | backend |
| `/media/...` | backend (imágenes subidas) |
| `/sitemap.xml` | backend (se genera solo, y va fuera del prefijo `/api`) |
| todo lo demás | frontend |

Con `client_max_body_size` de al menos **12 MB** —el archivo más grande admitido son 10 MB— y las cabeceras `X-Forwarded-*`. Esas cabeceras no son cosmética: el backend confía en el proxy para conocer la IP real de cada visitante, que es con lo que limita los intentos de inicio de sesión. Sin ellas, todos comparten un mismo cupo.

Ver logs:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend
```

> **Nota sobre el build:** `nest build` usa `tsconfig.build.json` (excluye `test/` y `*.spec.ts`), por lo que la salida es siempre `dist/main.js`, tanto localmente como en Docker. `pnpm start:prod` funciona en ambos casos.

## 💾 Respaldos

`ops/backup.sh` respalda las dos cosas que no se pueden reconstruir: la **base
de datos** y los **archivos subidos** desde el panel.

Se programa en el crontab del usuario que despliega. **No necesita root.**

```
0 3 * * * /ruta/al/backend/ops/backup.sh >> /ruta/a/data/backups/backup.log 2>&1
```

Deja en `data/backups/` un `.sql.gz` y un `.tar.gz` por corrida, y borra los de
más de 30 días (`BACKUP_RETENTION_DAYS` lo cambia).

**Por qué solo eso.** Las postulaciones nunca tocan este servidor: se reenvían a
Gestión y el CV se descarta. Los mensajes de contacto llegan completos al buzón
de la empresa por correo. Lo que sí es irrecuperable es el **registro de cambios
y las revisiones** —el rastro que pide la certificación, que no existe en ningún
otro lado— y el **contenido editado del sitio**. Ojo con una confusión fácil: el
seed inicial **no es un respaldo**, solo repone la línea de base (dos servicios y
tres certificaciones), y no repone ninguna imagen.

**Por qué también los archivos.** Sin ellos la base queda apuntando a imágenes
que no existen, así que el sitio no se ve "de fábrica": se ve roto.

El script se niega a guardar un volcado vacío o corrupto, y escribe con nombre
temporal hasta terminar, así que nunca queda un archivo a medio hacer con cara
de respaldo bueno. El `pg_dump` corre **dentro** del contenedor y toma las
credenciales de su propio entorno: no hay ninguna contraseña escrita en el
script.

### Restaurar

```bash
./ops/restaurar.sh                          # lista lo disponible
./ops/restaurar.sh <archivo.sql.gz>         # muestra qué haría, sin tocar nada
./ops/restaurar.sh <archivo.sql.gz> --confirmar
```

Sin `--confirmar` no modifica nada. Con él, detiene el backend —si la aplicación
sigue conectada, el `DROP TABLE` del volcado se queda esperando y la
restauración cuelga—, restaura y lo vuelve a levantar. Para reponer también las
imágenes se le pasa el `.tar.gz` de la misma fecha.

## 🗃️ Migraciones de base de datos

`synchronize` de TypeORM solo está activo en **desarrollo**; en producción está apagado a propósito (nunca se auto-ajusta el esquema contra una base real). El esquema en producción se crea y actualiza **solo con migraciones**.

**En producción es automático:** el `CMD` de la imagen (etapa `production` del Dockerfile) corre las migraciones pendientes antes de arrancar la app (`migration:run:prod && node dist/main.js`). Es idempotente —TypeORM registra en la tabla `migrations` cuáles ya se aplicaron— así que reiniciar o redesplegar el mismo contenedor no repite nada. Si una migración falla, el contenedor **no arranca la app** (evita correr contra un esquema a medio actualizar); revisá `docker compose logs backend`.

**Al cambiar una entidad en desarrollo**, generá la migración correspondiente (compara las entidades contra el estado real de la base):

```bash
pnpm migration:generate src/database/migrations/NombreDescriptivo
pnpm migration:run       # aplica en tu base de dev
```

Otros comandos: `pnpm migration:revert` (deshace la última), `pnpm migration:show` (lista aplicadas/pendientes), `pnpm migration:create <nombre>` (migración vacía para SQL manual, ej. backfills de datos). **Commiteá siempre el archivo de migración generado** junto con el cambio de entidad que lo motivó.

## 🛡️ Seguridad (resumen del template)

- **Sin registro público**: alta solo por invitación de un admin; admin inicial sembrado sin contraseña en env.
- Tokens (refresh, activación, reset) **hasheados con SHA-256** en la base de datos.
- **Rotación** de refresh tokens con **detección de reutilización** → revocación total de sesiones ante robo.
- Cambio/reset de contraseña **revoca todas las sesiones** e invalida los access tokens previos (`passwordChangedAt`).
- Cookies `HttpOnly` + `SameSite=Strict` + `Secure` (prod); refresh acotado a `Path=/api/auth`.
- `helmet`, `trust proxy` (solo en prod) y **rate limiting global** (estricto en `/auth`; 3/min en `forgot-password`).
- Anti-enumeración por timing en el login; respuesta neutra en `forgot-password`.
- Protección contra **mass assignment** (whitelist en el `ValidationPipe`) e **IDOR** en `/users/:id`.
- JWT con `issuer`/`audience` validados.
- Docker: imagen no-root, sin exponer el puerto de la BD, `no-new-privileges`, secretos fuera de la imagen.

## 🔌 Notas de integración (Frontend)

> 📘 **Guía completa para el equipo de frontend: [`FRONTEND.md`](FRONTEND.md)** —
> explica la finalidad del backend, la lógica de negocio, los flujos, las
> convenciones (sobre de respuesta, cookies, paginación, errores), el mapa de
> endpoints por pantalla y los formularios multipart. Lo de abajo es el resumen.

Este proyecto entrega los tokens en cookies `HttpOnly`. Para que el frontend se autentique:

1. `FRONTEND_URL` debe coincidir exactamente con la URL del cliente (para CORS con credenciales), **sin barra final**.
2. Configurá el cliente HTTP para enviar credenciales siempre:
    - **Axios**: `axios.defaults.withCredentials = true;`
    - **Fetch**: `fetch(url, { credentials: 'include' })`
3. El `statusCode` viene en el cuerpo de la respuesta (útil, por ejemplo, para toasts), además del status HTTP.
4. El frontend debe implementar **dos páginas** a las que apuntan los enlaces de los correos:
    - `/activate?token=...` → formulario de **nombre, apellido y contraseña**; llama a `POST /api/auth/activate` con `{ "token", "name", "surname", "password" }`.
    - `/reset-password?token=...` → formulario de nueva contraseña; llama a `POST /api/auth/reset-password` con `{ "token", "newPassword" }`.
5. El alta de usuarios y el reenvío de invitaciones son acciones de **admin** (`POST /api/auth/users`, `POST /api/auth/users/:id/resend-activation`).

## 🗂️ Contenido dinámico (CMS de la landing)

El backend gestiona el contenido del sitio.

> ℹ️ **Postulaciones: las maneja Gestión Petrogas.** El sitio expone el formulario "Trabajá con nosotros" en las mismas rutas de siempre, pero **no guarda nada**: reenvía la postulación y el CV a la API de Gestión (servidor a servidor, con `GESTION_API_TOKEN`) y no queda copia de este lado. Los **puestos** también salen de Gestión. El **catálogo de títulos académicos sí es del sitio** y RRHH lo administra desde el panel.
 Roles: **admin** (todo) y **rrhh** (títulos académicos, novedades y subida de imágenes). Los endpoints `GET` de contenido son públicos; el CRUD requiere sesión.

| Recurso | Endpoints clave | Quién |
|---|---|---|
| Servicios (+items) | `GET /api/services`, `GET /api/services/:slug` · CRUD | admin |
| Certificaciones | `GET /api/certifications` · CRUD (con `certificatePdf` descargable) | admin |
| Clientes (index) | `GET /api/clients` · CRUD | admin |
| Novedades/Prensa | `GET /api/news` (paginado, filtros `category`/`featured`) · `GET /api/news/:slug` · CRUD + borradores · **curaduría LinkedIn** (`/api/news/linkedin/*`) · **destacada única** (marcar una des-marca la anterior, atómico) | admin, rrhh |
| Puestos | `GET /api/recruitment/job-profiles` (público) — **puente a Gestión**, sin administración local | — |
| Títulos (catálogo) | `GET /api/recruitment/degree-titles` (público, autocompletado) · CRUD + papelera | admin, rrhh |
| Postulaciones | `POST /api/recruitment/applications` (público, multipart con CV) — **puente a Gestión**, no se guarda nada | — |
| Contacto | `POST /api/contact` (público) · bandeja paginada | admin |
| Media | `POST /api/media/uploads` (imágenes) · `POST /api/media/documents` (PDF público) → `{key, url}` | admin, rrhh |
| Config del sitio | `GET /api/site-settings` (público, cacheable; marca de certificación BV del footer + texto de alcance) · `PATCH` (singleton, upsert) | admin |
| Imágenes del sitio | `GET /api/site-settings/images` (público, cacheable; banners de cabecera de las páginas fijas y fotos del inicio, por **slot**) · `PATCH` (`{ slot, imageKey }`; null limpia) | admin |

**Almacenamiento (filesystem):**
- Área **pública**: imágenes de contenido y **documentos PDF públicos** (p. ej. certificados ISO). Se guarda la **key** en la DB y la API devuelve URLs absolutas armadas con `MEDIA_PUBLIC_BASE_URL`. Imágenes por `POST /media/uploads` (PNG/JPEG/WebP, 4 MB); PDFs por `POST /media/documents` (10 MB).
- Ya **no hay área privada**: los CVs no se guardan (van directo a Gestión Petrogas). El almacenamiento administra solo la carpeta pública.
- Todo archivo se valida por **magic bytes** (tipo real, no el mimetype declarado): PNG/JPEG/WebP (SVG prohibido) y PDF.
- `DELETE /api/media/uploads` solo borra archivos **huérfanos**: si alguna entidad referencia la key (incluso una en la papelera), responde 409.

**Formulario de postulación** (`POST /api/recruitment/applications`, multipart): nombre y apellido, título, localidad, teléfono, email, **selección múltiple de puestos** y el CV en PDF. Este backend **no guarda nada**: arma el multipart y se lo reenvía a Gestión Petrogas tal cual, CV incluido. Los puestos también son de ellos (`GET /api/recruitment/job-profiles` es un puente) y sus ids son **numéricos**.

Las reglas del formulario —qué es obligatorio, qué largo tiene cada campo, qué combinaciones valen— las define **Gestión**, y acá no se duplican a propósito: duplicarlas garantiza que tarde o temprano queden desfasadas. Cuando algo no pasa, ellos responden **422 con el detalle por campo** y el frontend lo muestra (ver `GestionClient.fallo`).

Este backend valida solo cuatro cosas, y cada una por un motivo propio: que el CV **esté** (400), que **no supere los 5 MB** (413), que sea **un PDF de verdad** y **sin contenido activo**, y que no se elijan **más de 3 puestos** (422).

Las dos del CV no son reglas del formulario: son un control sobre lo que sale de esta red firmado con `GESTION_API_TOKEN`. Que un archivo sea un CV aceptable lo decide Gestión; que un binario arbitrario no salga hacia ellos etiquetado como PDF con nuestra firma lo decidimos nosotros. Y el máximo de puestos sí es una regla del negocio: el frontend también la aplica, pero un límite que solo vive en el navegador se saltea con `curl`.

**Ojo:** verificar el tipo **no es un antivirus**. Corta el archivo mislabeleado y el JavaScript embebido evidente; un PDF con los objetos comprimidos puede esconderlo, y un exploit del lector no deja marcadores. Si hiciera falta una defensa de verdad, va del lado donde el archivo se guarda y se abre, que es Gestión.

**Campo "Título" (catálogo propio + texto libre):** el catálogo `degree_titles` **sí** es local y lo administra RRHH desde el panel (`GET /api/recruitment/degree-titles`, público, para el autocompletado). Está sembrado con ~141 títulos del rubro, agrupados en 6 niveles educativos: primario, secundario común, secundario técnico, terciario, universitario y formación profesional. El formulario manda `degreeTitleId` y `degreeTitleName` si el postulante eligió uno de la lista, o `degreeTitleOther` si escribió uno que no está. El catálogo es un *snapshot* propio: el autocompletado nunca depende de un tercero.

**Seeds del primer arranque** (solo actúan si la tabla está vacía —contando la papelera—, así nunca pisan lo editado desde el panel):
- `CatalogSeedService` — **catálogo de títulos educativos** de RRHH: ~141 entradas. Sin él el autocompletado del formulario público queda vacío. Los puestos ya no se siembran: los sirve Gestión Petrogas.
- `ContentSeedService` — **contenido editorial** con los textos reales de Petrogas: 2 servicios (Operación y Mantenimiento, Transporte de Personal) y 3 certificaciones (ISO 9001, 14001 y 45001). **No** incluye Well Testing ni la ISO 39001 de transporte, dados de baja por la empresa.

## 📋 Registro de cambios y revisión del sitio

Control de documentos de la certificación: **todo cambio sobre el contenido queda asentado** —quién, cuándo, qué campo y qué decía antes— y se exporta a Excel desde el panel (`GET /api/change-log/export`). Lo ven el **admin** y el **auditor**.

El footer muestra un `Rev. NN` de dos dígitos que **sube solo: una revisión por cada día en que se cambió algo** (01, 02 … 99, y a los tres dígitos vuelve a 01). No hay endpoint que lo escriba, y eso es deliberado — un número que se puede editar a mano no prueba nada. Sale en `GET /api/site-settings`, junto a la marca de certificación.

Tres decisiones que conviene conocer antes de tocar esto:

- **Se captura con un subscriber de TypeORM, no con llamadas en cada servicio.** Eran ~36 sitios donde olvidarse no rompe nada: un asiento que falta es invisible hasta que alguien pregunta. El actor lo aporta un `AsyncLocalStorage` que abre un middleware (`change-log/audit-context.middleware.ts`); tiene que ser middleware y no interceptor, y el archivo explica por qué.
- **Sin contexto de request no se registra nada.** Con esa sola regla quedan afuera las siembras del primer arranque —que son la línea de base, la Rev. 00— y las tareas de fondo, sin código especial para cada caso.
- **El asiento se escribe en la misma transacción que el cambio.** Si el registro falla, el cambio se revierte. Para un rastro de auditoría es la propiedad correcta: un cambio sin asentar es peor que un cambio que no ocurrió, porque después no hay forma de distinguirlo de "no se tocó nada".

Qué entidad se audita y con qué campos se declara en **un solo lugar**, `src/change-log/audited-entities.ts`. Si agregás una entidad de contenido y no la clasificás ahí, `audited-entities.spec.ts` falla.

**Clientes y novedades no se siembran**: no hay contenido "de fábrica" para ellos, se cargan desde el panel.

**Novedades desde LinkedIn (curaduría)**: no todo lo que se publica en LinkedIn va a la web. Un job de sincronización (`POST /api/news/linkedin/sync`) trae los posteos de la página a una **bandeja de candidatos** (`linkedin_imports`, tabla de staging); admin/rrhh **aprueba** los que quiera (`.../imports/:id/approve` con `category`) — se copia el contenido a `news_posts`, se descarga la imagen al almacenamiento y se publica — o los **rechaza**. El dedupe por `externalId` garantiza que lo ya aprobado o rechazado **no reaparezca** en la cola. La parte pública (`GET /api/news`) no cambia: las notas aprobadas salen ahí con `source: "linkedin"` y `externalUrl` al post original.
- **Modo `stub`** (por defecto): usa posteos de ejemplo, sin llamar a LinkedIn. Sirve para desarrollar y probar todo el circuito de curaduría **sin depender del acceso real**.
- **Modo `api`**: usa la **Community Management API** de LinkedIn. Requiere: (1) una app de desarrollador asociada a la página de empresa, (2) ser **admin** de esa página, (3) que **LinkedIn apruebe** el acceso al producto (revisión de negocio; puede tardar o denegarse), y (4) completar `LINKEDIN_ACCESS_TOKEN` + `LINKEDIN_ORGANIZATION_URN`. Sin credenciales, `sync` en modo `api` responde **503** con un mensaje claro; el resto del flujo (cola, aprobar, rechazar) funciona igual. Pendientes conocidos para cuando haya acceso real: renovación automática del token OAuth (hoy es un token estático de ~60 días) y ajuste fino del mapeo de imágenes de la Posts API.

> **Refrescar un catálogo sembrado en desarrollo** (p. ej. tomar títulos nuevos): el seed solo actúa si la tabla está vacía, así que hay que vaciarla y reiniciar la app: **`DELETE FROM degree_titles;`**.

**Papelera (soft delete) del catálogo**: el catálogo de contenido (servicios, certificaciones, clientes, novedades y títulos) usa **borrado recuperable**. `DELETE /api/<recurso>/:id` no destruye: setea `deletedAt` y manda a la papelera; TypeORM lo excluye automáticamente de todas las consultas (find y QueryBuilder). Endpoints extra por recurso: `GET /<recurso>/admin/trash` (ver borrados), `POST /<recurso>/:id/restore` (restaurar) y `DELETE /<recurso>/:id/permanent` (borrado físico definitivo — recién ahí se limpia el almacenamiento). La **visibilidad** (`isActive`/`isPublished`) es independiente: ocultar no es borrar, y `restore` **preserva** ese estado (una nota publicada vuelve publicada). Un item en la papelera **reserva su slug/nombre único**: crear otro igual da **409 con un `conflict: { id, field, value, inTrash }`** en el cuerpo, para que el panel ofrezca restaurar o eliminar definitivamente el bloqueante (ver `unique-conflict.util.ts`). Gracias a esa reserva, **restaurar nunca falla por duplicado**. La papelera **no se purga automáticamente**: queda hasta el borrado definitivo manual. Se implementa con una base `SoftDeletableEntity`; **no** se aplica a datos personales (mensajes de contacto) ni a tokens, que se borran físico. Garantías adicionales: (1) los **slugs son estables** — editar el título de una nota/servicio no cambia la URL (el slug solo cambia si se envía explícito); (2) `DELETE /media/uploads` **solo borra huérfanos** — 409 si alguna entidad (incluso en papelera) referencia la key; (3) al reemplazar una imagen, la key vieja se borra del almacenamiento **después** del save exitoso (nunca queda una entidad apuntando a un archivo borrado).

**Postulaciones y CVs**: no se guardan en el sitio. El formulario los reenvía a Gestión Petrogas en el mismo request, así que la retención de esos datos personales es responsabilidad de ellos.

## 🐳 Plantillas de Docker

La carpeta `docker-templates/` contiene versiones genéricas y reutilizables del `Dockerfile` y los `docker-compose` (dev/prod) con el mismo endurecimiento aplicado aquí. Ver `docker-templates/README.md` para el detalle de uso.
