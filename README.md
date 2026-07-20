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
- **Correos**: integración con [Resend](https://resend.com) para correos transaccionales (activación y reset).
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
- Una cuenta en [Resend](https://resend.com) para el envío de correos.

## ⚙️ Configuración del entorno

Las variables se validan estrictamente con `Joi` (`src/config/validation.schema.ts`): si falta alguna obligatoria, la app **no arranca**. Creá `.env.dev` y `.env.prod` en la raíz (ambos ya están en `.gitignore`).

> **`JWT_SECRET` debe tener al menos 32 caracteres.** Generá uno único por entorno con:
> ```bash
> openssl rand -hex 32
> ```

### `.env.dev` (desarrollo)

```env
NODE_ENV=development
PROJECT_NAME=petrogassa-landing
PORT=3000

# JWT (mínimo 32 caracteres)
JWT_SECRET=<openssl rand -hex 32>
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN_DAYS=7
VERIFICATION_TOKEN_EXPIRES_IN_HOURS=1        # expiración del token de reset
ACCOUNT_ACTIVATION_TOKEN_EXPIRES_IN_HOURS=48 # expiración del token de invitación

# Base de datos
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=petrogassa_landing_dev

# Puertos para Docker
HOST_PORT=3000
DATABASE_HOST_PORT=5432

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# URL del frontend, SIN barra final (CORS + enlaces de correos).
# No puede ser el mismo puerto que el backend (PORT).
FRONTEND_URL=http://localhost:5173

# Email del admin inicial (se siembra al arrancar si no hay ningún admin).
# NO hay contraseña de admin en env: la define él mismo al activar su cuenta.
ADMIN_EMAIL=admin@petrogassa.com
```

### `.env.prod` (producción)

Misma estructura, con `NODE_ENV=production`, un `JWT_SECRET` fuerte, credenciales de BD robustas, `DATABASE_HOST=db` (nombre del servicio en Docker) y un dominio verificado en `RESEND_FROM_EMAIL`. `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FRONTEND_URL` y `ADMIN_EMAIL` son **obligatorias** (Joi bloquea el arranque si faltan).

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

Recomendado: la base de datos en Docker y el backend en tu máquina.

```bash
pnpm install                                   # corepack activa la versión pineada de pnpm
docker compose --env-file .env.dev up -d db    # solo la BD
pnpm start:dev                                 # backend en modo watch
```

La API queda en `http://localhost:3000/api`. La documentación Swagger (solo fuera de producción) en `http://localhost:3000/api/docs`.

## 📦 Ejecución en producción (Docker)

La forma verificada de desplegar es con Docker. La interpolación de `${VARIABLES}` en Compose **no** lee `env_file`, así que hay que pasar `--env-file`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Esto construye la etapa `production` del Dockerfile (imagen liviana, **usuario no-root**, con `HEALTHCHECK`) y levanta backend + BD en una red interna. La documentación Swagger queda **deshabilitada** en producción.

Ver logs:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend
```

> **Nota sobre el build:** `nest build` usa `tsconfig.build.json` (excluye `test/` y `*.spec.ts`), por lo que la salida es siempre `dist/main.js`, tanto localmente como en Docker. `pnpm start:prod` funciona en ambos casos.

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

## 🐳 Plantillas de Docker

La carpeta `docker-templates/` contiene versiones genéricas y reutilizables del `Dockerfile` y los `docker-compose` (dev/prod) con el mismo endurecimiento aplicado aquí. Ver `docker-templates/README.md` para el detalle de uso.
