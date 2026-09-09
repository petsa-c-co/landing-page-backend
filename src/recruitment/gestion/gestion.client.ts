import {
    BadGatewayException,
    HttpException,
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContentTypeDeCv } from '@/storage/storage.constants';

/** Puesto disponible, tal como lo publica Gestión. Los ids son numéricos. */
export interface JobPosition {
    id: number;
    name: string;
}

/** Datos de una postulación, ya listos para reenviar. */
export interface ApplicationPayload {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    degreeTitleId?: string;
    degreeTitleName?: string;
    degreeTitleOther?: string;
    jobProfileIds: string[];
    cv: Express.Multer.File;
    /**
     * Content-Type VERIFICADO del CV, no el que declaró el cliente.
     *
     * Es obligatorio y de tipo estrecho a propósito: el único modo de obtener
     * uno es habiendo mirado los bytes (ver ApplicationsController.verificarCv).
     * Pasarle `cv.mimetype` —lo que dice el navegador— no compila.
     */
    cvContentType: ContentTypeDeCv;
}

/** Lo que devuelve Gestión al aceptar una postulación. */
export interface ApplicationReceipt {
    id: number;
    status: string;
}

// Forma de los 422 de Gestión: un resumen y el detalle por campo.
interface GestionValidationError {
    message?: string;
    errors?: Record<string, string[]>;
}

// Un PDF de 5 MB por una conexión lenta necesita margen; pasado eso, es mejor
// cortar y avisar que dejar al postulante esperando indefinidamente.
const TIMEOUT_MS = 30_000;

/**
 * Cliente de la API de Gestión Petrogas, dueña de las postulaciones.
 *
 * El token es secreto y vive solo en el entorno del backend: el navegador
 * nunca lo ve. Por eso el sitio no llama a Gestión directamente sino a través
 * nuestro (ver los controllers de este módulo).
 */
@Injectable()
export class GestionClient {
    private readonly logger = new Logger(GestionClient.name);

    constructor(private readonly config: ConfigService) {}

    private baseUrl(): string {
        return (this.config.get<string>('GESTION_API_BASE_URL') ?? '').replace(
            /\/+$/,
            '',
        );
    }

    private headers(): Record<string, string> {
        return {
            Authorization: `Bearer ${this.config.get<string>('GESTION_API_TOKEN') ?? ''}`,
            Accept: 'application/json',
        };
    }

    /** Puestos activos que Gestión ofrece hoy. */
    async fetchJobPositions(): Promise<JobPosition[]> {
        const res = await this.request(`${this.baseUrl()}/site/job-positions`, {
            method: 'GET',
            headers: this.headers(),
        });

        if (!res.ok) {
            await this.fallo('consultar los puestos', res);
        }

        // Verificado contra la API real el 25/08/2026: devuelve el arreglo
        // pelado, sin sobre. Igual se acepta `{ data: [...] }`, porque el POST
        // de postulaciones SÍ viene envuelto y nada garantiza que no unifiquen.
        //
        // Lo que no se hace es castear a ciegas: si la forma cambia, un `as`
        // dejaba pasar un objeto donde el frontend espera un arreglo, el select
        // de puestos quedaba vacío y la respuesta seguía siendo 200. Un 502 con
        // el cuerpo en el log se diagnostica; un select vacío, no.
        const cuerpo: unknown = await res.json().catch(() => null);
        const lista = Array.isArray(cuerpo)
            ? cuerpo
            : Array.isArray((cuerpo as { data?: unknown })?.data)
              ? (cuerpo as { data: unknown[] }).data
              : null;

        if (!lista) {
            this.logger.error(
                `Gestión devolvió un cuerpo inesperado en /site/job-positions: ${JSON.stringify(cuerpo)?.slice(0, 300)}`,
            );
            throw new BadGatewayException(
                'No se pudo obtener la lista de puestos. Intentá de nuevo en unos minutos.',
            );
        }
        return lista as JobPosition[];
    }

