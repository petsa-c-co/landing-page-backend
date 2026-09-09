import { ValueKind } from './entities/change-log-detail.entity';
import { Service } from '@/services/entities/service.entity';
import { ServiceItem } from '@/services/entities/service-item.entity';
import { Certification } from '@/certifications/entities/certification.entity';
import { Client } from '@/clients/entities/client.entity';
import { NewsPost } from '@/news/entities/news-post.entity';
import { DegreeTitle } from '@/recruitment/entities/degree-title.entity';
import { SiteSettings } from '@/site-settings/entities/site-settings.entity';
import { SiteImage } from '@/site-settings/entities/site-image.entity';

/**
 * Qué contenido se audita y cómo se lo describe en el registro.
 *
 * ES EL ÚNICO LUGAR a tocar cuando una entidad de contenido cambia. Mismo
 * espíritu que KEY_REFERENCES en media-references.service.ts: una sola
 * declaración central en vez de reglas desparramadas que se desincronizan.
 *
 * Si agregás una entidad de contenido y no la ponés acá, sus cambios NO se
 * registran. Por eso audited-entities.spec.ts recorre todas las entidades del
 * proyecto y falla si alguna no está clasificada — o acá, o en NO_AUDITADAS con
 * el motivo escrito.
 */

/** Cómo tratar un campo en el registro. */
export type TipoDeCampo =
    | { modo: 'valor'; etiqueta: string; clase?: ValueKind }
    /** Largo: se registra QUE cambió, sin volcar el contenido. */
    | { modo: 'resumen'; etiqueta: string; texto: string }
    /** Key de archivo: se dice que se reemplazó, sin guardar el archivo viejo. */
    | { modo: 'archivo'; etiqueta: string };

export interface EntidadAuditada {
    /** Cómo se llama la sección en el panel y en el Excel. */
    seccion: string;
    /** Nombre corto que va en `entityType`. */
    tipo: string;
    /** De dónde sale el nombre legible del registro. */
    label: (entidad: Record<string, unknown>) => string;
    campos: Record<string, TipoDeCampo>;
}

const texto = (etiqueta: string): TipoDeCampo => ({ modo: 'valor', etiqueta });
const booleano = (etiqueta: string): TipoDeCampo => ({
    modo: 'valor',
    etiqueta,
    clase: ValueKind.BOOLEANO,
});
const numero = (etiqueta: string): TipoDeCampo => ({
    modo: 'valor',
    etiqueta,
    clase: ValueKind.NUMERO,
});
const fecha = (etiqueta: string): TipoDeCampo => ({
    modo: 'valor',
    etiqueta,
    clase: ValueKind.FECHA,
});
const archivo = (etiqueta: string): TipoDeCampo => ({ modo: 'archivo', etiqueta });
const largo = (etiqueta: string, texto: string): TipoDeCampo => ({
    modo: 'resumen',
    etiqueta,
    texto,
});

const comoTitulo =
    (campo: string) =>
    (e: Record<string, unknown>): string =>
        typeof e[campo] === 'string' && e[campo]
            ? String(e[campo])
            : '(sin nombre)';

/** Constructor de una entidad, para indexar el mapa. */
export type ClaseEntidad = new (...args: never[]) => object;

