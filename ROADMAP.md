# Petrogassa · Backend — Roadmap y checklist

Estado consolidado del backend: qué se implementó, el modelo de datos completo
(entidades, relaciones, enums) y qué queda pendiente. Marcá con `[x]` a medida
que avances en lo pendiente.

Leyenda: ✅ hecho y verificado en vivo · ⬜ pendiente · 🔜 futuro (fuera del alcance actual)

## 0. Dependencias

Todas actualizadas a la última versión estable, con una única excepción
deliberada:

- **`typescript` fijado en `6.0.3`** (no la última, `7.0.2`). `ts-jest@29.x`
  declara `"typescript": ">=4.3 <7"` como peer dependency — TS 7 rompe el
  pipeline de tests. Revisar este pin cuando `ts-jest` publique soporte para
  TS 7 (`pnpm outdated` lo va a marcar siempre; es esperado).
- El resto (NestJS 11.1.28, TypeORM 1.1.0, ESLint 10, `@types/node` 26,
  Joi, pg, resend, etc.) está en la última versión publicada, verificado con
  `pnpm outdated` contra el registro real de npm.
- Ajustes de config que salieron de estos upgrades (breaking changes reales,
  no bugs propios): `tsconfig.json` sin `baseUrl` (removido en TS7; `paths`
  ahora usa `./src/*` relativo), `"types": ["node", "jest"]` explícito
  (`moduleResolution: nodenext` dejó de incluir `@types/*` implícitamente),
  `"rootDir": "./src"` + `"exclude": ["test"]` explícitos (TS exige rootDir
  ahora), y `test/tsconfig.json` nuevo + `eslint.config.mjs` con
  `parserOptions.project` como array (para que ESLint pueda tipar
  `test/app.e2e-spec.ts`, excluido del tsconfig principal). De paso se
  corrigió un bug preexistente en `test/jest-e2e.json` (`rootDir` mal
  calculado rompía el alias `@/` en el e2e) y se agregó `*.tsbuildinfo` al
  `.gitignore` (una caché vieja causó un build silencioso sin salida).
- Verificado tras cada bump: `tsc`, lint, `pnpm test` (32/32), `pnpm build`, y
  al final un ciclo completo en Docker (build de imagen prod + arranque en
  DB vacía + reinicio idempotente) con **todas** las dependencias juntas, no
  solo una por una.

---

## 1. Fases completadas

### Fase 1 — Renombrado del template ✅
- [x] `Auth Nest` / `auth-nest` → `petrogassa-landing-backend` (package.json, JWT issuer/audience, Swagger, emails, README, openapi)
- [x] `PROJECT_NAME=petrogassa-landing` (prefijo de contenedores Docker)

### Fase 2 — Endurecimiento de seguridad ✅
- [x] `NODE_ENV` obligatoria en Joi (evita synchronize/cookies inseguras por default)
- [x] Anti-enumeración por timing en login (bcrypt dummy)
- [x] `@Transform` de DTOs con type-guard (no más 500 con entradas no-string)
- [x] `email` a `varchar(254)` + `@MaxLength(254)`
- [x] Atomicidad en rotación de refresh y single-use de tokens
- [x] `passwordChangedAt` invalida access tokens previos al reset
- [x] Filtro catch-all + sobre de error uniforme (incl. 413 en español)
- [x] `ParseUUIDPipe`, filtro de unicidad sin reflejar valores, `trust proxy` solo en prod
- [x] Limpieza de tokens expirados (`TokenCleanupService`)

### Fase 3 — Modelo de acceso cerrado (sin registro público) ✅
- [x] Sin `register` público; alta solo por invitación de admin
- [x] Admin inicial sembrado desde `ADMIN_EMAIL` (sin contraseña en env)
- [x] Flujo invitación → activación (el usuario define nombre/apellido/contraseña)
- [x] `JwtAuthGuard` con 401 en español
- [x] Script `pnpm admin:link <email>` (red de seguridad de activación)

### Fase 4 — Contenido dinámico (CMS + RRHH + R2) ✅
- [x] Módulo `storage` (R2/S3, 2 buckets) + validación por magic bytes
- [x] Módulo `media` (subida de imágenes por `POST /media/uploads`, y de
      documentos PDF públicos por `POST /media/documents` — ambos al bucket
      público; el de imágenes sigue rechazando PDF)
