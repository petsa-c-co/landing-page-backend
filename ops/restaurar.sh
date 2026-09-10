#!/usr/bin/env bash
#
# Restauración desde un respaldo hecho con ops/backup.sh.
#
# Se corre a mano y PISA los datos actuales, así que exige el archivo a
# restaurar y una confirmación explícita. Sin eso solo muestra qué haría.
#
#   ./ops/restaurar.sh                                  # lista lo disponible
#   ./ops/restaurar.sh petrogassa-bd-20260910-0300.sql.gz
#   ./ops/restaurar.sh petrogassa-bd-20260910-0300.sql.gz --confirmar
#
# Si además hay que reponer las imágenes, se pasa el .tar.gz de la misma fecha:
#
#   ./ops/restaurar.sh petrogassa-bd-...sql.gz petrogassa-archivos-...tar.gz --confirmar

set -euo pipefail

PROYECTO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$PROYECTO/docker-compose.prod.yml"
ENV_FILE="$PROYECTO/.env.prod"
DESTINO="${BACKUP_DIR:-$PROYECTO/../data/backups}"
ALMACENAMIENTO="${STORAGE_DIR:-$PROYECTO/../data/storage}"

avisar() { printf '%s  %s\n' "$(date +'%Y-%m-%d %H:%M:%S')" "$1"; }
morir() { avisar "ERROR: $1" >&2; exit 1; }

compose() {
    docker compose -f "$COMPOSE" --env-file "$ENV_FILE" "$@"
}

ARCHIVO_BD=""
ARCHIVO_ARCHIVOS=""
CONFIRMADO=0
for argumento in "$@"; do
    case "$argumento" in
        --confirmar) CONFIRMADO=1 ;;
        *bd-*.sql.gz) ARCHIVO_BD="$argumento" ;;
        *archivos-*.tar.gz) ARCHIVO_ARCHIVOS="$argumento" ;;
        *) morir "no entiendo el argumento: $argumento" ;;
    esac
done

if [ -z "$ARCHIVO_BD" ]; then
    avisar "Respaldos disponibles en $DESTINO:"
    find "$DESTINO" -maxdepth 1 -name 'petrogassa-*' -printf '   %f  (%TY-%Tm-%Td %TH:%TM)\n' \
        2>/dev/null | sort || avisar '   (ninguno)'
    echo
    echo "Uso: $0 <archivo-bd.sql.gz> [archivo-archivos.tar.gz] [--confirmar]"
    exit 0
fi

# Se admite tanto el nombre suelto como la ruta completa.
[ -f "$ARCHIVO_BD" ] || ARCHIVO_BD="$DESTINO/$ARCHIVO_BD"
[ -f "$ARCHIVO_BD" ] || morir "no encuentro el respaldo de la base: $ARCHIVO_BD"
gzip -t "$ARCHIVO_BD" || morir 'el respaldo de la base está corrupto'

if [ -n "$ARCHIVO_ARCHIVOS" ]; then
    [ -f "$ARCHIVO_ARCHIVOS" ] || ARCHIVO_ARCHIVOS="$DESTINO/$ARCHIVO_ARCHIVOS"
    [ -f "$ARCHIVO_ARCHIVOS" ] || morir "no encuentro el respaldo de archivos: $ARCHIVO_ARCHIVOS"
    gzip -t "$ARCHIVO_ARCHIVOS" || morir 'el respaldo de archivos está corrupto'
fi

echo
echo "  Se va a restaurar:"
echo "     base      <- $(basename "$ARCHIVO_BD")"
[ -n "$ARCHIVO_ARCHIVOS" ] && echo "     archivos  <- $(basename "$ARCHIVO_ARCHIVOS")"
echo
echo "  Esto PISA los datos actuales. Lo que haya cambiado después de esa fecha"
echo "  se pierde."
echo

if [ "$CONFIRMADO" -ne 1 ]; then
    echo "  No se hizo nada. Volvé a correrlo con --confirmar para aplicarlo."
    exit 0
fi

# El backend se baja primero: con la aplicación conectada, el DROP TABLE del
# volcado se queda esperando a que libere las tablas y la restauración cuelga.
#
# Se comprueba si estaba corriendo en vez de bajarlo a ciegas: si el contenedor
# no existe —por ejemplo en un servidor recién armado, restaurando antes de
# levantar la aplicación— un `start` al final fallaría y abortaría el script
# DESPUÉS de haber restaurado bien.
BACKEND_ESTABA_ARRIBA=0
if [ -n "$(compose ps -q backend 2>/dev/null)" ]; then
    BACKEND_ESTABA_ARRIBA=1
    avisar 'Deteniendo el backend...'
    compose stop backend
else
    avisar 'El backend no está corriendo, sigo sin tocarlo'
fi

avisar 'Restaurando la base...'
gunzip -c "$ARCHIVO_BD" \
    | compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 --quiet -o /dev/null' \
    || morir 'falló la restauración de la base; el backend sigue detenido a propósito'

if [ -n "$ARCHIVO_ARCHIVOS" ]; then
    avisar 'Restaurando los archivos subidos...'
    mkdir -p "$ALMACENAMIENTO"
    tar -xzf "$ARCHIVO_ARCHIVOS" -C "$(dirname "$ALMACENAMIENTO")" \
        || morir 'falló la restauración de los archivos'
fi

if [ "$BACKEND_ESTABA_ARRIBA" -eq 1 ]; then
    avisar 'Levantando el backend...'
    compose start backend
fi

avisar 'Restauración terminada. Revisá el sitio antes de darlo por bueno.'