    /**
     * Reenvía una postulación. El CV viaja de largo: nunca se escribe en
     * nuestro disco, va del request del visitante directo a Gestión.
     */
    async submitApplication(
        payload: ApplicationPayload,
    ): Promise<ApplicationReceipt> {
        const form = new FormData();
        form.append('fullName', payload.fullName);
        form.append('email', payload.email);
        form.append('phone', payload.phone);
        form.append('location', payload.location);
        if (payload.degreeTitleId) {
            form.append('degreeTitleId', payload.degreeTitleId);
        }
        if (payload.degreeTitleName) {
            form.append('degreeTitleName', payload.degreeTitleName);
        }
        if (payload.degreeTitleOther) {
            form.append('degreeTitleOther', payload.degreeTitleOther);
        }
        // Gestión espera el arreglo con la notación jobProfileIds[].
        for (const id of payload.jobProfileIds) {
            form.append('jobProfileIds[]', id);
        }
        // El tipo sale de lo VERIFICADO, no de una constante: antes iba
        // 'application/pdf' fijo, así que cualquier binario salía hacia Gestión
        // etiquetado como PDF.
        //
        // El `new Uint8Array(...)` copia el buffer y podría evitarse, pero no
        // sale gratis: un Buffer de Node es ArrayBufferLike, que TypeScript no
        // acepta como BlobPart porque podría ser un SharedArrayBuffer. Sortearlo
        // pide un cast a ciegas, y no se paga por ahorrar una copia de 5 MB
        // como mucho, en un endpoint limitado a 20 envíos por minuto.
        form.append(
            'cv',
            new Blob([new Uint8Array(payload.cv.buffer)], {
                type: payload.cvContentType,
            }),
            payload.cv.originalname || 'cv.pdf',
        );

        const res = await this.request(
            `${this.baseUrl()}/site/job-applications`,
            { method: 'POST', headers: this.headers(), body: form },
        );

        if (!res.ok) {
            await this.fallo('enviar la postulación', res);
        }

        // Tolerante en la misma dirección: con sobre o sin él.
        //
        // A diferencia del listado, acá NO se corta: Gestión ya aceptó la
        // postulación, y convertir su 200 en un error dejaría al postulante
        // creyendo que no se envió, cuando sí se envió. Se conserva el recibo
        // por defecto —el frontend solo lo usa para confirmar— pero queda un
        // warning con el cuerpo real, para que `id: 0` no se lea como un id que
        // mandó Gestión.
        const cuerpo: unknown = await res.json().catch(() => null);
        const recibo =
            (cuerpo as { data?: ApplicationReceipt })?.data ?? cuerpo;

        if (!recibo || typeof recibo !== 'object' || !('id' in recibo)) {
            this.logger.warn(
                `Gestión aceptó la postulación pero devolvió un cuerpo sin recibo: ${JSON.stringify(cuerpo)?.slice(0, 300)}`,
            );
            return { id: 0, status: 'received' };
        }
        return recibo as ApplicationReceipt;
    }

    /** fetch con timeout: sin esto, una API colgada cuelga también al visitante. */
    private async request(url: string, init: RequestInit): Promise<Response> {
        try {
            return await fetch(url, {
                ...init,
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
        } catch (err) {
            this.logger.error(
                `No se pudo contactar a Gestión (${url})`,
                err instanceof Error ? err.message : String(err),
            );
            throw new ServiceUnavailableException(
                'No pudimos comunicarnos con el sistema de postulaciones. Intentá de nuevo en unos minutos.',
            );
        }
    }

    /**
     * Traduce un error de Gestión.
     *
     * Los 422 son del postulante (falta un campo, el CV no es PDF) y se
     * reenvían tal cual: sus mensajes ya vienen en español y con el detalle por
     * campo, así el formulario puede marcarlos. Cualquier otro código es un
     * problema entre los dos sistemas, no del visitante: se registra con el
     * cuerpo real para poder diagnosticarlo y se responde algo genérico.
     */
    private async fallo(accion: string, res: Response): Promise<never> {
        const texto = await res.text().catch(() => '');

        if (res.status === 422) {
            let detalle: GestionValidationError = {};
            try {
                detalle = JSON.parse(texto) as GestionValidationError;
            } catch {
                // Se cae al mensaje genérico de abajo.
            }
            throw new HttpException(
                {
                    message:
                        detalle.message ??
                        'Revisá los datos del formulario e intentá de nuevo.',
                    errors: detalle.errors ?? null,
                },
                422,
            );
        }

        this.logger.error(
            `Gestión respondió ${res.status} al ${accion}: ${texto.slice(0, 500)}`,
        );
        throw new BadGatewayException(
            'El sistema de postulaciones no está disponible en este momento. Intentá más tarde.',
        );
    }
}