- [x] Módulos `services`, `certifications`, `clients`
- [x] Módulo `news` (paginación, borradores, filtros)
- [x] Módulo `recruitment` (perfiles + postulaciones + CV a R2 privado)
- [x] Módulo `contact` (form público + notificación por correo)
- [x] Rol `rrhh` (reclutamiento + novedades + subir imágenes)
- [x] Seeds del primer arranque: catálogo de títulos de RRHH (~141; los puestos ahora los sirve Gestión) y contenido editorial real (2 servicios + 3 certificaciones; sin Well Testing ni la ISO 39001 de transporte, dados de baja). Clientes y novedades arrancan vacíos.
- [x] `openapi.yaml` + README sincronizados

---

## 2. Modelo de datos (entidades, relaciones y enums)

Todas las entidades extienden **BaseEntity**: `id` (uuid PK), `createdAt`, `updatedAt`.

### Autenticación / usuarios

**users** (`User`)
| Campo | Tipo | Nota |
|---|---|---|
| name | varchar(25) NULL | null hasta activar |
| surname | varchar(25) NULL | null hasta activar |
| email | varchar(254) UNIQUE | |
| password | varchar(255) NULL | `@Exclude`; null hasta activar |
| isActive | boolean = false | |
| isEmailVerified | boolean = false | |
| roles | text[] = ['user'] | enum UserRoles |
| passwordChangedAt | timestamp NULL | `@Exclude` |
- Relaciones: `1—N` → verification_tokens, `1—N` → refresh_tokens

**refresh_tokens** (`RefreshToken`)
| token (hash SHA-256, UNIQUE) · expiresAt · isRevoked=false |
- Relación: `N—1` → users (ON DELETE CASCADE)

**verification_tokens** (`VerificationToken`)
| token (hash SHA-256, UNIQUE) · type (enum) · expiresAt · isUsed=false |
- Relación: `N—1` → users (ON DELETE CASCADE)

> ⚠️ **Reclutamiento DESCONECTADO** (postulaciones en plataforma externa) y **almacenamiento migrado de Cloudflare R2 a FILESYSTEM/NFS**. El código y las tablas de `recruitment` se conservan; sus endpoints no se montan. Ver README.

### Contenido del sitio

> **Papelera (soft delete):** el catálogo de contenido (services, certifications, clients, news_posts, job_profiles, degree_titles) extiende `SoftDeletableEntity` → columna `deletedAt timestamp NULL`. El `DELETE` manda a la papelera (softRemove) y se puede restaurar; el borrado físico + limpieza de R2 es aparte (`/permanent`). TypeORM excluye los borrados de todas las consultas. NO aplica a datos personales (applications, contact_messages) ni tokens. Ver README para el detalle.

**services** (`Service`)
| title varchar(120) · slug varchar(140) UNIQUE · shortDescription text · longDescription text · cardImage/bannerImage/detailImage varchar(500) NULL (keys R2) · itemsLayout enum · sortOrder int · isActive bool |
- Relación: `1—N` → service_items (cascade, orphanedRowAction: delete → el update reemplaza toda la lista)

**service_items** (`ServiceItem`)
| label varchar(200) · spec varchar(200) NULL · icon varchar(50) NULL · sortOrder int |
- Relación: `N—1` → services (ON DELETE CASCADE)

**certifications** (`Certification`)
| title varchar(120) · subtitle varchar(120) · description text · isFeatured bool · logoImage varchar(500) NULL · certificatePdf varchar(500) NULL (key R2, bucket público; PDF descargable) · sortOrder int |

**clients** (`Client`)
| name varchar(120) · logoImage varchar(500) · sortOrder int · isActive bool |

**news_posts** (`NewsPost`)
| title varchar(200) · slug varchar(220) UNIQUE · category enum · publishedAt timestamp NULL · coverImage varchar(500) NULL · excerpt varchar(500) · body text · isFeatured bool · isPublished bool · source enum (manual/linkedin) · externalUrl varchar(500) NULL (post original en LinkedIn) |
- Índice compuesto: (isPublished, publishedAt)

