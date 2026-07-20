# Etapa base (compartida). La versión de pnpm se toma del campo "packageManager"
# de package.json; corepack la fija de forma reproducible (no se usa "latest").
FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable

# Archivos de configuración de pnpm requeridos por el lockfile congelado
# (.pnpmfile.cjs está referenciado por pnpmfileChecksum; .npmrc y
# pnpm-workspace.yaml habilitan la compilación de módulos nativos como bcrypt).

# Etapa de dependencias de PRODUCCIÓN (con toolchain para compilar bcrypt).
FROM base AS prod-deps
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml .npmrc .pnpmfile.cjs pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Etapa de build (dependencias completas + compilación TypeScript).
FROM base AS builder
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml .npmrc .pnpmfile.cjs pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Etapa de desarrollo (hot-reload, dependencias completas).
FROM base AS development
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml .npmrc .pnpmfile.cjs pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
CMD ["pnpm", "run", "start:dev"]

# Etapa de producción: imagen final liviana, sin toolchain, usuario no-root.
FROM base AS production
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Ejecutar como el usuario 'node' (no-root) ya presente en la imagen oficial.
USER node

# Healthcheck: consulta la ruta raíz de la API (GET /api) con el wget de busybox.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api" || exit 1

CMD ["node", "dist/main.js"]