export const ENTIDADES_AUDITADAS = new Map<ClaseEntidad, EntidadAuditada>([
    [
        Service,
        {
            seccion: 'Servicios',
            tipo: 'servicio',
            label: comoTitulo('title'),
            campos: {
                title: texto('Título'),
                slug: texto('URL'),
                shortDescription: texto('Descripción corta'),
                longDescription: largo(
                    'Descripción larga',
                    'Se modificó la descripción larga',
                ),
                cardImage: archivo('Imagen de tarjeta'),
                bannerImage: archivo('Imagen de banner'),
                detailImage: archivo('Imagen de detalle'),
                itemsLayout: texto('Disposición de ítems'),
                sortOrder: numero('Orden'),
                isActive: booleano('Visible'),
            },
        },
    ],
    [
        Certification,
        {
            seccion: 'Certificaciones',
            tipo: 'certificacion',
            label: comoTitulo('title'),
            campos: {
                title: texto('Norma'),
                subtitle: texto('Categoría'),
                description: texto('Descripción'),
                isFeatured: booleano('Destacada'),
                logoImage: archivo('Logo'),
                certificatePdf: archivo('Certificado en PDF'),
                sortOrder: numero('Orden'),
            },
        },
    ],
    [
        Client,
        {
            seccion: 'Clientes',
            tipo: 'cliente',
            label: comoTitulo('name'),
            campos: {
                name: texto('Nombre'),
                logoImage: archivo('Logo'),
                sortOrder: numero('Orden'),
                isActive: booleano('Visible'),
            },
        },
    ],
    [
        NewsPost,
        {
            seccion: 'Novedades y Prensa',
            tipo: 'novedad',
            label: comoTitulo('title'),
            campos: {
                title: texto('Título'),
                slug: texto('URL'),
                category: texto('Categoría'),
                publishedAt: fecha('Fecha de publicación'),
                coverImage: archivo('Portada'),
                excerpt: texto('Extracto'),
                body: largo('Cuerpo', 'Se modificó el cuerpo de la nota'),
                isFeatured: booleano('Destacada'),
                isPublished: booleano('Publicada'),
                externalUrl: texto('Enlace externo'),
            },
        },
    ],
    [
        DegreeTitle,
        {
            seccion: 'Títulos académicos',
            tipo: 'titulo',
            label: comoTitulo('name'),
            campos: {
                name: texto('Nombre'),
                level: texto('Nivel'),
                isActive: booleano('Activo'),
                sortOrder: numero('Orden'),
            },
        },
    ],
    [
        SiteSettings,
        {
            seccion: 'Sitio',
            tipo: 'configuracion',
            label: (): string => 'Marca de certificación',
            campos: {
                certificationMarkImage: archivo('Marca de certificación'),
                certificationScopeText: texto('Alcance de la certificación'),
            },
        },
    ],
    [
        SiteImage,
        {
            seccion: 'Sitio',
            tipo: 'imagen-del-sitio',
            label: comoTitulo('slot'),
            campos: {
                slot: texto('Ubicación'),
                imageKey: archivo('Imagen'),
            },
        },
    ],
]);

/**
 * Los ítems de un servicio NO generan asiento propio: se registran como un
 * detalle del servicio al que pertenecen.
 *
 * El motivo es que ServicesService.update() los reconstruye como objetos nuevos
 * sin id, así que TypeORM borra todos y reinserta todos en cada edición —aunque
 * la lista sea idéntica—. Auditarlos fila por fila llenaría el registro de una
 * decena de cambios falsos por edición y lo volvería inservible.
 */
export const ITEMS_COMO_DETALLE = ServiceItem;

/**
 * Entidades que a propósito NO se auditan, con el motivo. El test las exige
 * declaradas para que "no está auditada" sea siempre una decisión y nunca un
 * olvido.
 */
export const NO_AUDITADAS: ReadonlyMap<string, string> = new Map([
    ['User', 'Los accesos van en un registro aparte, no en el de contenido.'],
    ['RefreshToken', 'Infraestructura de sesión, no contenido del sitio.'],
    ['VerificationToken', 'Infraestructura de sesión, no contenido del sitio.'],
    [
        'ContactMessage',
        'Datos personales de terceros: el registro de cambios es exportable y no debe contenerlos.',
    ],
    [
        'LinkedInImport',
        'Cola de curaduría: nada de acá se publica hasta que se aprueba, y la aprobación sí crea una novedad que se registra.',
    ],
    ['ServiceItem', 'Se registra como detalle del servicio (ver ITEMS_COMO_DETALLE).'],
    ['SiteRevision', 'Es parte del propio registro.'],
    ['ChangeLogEntry', 'Es parte del propio registro.'],
    ['ChangeLogDetail', 'Es parte del propio registro.'],
]);