**site_settings** (`SiteSettings`) — SINGLETON de configuración global (sin papelera)
| certificationMarkImage varchar(500) NULL (key R2; marca de Bureau Veritas del footer, UNA imagen con todas las normas) · certificationScopeText varchar(1000) NULL (alcance, se muestra junto a la marca — manual BV Rev. 14 §5/§7) |
- GET público cacheable (`max-age=300`), PATCH admin con upsert; campos en null si no se cargó (nunca 404). La key participa del chequeo anti-borrado de `/media/uploads`.

**site_images** (`SiteImage`) — imágenes de cabecera de las páginas fijas, por slot
| slot varchar(60) UNIQUE (kebab-case: banner-nosotros, home-hero…) · imageKey varchar(500) (key R2) |
- Filas y no columnas a propósito: sumar una página nueva es una fila desde el panel, sin migración. El backend no mantiene catálogo cerrado de slots; el frontend es dueño de la lista y tiene una imagen por defecto para cada uno.
- `GET /api/site-settings/images` público cacheable (mapa slot → URL absoluta, solo los cargados); `PATCH` admin (`{slot, imageKey}`, null limpia). La key participa del chequeo anti-borrado de `/media/uploads`.

**linkedin_imports** (`LinkedInImport`) — bandeja de curaduría (staging, NO público)
| externalId varchar(255) UNIQUE (URN, dedupe) · status enum (pending/approved/rejected) · externalUrl varchar(500) · text text · mediaUrl text NULL · authorName varchar(200) NULL · postedAt timestamp NULL · newsPostId uuid NULL (nota creada al aprobar) · reviewedAt timestamp NULL |
- Índice compuesto: (status, postedAt)

### RRHH

**job_profiles** (`JobProfile`)
| name varchar(120) UNIQUE · isActive bool · sortOrder int |

**degree_titles** (`DegreeTitle`) — catálogo de títulos educativos
| name varchar(150) UNIQUE · level enum · isActive bool · sortOrder int |
- Snapshot propio (no se consume ninguna API externa en runtime); RRHH lo amplía desde el panel

**applications** (`Application`) — **una fila por persona** (`email` UNIQUE)
| fullName varchar(120) · degreeTitleOther varchar(150) NULL (texto libre) · location varchar(120) · phone varchar(30) · email varchar(254) UNIQUE · cvKey varchar(500) `@Exclude` · cvHash varchar(64) `@Exclude` · cvOriginalName varchar(255) · cvSizeBytes int · submissionCount int = 1 |
- Relación: `N—N` → job_profiles vía join table **application_job_profiles**
- Relación: `N—1` → degree_titles (nullable, ON DELETE SET NULL). El título viene del catálogo (`degreeTitle`, filtrable) **o** como texto libre (`degreeTitleOther`), nunca ambos
- Sin flujo de estados: el panel es un listado de CVs para consultar y borrar
- `updatedAt` = última actividad → base de la purga automática por retención

### Contacto

**contact_messages** (`ContactMessage`)
| name varchar(100) · email varchar(254) · phone varchar(30) NULL · subject varchar(150) NULL · message text · status enum |

### Enums
- **UserRoles**: `user` · `admin` · `rrhh`
- **VerificationTokenType**: `account-activation` · `password-reset`
- **ServiceItemsLayout**: `bullets` · `icons` · `numbered`
- **NewsCategory**: `novedades` · `prensa`
- **ContactMessageStatus**: `nueva` · `leida`
- **DegreeTitleLevel**: `primario` · `secundario` · `secundario_tecnico` · `terciario` · `universitario` · `formacion_profesional`

### Diagrama de relaciones (texto)
```
User 1─N RefreshToken
User 1─N VerificationToken
Service 1─N ServiceItem
Application N─N JobProfile   (application_job_profiles)
Application N─1 DegreeTitle  (nullable; fallback texto libre en degreeTitleOther)
Certification / Client / NewsPost / ContactMessage : sin FKs (independientes)
```

---

