#!/usr/bin/env bash
#
# Respaldo del sitio: base de datos + archivos subidos.
#
# Qué se respalda y por qué solo esto:
#   - La BASE, que contiene el registro de cambios y las revisiones exigidos por
#     la certificación. Ese rastro no existe en ningún otro lado: si se pierde,
#     no hay forma de reconstruirlo.
#   - Los ARCHIVOS de data/storage: las imágenes y PDF que se suben desde el
#     panel. Sin ellos la base queda apuntando a archivos que no existen, así
#     que el sitio no se ve "de fábrica", se ve roto.
#
# Lo que NO hace falta respaldar: las postulaciones (nunca tocan este servidor,
# se reenvían a Gestión) y el contenido de los mensajes de contacto (llegan
# completos al buzón de la empresa por correo).
#
# No necesita root. Se programa en el crontab del usuario que despliega.
#
#   0 3 * * * /ruta/al/backend/ops/backup.sh >> /ruta/a/data/backups/backup.log 2>&1
#
# Para restaurar, ver ops/restaurar.sh.

# pipefail es imprescindible acá: sin él, un pg_dump que falla queda tapado por
# el gzip que sí funciona, y el resultado es un archivo de respaldo vacío que
# nadie mira hasta el día que hace falta.
set -euo pipefail

PROYECTO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$PROYECTO/docker-compose.prod.yml"
ENV_FILE="$PROYECTO/.env.prod"

# Todo configurable por si mañana los respaldos van a otro disco.
DESTINO="${BACKUP_DIR:-$PROYECTO/../data/backups}"
ALMACENAMIENTO="${STORAGE_DIR:-$PROYECTO/../data/storage}"
RETENCION_DIAS="${BACKUP_RETENTION_DAYS:-30}"

FECHA="$(date +%Y%m%d-%H%M)"
DESTINO_BD="$DESTINO/petrogassa-bd-$FECHA.sql.gz"
DESTINO_ARCHIVOS="$DESTINO/petrogassa-archivos-$FECHA.tar.gz"

avisar() { printf '%s  %s\n' "$(date +'%Y-%m-%d %H:%M:%S')" "$1"; }
morir() { avisar "ERROR: $1" >&2; exit 1; }

command -v docker >/dev/null || morir 'docker no está disponible en el PATH'
[ -f "$COMPOSE" ] || morir "no encuentro $COMPOSE"
[ -f "$ENV_FILE" ] || morir "no encuentro $ENV_FILE"

mkdir -p "$DESTINO"

compose() {
    docker compose -f "$COMPOSE" --env-file "$ENV_FILE" "$@"
}

# ── 1. Base de datos ─────────────────────────────────────────────────────────
#
# El pg_dump corre DENTRO del contenedor y toma el usuario y la base de sus
# propias variables de entorno. Así este script nunca lee ni conoce la
# contraseña: no hay ninguna credencial escrita acá.
#
# --clean --if-exists deja el volcado listo para restaurar sobre una base que ya
# tiene datos, sin pasos manuales previos.
avisar 'Volcando la base de datos...'
TEMPORAL_BD="$DESTINO/.parcial-bd-$FECHA.gz"
TEMPORAL_ARCHIVOS=""

# Si algo falla a mitad de camino, el parcial no se queda ocupando lugar ni
# confundiendo a quien mire la carpeta. Después del mv estas rutas ya no
# existen, así que el rm no toca los respaldos buenos.
limpiar_parciales() { rm -f "$TEMPORAL_BD" "$TEMPORAL_ARCHIVOS" 2>/dev/null || true; }
trap limpiar_parciales EXIT
compose exec -T db sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
    | gzip -9 > "$TEMPORAL_BD" \
    || morir 'falló el volcado de la base (¿está levantado el contenedor db?)'

# Un archivo corrupto que pesa y parece un respaldo es peor que ninguno.
gzip -t "$TEMPORAL_BD" 2>/dev/null || morir 'el volcado quedó corrupto'
TAMANIO_BD=$(wc -c < "$TEMPORAL_BD")
[ "$TAMANIO_BD" -gt 1024 ] || morir "el volcado pesa $TAMANIO_BD bytes: está vacío"

# El mv es atómico: nunca queda un archivo a medio escribir con nombre final.
mv "$TEMPORAL_BD" "$DESTINO_BD"
avisar "Base lista: $(basename "$DESTINO_BD") ($(du -h "$DESTINO_BD" | cut -f1))"

# ── 2. Archivos subidos ──────────────────────────────────────────────────────
if [ -d "$ALMACENAMIENTO" ]; then
    avisar 'Comprimiendo los archivos subidos...'
    TEMPORAL_ARCHIVOS="$DESTINO/.parcial-archivos-$FECHA.tar.gz"
    tar -czf "$TEMPORAL_ARCHIVOS" \
        -C "$(dirname "$ALMACENAMIENTO")" "$(basename "$ALMACENAMIENTO")" \
        || morir 'falló la compresión de los archivos'
    mv "$TEMPORAL_ARCHIVOS" "$DESTINO_ARCHIVOS"
    avisar "Archivos listos: $(basename "$DESTINO_ARCHIVOS") ($(du -h "$DESTINO_ARCHIVOS" | cut -f1))"
else
    # No es un error: en un servidor recién desplegado todavía no se subió nada.
    avisar "AVISO: no existe $ALMACENAMIENTO, no hay archivos que respaldar"
fi

# ── 3. Retención ─────────────────────────────────────────────────────────────
BORRADOS=$(find "$DESTINO" -maxdepth 1 -type f -name 'petrogassa-*' \
    -mtime "+$RETENCION_DIAS" -print -delete | wc -l)
if [ "$BORRADOS" -gt 0 ]; then
    avisar "Eliminados $BORRADOS respaldos de más de $RETENCION_DIAS días"
fi

# Los parciales de una corrida que murió a la mitad no se acumulan.
find "$DESTINO" -maxdepth 1 -type f -name '.parcial-*' -mtime +1 -delete

avisar "Listo. Respaldos en $DESTINO: $(find "$DESTINO" -maxdepth 1 -name 'petrogassa-*' | wc -l) archivos"
