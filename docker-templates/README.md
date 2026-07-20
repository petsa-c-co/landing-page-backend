# Plantillas de Docker para NestJS

Esta carpeta contiene plantillas genéricas de Docker listas para reutilizar en tus proyectos de NestJS.

---

## Archivos incluidos

| Archivo                   | Descripción                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `Dockerfile.nestjs`       | Dockerfile multi-stage para NestJS (etapas: base, development, builder, production) |
| `docker-compose.dev.yml`  | Plantilla de docker-compose para desarrollo (solo BD PostgreSQL)                    |
| `docker-compose.prod.yml` | Plantilla de docker-compose para producción (backend + BD)                          |
| `.dockerignore`           | Archivo para ignorar archivos innecesarios en los contenedores                      |
| `.env.example`            | Plantilla de variables de entorno (copia y renombra a .env.dev o .env.prod)         |

---

## Cómo usar estas plantillas

1. **Copia los archivos** a la raíz de tu proyecto:

   ```bash
   # PowerShell
   Copy-Item * .. -Recurse

   # Linux/macOS
   cp * ../
   ```

2. **Renombra los archivos** según tu proyecto:
   - `Dockerfile.nestjs` → `Dockerfile`
   - `docker-compose.dev.yml` → `docker-compose.yml` (para desarrollo local)
   - `docker-compose.prod.yml` → `docker-compose.prod.yml`
   - `.env.example` → `.env.dev` (para desarrollo) Y `.env.prod` (para producción)

3. **Edita y adapta**:
   - Cambia los nombres de contenedores (`container_name`)
   - Ajusta las variables de entorno en `.env.dev` y `.env.prod`
   - Modifica volúmenes, redes y recursos según tus necesidades
   - Ajusta la ruta del `HEALTHCHECK` en el Dockerfile a un endpoint real de tu API

> **Importante:** el Dockerfile copia `.npmrc`, `.pnpmfile.cjs` y `pnpm-workspace.yaml`
> junto a `package.json`/`pnpm-lock.yaml` porque el lockfile congelado valida el
> checksum del pnpmfile y esos archivos habilitan la compilación de módulos nativos
> (p. ej. `bcrypt`). Si tu proyecto no los usa, quítalos del `COPY`.

---

## Desarrollo local (recomendado): Solo BD en Docker

Para desarrollo local, **no necesitas Docker para el backend**—usa Docker solo para la BD PostgreSQL:

### 1. Configura tu `.env.dev`:

- Cambia `DATABASE_HOST` a `localhost` (porque el backend corre en tu PC, la BD en Docker):
  ```dotenv
  DATABASE_HOST=localhost
  ```

### 2. Levanta solo la BD con Docker:

```bash
docker compose --env-file .env.dev up -d
```

### 3. Corre el backend directamente en tu PC:

```bash
pnpm run start:dev
```

### 4. Comandos para la BD:

```bash
# Ver logs de la BD
docker compose --env-file .env.dev logs -f db

# Detener la BD
docker compose --env-file .env.dev down

# Detener y borrar datos de la BD (usa con precaución!)
docker compose --env-file .env.dev down -v
```

---

## Deploy a producción: Paso a paso

### 1. Prepara tu servidor/VPS:

- Instala Docker y Docker Compose
- Asegúrate de tener acceso SSH

### 2. Sube tu código al servidor:

Clona tu repositorio (¡nunca subas `.env.prod` a Git!):

```bash
git clone TU_URL_DE_REPOSITORIO.git
cd TU_CARPETA_DE_PROYECTO
```

### 3. Crea tu `.env.prod` en el servidor:

Crea el archivo manualmente o usa `scp` para subirlo desde tu PC. Asegúrate de:

- Usar credenciales seguras para la BD
- Usar un `JWT_SECRET` fuerte y aleatorio
- `DATABASE_HOST` debe ser `db` (nombre del servicio en Docker)

### 4. ¡Deploya!

Solo necesitas **este único comando** (no necesitas `docker build` primero). El
`--env-file` es **obligatorio**: la interpolación de `${VARIABLES}` en Compose no
lee `env_file`, así que sin él los nombres de contenedores/red y las credenciales
quedan vacíos.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Esto hace TODO:

1. Construye la imagen de producción (etapa `production` del Dockerfile, usuario no-root)
2. Levanta los contenedores (backend + BD) en una red interna
3. Los ejecuta en segundo plano (`-d` = detached)

### 5. Verifica que todo funcione:

```bash
# Ver logs del backend
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend

# Ver logs de la BD
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f db
```

---

## Diferencias clave: Dockerfile vs docker-compose.yml

| **Dockerfile**                                                              | **docker-compose.yml**                                                        |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Define **cómo construir una imagen** de contenedor                          | Define y orquesta **múltiples contenedores** como un servicio                 |
| "Receta" para crear una imagen (ej: instalar dependencias, compilar código) | Gestiona redes, volúmenes, dependencias entre contenedores (ej: backend + bd) |
| Usa `docker build` / `docker run`                                           | Usa `docker-compose up`                                                       |

---

## Multi-stage builds: ¿Cómo elijo entre desarrollo y producción?

El `Dockerfile.nestjs` usa **multi-stage builds** (etapas separadas) para:

- Tener entornos de desarrollo con todas las herramientas
- Tener imágenes de producción pequeñas y seguras (solo lo necesario)

### ¿Cómo seleccionar la etapa?

#### 1. Con docker-compose.yml (recomendado):

Las plantillas ya incluyen el parámetro `target`:

- `docker-compose.prod.yml`: Usa `target: production`

#### 2. Con docker build directamente:

Si quieres construir la imagen sin docker-compose:

- **Producción**:
  ```bash
  docker build --target production -t mi-backend-prod .
  ```

---

## Notas importantes

- **Seguridad**: Nunca subas archivos `.env.dev` o `.env.prod` a Git (asegúrate de que estén en `.gitignore`). El `.dockerignore` excluye `.env*` y el directorio de datos de Postgres para que **nunca** entren a la imagen.
- **Usuario no-root**: la etapa `production` corre como el usuario `node` (uid 1000). El toolchain de compilación vive solo en las etapas de build; la imagen final es liviana.
- **Persistencia**: en producción se usa un bind mount (`../data/postgres_data`) para facilitar backups; en desarrollo, un volumen nombrado. Los datos sobreviven al reinicio de los contenedores.
- **Red interna**: en producción la BD **no expone puertos** al host; el backend la alcanza por la red interna usando el nombre del servicio (`db`).
- **Puertos**: el orden es `PUERTO_DE_TU_PC:PUERTO_DEL_CONTENEDOR` (atados a `127.0.0.1`).
- **Proxy inverso**: para producción, usa Nginx como proxy inverso (HTTPS y redirección de 80/443 a la app). La app ya tiene `trust proxy` para que el rate limiting funcione detrás del proxy.