## 3. Servicios de infraestructura (no-entidades)
- [x] `StorageService` — R2/S3: uploadMedia, uploadCv, presignCvDownload, delete, publicUrl
- [x] `MailService` con proveedor **enchufable** (`MAIL_PROVIDER`: envialosimple | resend) — activación, reset, notificación de contacto. EnvíaloSimple se integra por su API HTTP con `fetch` nativo, sin el SDK oficial (su capa HTTP convierte todo error 4xx en "Unable to contact API server" y se pierde el motivo real).
- [x] `AdminSeedService` — admin inicial pendiente
- [x] `ContentSeedService` — servicios y certificaciones iniciales
- [x] `TokenCleanupService` — purga de tokens expirados (cada 24 h)
- [x] Globales: ResponseInterceptor, 4 filtros de excepción, JwtAuthGuard, UserRoleGuard, ThrottlerGuard, ValidationPipe (todos como APP_* providers)

---

## 4. Pendiente / próximos pasos

### ⬜ Crítico antes de producción
- [x] **Migraciones de TypeORM** — `synchronize` sigue solo en dev (en prod
      siempre estuvo apagado). Se generó la migración inicial (13 tablas +
      join table `application_job_profiles` + 5 enums Postgres reales; `roles`
      de `users` es `text[]` a nivel app, no enum de DB) y se verificó
      **empíricamente**: `pg_dump --schema-only` de una base con
      `synchronize:true` es idéntico al de una migrada (única diferencia: la
      tabla `migrations`, esperada); un segundo `migration:generate` da "No
      changes"; `migration:revert` deshace todo. En producción, el `CMD` del
      Dockerfile corre las migraciones antes de arrancar la app —verificado en
      un contenedor real: 1er arranque crea el esquema, reinicio es
      idempotente (no duplica seeds), y una migración fallida corta la cadena
      (el contenedor no llega a levantar la app). Ver sección "Migraciones de
      base de datos" en el README para el flujo de trabajo. Migraciones
      posteriores (mismo flujo verificado): `AddPrimarioSecundarioLevels`
      (niveles del catálogo de títulos) y `AddCertificatePdfToCertifications`
      (columna `certificatePdf`, PDF descargable del certificado ISO).
- [ ] **Autenticación de dominio para email** — decidir dominio canónico (`petrogassa.com` vs `petrogassa.ar`), verificarlo en **EnvíaloSimple** (proveedor elegido), cargar DKIM + SPF + DMARC en el DNS y generar la API key del dominio (Mis Dominios → Administración del dominio → API Key). Setear `MAIL_FROM_EMAIL` a la dirección verificada y `ENVIALOSIMPLE_API_KEY`.
- [ ] Confirmar el **límite horario de envíos** del plan contratado en EnvíaloSimple (su API responde 429 "Hourly Limit Reached" al superarlo).
- [x] ~~Crear buckets R2 en Cloudflare~~ — **ya no aplica**: el almacenamiento
      pasó a FILESYSTEM/NFS y las variables `R2_*` no existen. Lo que hay que
      preparar es el **montaje NFS** y apuntar `HOST_STORAGE_PATH` ahí (ver
      README, "Almacenamiento de archivos").
- [ ] **Completar `.env.prod`.** La lista al día está en `.env.example`, y un
      test la mantiene sincronizada con el schema de validación en las dos
      direcciones. Las que hay que cargar a mano: `JWT_SECRET`,
      `ENVIALOSIMPLE_API_KEY`, `MAIL_FROM_EMAIL`, `ADMIN_EMAIL`,
      `CONTACT_INBOX_EMAIL`, `GESTION_API_TOKEN` y las `DATABASE_*`.
      `APPLICATION_RETENTION_MONTHS` y las `R2_*` ya no se leen.

### ⬜ Crítico por volumen (~1.000 postulaciones/día)
> ⚠️ **Histórico.** Todo este bloque describe el módulo de postulaciones que
> vivía en este backend. Desde el puente con **Gestión Petrogas**, acá no se
> guarda ninguna postulación ni ningún CV: el volumen, la retención, la purga de
> datos personales y la deduplicación por email son de ellos. Se conserva como
> registro de las decisiones, no como trabajo pendiente.
>
> Escala esperada en su momento: ~30.000 postulaciones/mes, ~365.000/año, con un
> PDF cada una (~1 GB/día).

