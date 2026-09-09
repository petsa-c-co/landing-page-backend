import {
    BadRequestException,
    CallHandler,
    ExecutionContext,
    Injectable,
    Logger,
    PayloadTooLargeException,
    UseInterceptors,
    applyDecorators,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Observable } from 'rxjs';

const enMegabytes = (bytes: number): string =>
    `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

/**
 * Tope del contenido de cada campo de texto del formulario.
 *
 * El default de busboy es 1 MB por campo, y sin tope de cantidad eso no acota
 * nada. El campo legítimo más largo que documenta la API es el email (254
 * caracteres); 16 KB deja lugar de sobra si mañana suman un textarea.
 */
const MAX_BYTES_POR_CAMPO = 16 * 1024;

/**
 * Mensajes en español de los errores de límite.
 *
 * Sin esto salen en inglés ("Too many fields"), contra la regla de que toda la
 * API responde en español. Hoy nadie los ve porque los límites eran infinitos:
 * ponerlos es lo que los activa.
 *
 * OJO con las CLAVES: Nest no expone el código de multer (`LIMIT_FIELD_COUNT`),
 * traduce el error a un `BadRequestException` cuyo mensaje ES el texto en inglés
 * (ver multer.constants.js y transformException de @nestjs/platform-express).
 * Por eso se indexa por ese texto y no por el código, y por eso el match es por
 * PREFIJO: cuando multer sabe qué campo falló le agrega " - <campo>" al final.
 */
const MENSAJES: Record<string, string> = {
    'Too many files': 'Se puede enviar un solo archivo',
    'Too many fields': 'El formulario tiene demasiados campos',
    'Too many parts': 'El formulario tiene demasiadas partes',
    'Field value too long': `Uno de los campos supera el tamaño máximo de ${enMegabytes(MAX_BYTES_POR_CAMPO)}`,
    'Field name too long': 'El nombre de uno de los campos es demasiado largo',
    'Unexpected field': 'Se recibió un archivo en un campo inesperado',
    'Field name missing': 'Llegó un campo sin nombre',
    // De busboy, cuando el multipart viene mal armado.
    'Multipart: Boundary not found': 'El formulario no se envió correctamente',
    'Malformed part header': 'El formulario no se envió correctamente',
    'Unexpected end of form': 'El envío se cortó antes de terminar',
    'Unexpected end of file': 'El envío se cortó antes de terminar',
};

const logger = new Logger('SingleFileUpload');

/**
 * Recepción de UN archivo por multipart, con los límites aplicados.
 *
 * Existe por dos motivos. El primero es el mensaje de error: cuando el archivo
 * excede el límite, Nest ya devuelve 413, pero con el texto crudo de multer
 * ("File too large") —en inglés y sin decir cuál era el máximo—, mientras el
 * resto de la API responde en español. Como el límite se define acá, el mensaje
 * puede nombrarlo.
 *
 * El segundo son los límites en sí. Los defaults de busboy dejan la cantidad de
 * archivos, campos y partes en Infinity, y `memoryStorage()` acumula todo en
 * memoria antes de que corra ningún pipe: sin topes, un solo request con
 * cientos de miles de partes se retiene entero en el heap. El
 * `json({limit:'1mb'})` de main.ts no ayuda — body-parser ni mira los
 * multipart/form-data.
 *
 * De paso centraliza `memoryStorage()`: los archivos se validan por sus bytes
 * (magic bytes) antes de guardarse o reenviarse, así que nunca se confía en el
 * mimetype declarado.
 *
 * @param maxCampos Campos de texto admitidos. El default sirve para un
 *   formulario chico; los que mandan listas repetidas necesitan más (ver
 *   ApplicationsController, donde cada puesto elegido viaja como un campo).
 */
export function SingleFileUpload(
    field: string,
    maxBytes: number,
    { maxCampos = 10 }: { maxCampos?: number } = {},
): MethodDecorator {
    const Base = FileInterceptor(field, {
        storage: memoryStorage(),
        limits: {
            fileSize: maxBytes,
            // Un solo archivo. No es redundante con el conteo interno de
            // multer: una parte declarada `application/octet-stream` SIN
            // filename es un archivo para busboy, pero multer la descarta sin
            // contarla. Este límite corta antes, en el parser.
            files: 1,
            fields: maxCampos,
            // Único límite que ataja las partes sin Content-Disposition, que no
            // incrementan ni `fields` ni `files` pero sí `parts`. El margen
            // cubre el archivo y el preámbulo del multipart.
            parts: maxCampos + 5,
            fieldSize: MAX_BYTES_POR_CAMPO,
            // fieldNameSize: no hace falta, busboy ya topa el header completo
            // de cada parte en 16 KB.
            //
            // fieldNestingDepth: NO agregar. Nest 11 no mapea LIMIT_FIELD_NESTING,
            // así que un request que lo violara saldría 500 en vez de 400.
        },
        // multer 2.x decodifica el `filename` del multipart como latin1 si no
        // se le dice otra cosa, y los navegadores lo mandan en UTF-8: sin esto,
        // "Currículum Nicolás.pdf" llega como "CurrÃ­culum NicolÃ¡s.pdf" y así
        // se lo reenviamos a Gestión, donde ya no se puede arreglar.
        defParamCharset: 'utf8',
    });

    @Injectable()
    class ConLimiteEnEspanol extends Base {
        async intercept(
            context: ExecutionContext,
            next: CallHandler,
        ): Promise<Observable<unknown>> {
            try {
                return await super.intercept(context, next);
            } catch (error) {
                if (error instanceof PayloadTooLargeException) {
                    throw new PayloadTooLargeException(
                        `El archivo supera el tamaño máximo de ${enMegabytes(maxBytes)}`,
                    );
                }
                throw this.traducir(error);
            }
        }

        /**
         * Traduce los errores de límite de multer.
         *
         * Nest los entrega como BadRequestException con el código de multer como
         * mensaje. Si alguno llega a dispararse con tráfico legítimo tiene que
         * verse en el log: es la red de haber elegido estos números y no otros.
         */
        private traducir(error: unknown): unknown {
            if (!(error instanceof BadRequestException)) {
                return error;
            }
            const respuesta = error.getResponse() as { message?: string };
            const original =
                typeof respuesta?.message === 'string' ? respuesta.message : '';
            // Por prefijo: multer le agrega " - <campo>" cuando sabe cuál falló.
            const entrada = Object.entries(MENSAJES).find(([ingles]) =>
                original.startsWith(ingles),
            );

            if (!entrada) {
                return error;
            }
            logger.warn(
                `Se rechazó una subida por un límite del multipart: "${original}" (campo del archivo: "${field}")`,
            );
            return new BadRequestException(entrada[1]);
        }
    }

    return applyDecorators(UseInterceptors(ConLimiteEnEspanol));
}