- [x] Throttle del formulario público subido de 3 a **20/min por IP** (con 3/min
      se rebotaban postulantes legítimos detrás de CGNAT, ferias, oficinas)
- [x] Índice `(createdAt)` en `applications` (el panel siempre ordena por
      fecha) — verificado en Postgres
- [x] **Purga automática de CVs (PII)** — job diario que borra postulaciones y
      sus PDFs sin actividad hace más de `APPLICATION_RETENTION_MONTHS`
      (default **12 meses**). Falta agregar reglas de lifecycle en R2 como
      segunda barrera.
- [x] **Una postulación por persona (upsert por email)** — el reenvío actualiza
      datos y CV; `submissionCount` lleva la cuenta. Si el PDF es idéntico
      (SHA-256), no se vuelve a subir a R2.
- [x] **Búsqueda por nombre/email** (`?search=`) en el listado del panel
- [x] **Contadores del dashboard** — `GET /recruitment/applications/stats`
      (total, con/sin título, por título, por puesto)
- [ ] Reglas de lifecycle en R2 (segunda barrera de la purga)

### ❌ Descartado
- **Notificación por email por cada postulación** (y también el digest diario):
  a 1.000/día no aporta y satura la casilla. El panel con contadores cumple esa
  función. La notificación del formulario de **contacto** sí se mantiene: es
  otro volumen.

### ⬜ Deseable
- [ ] Endurecer DMARC a `p=quarantine`/`reject` tras monitorear con `p=none`

### ❌ Descartado (decisión explícita, no pendiente)
- **Stats del index** (1992 · 42 · 3 · N°1): se sacan de la página en lugar de
  hacerlas dinámicas. Son hechos casi todos fijos (el año de fundación no
  cambia) o copy de marketing; la sección de **clientes** ocupa ese lugar
  debajo de "servicios destacados".
- **nosotros.html** (historia, misión/visión, valores, políticas): queda
  **estático**. Es contenido institucional que se edita muy rara vez —no
  encaja en el patrón del resto del CMS (servicios/clientes/novedades/etc.,
  que cambian seguido y los toca alguien no técnico). Construir tablas + API +
  panel para esto no se justifica; si algún día cambia, se edita el HTML.

### 🔜 Futuro (fuera del alcance actual)
- [x] **Integración LinkedIn (curaduría)** — *implementado*: tabla de staging `linkedin_imports`, `POST /news/linkedin/sync` con dedupe, cola de revisión, aprobar (→ crea/publica nota + descarga imagen a R2) y rechazar. Adaptador de origen enchufable (`stub` para dev / `api` real). **Pendiente externo**: que LinkedIn apruebe el acceso a la Community Management API + credenciales; hasta entonces el modo `api` responde 503 y se opera en `stub`.
  - [ ] Renovación automática del token OAuth (hoy token estático ~60 días)
  - [ ] Ajuste fino del mapeo de imágenes de la Posts API (probar contra la API real)
  - [ ] Opcional: sync programado (cron) además del disparo manual
- [ ] **Papelera a escala** (pedido del frontend, baja prioridad): `GET /<recurso>/admin/trash` hoy devuelve un array plano sin paginar y no hay endpoint para vaciar la papelera. Con volumen bajo alcanza; si crece, agregar `page`/`limit` y un purge masivo (`DELETE /<recurso>/admin/trash`).
- [ ] Escaneo antivirus de CVs subidos
- [ ] Catálogo de media / limpieza de imágenes huérfanas en R2

### 🔗 Fuera del backend
- [ ] Frontend: consumir la API (páginas `/activate` y `/reset-password`, forms de contacto y RRHH en multipart). Guía completa para el frontend en `FRONTEND.md`; contrato en `openapi.yaml` / Swagger (`/api/docs` fuera de prod).

---

## 5. Referencias
- Guía de integración para el frontend: `FRONTEND.md`
- Contrato completo de la API: `openapi.yaml` (o Swagger en `/api/docs`)
- Guía de uso y envs: `README.md`
- Variables de entorno: `.env.example`
