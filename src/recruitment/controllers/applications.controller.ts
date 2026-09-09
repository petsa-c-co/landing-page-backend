import {
    BadRequestException,
    Body,
    Controller,
    HttpException,
    HttpStatus,
    Logger,
    Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UploadedFile } from '@nestjs/common';
import {
    ApplicationReceipt,
    GestionClient,
} from '../gestion/gestion.client';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';
import { SingleFileUpload } from '@/common/decorators/single-file-upload.decorator';
import {
    ContentTypeDeCv,
    MAX_CV_SIZE_BYTES,
    TIPOS_DE_CV_ACEPTADOS,
} from '@/storage/storage.constants';
import { detectFileType } from '@/storage/utils/file-signature.util';
import { detectActivePdfContent } from '@/storage/utils/pdf-active-content.util';

/**
 * Máximo de puestos por postulación. Regla del negocio: una persona no puede
 * postularse a más de tres.
 *
 * El frontend también lo limita en la interfaz, pero eso es comodidad, no un
 * límite: se saltea con curl. TIENE que coincidir con lo que muestra el panel;
 * si cambia, se tocan los dos lados.
 */
const MAX_PUESTOS_POR_POSTULACION = 3;

// Campos del formulario, tal como los define Gestión. No se validan acá a
// propósito: las reglas de negocio son de ellos y duplicarlas garantizaría que
// tarde o temprano queden desfasadas. Sus 422 vuelven con el detalle por campo
// y el frontend los muestra (ver GestionClient.fallo).
//
// Hay DOS excepciones, y son de distinta naturaleza:
//
//  1. El TIPO REAL DEL CV. No es una regla del formulario: es un control sobre
//     lo que sale de esta red firmado con GESTION_API_TOKEN. Que un archivo sea
//     un CV aceptable lo decide Gestión; que un binario arbitrario no salga
//     hacia ellos etiquetado como PDF con nuestra firma lo decidimos nosotros,
//     porque el token es nuestro y esa responsabilidad no se delega.
//
//  2. El MÁXIMO DE PUESTOS. Esta sí es una regla de negocio, y se valida acá
//     porque el límite de la interfaz no es un límite.
//
// Las dos rechazan imitando el 422 de Gestión, con el detalle por campo: así el
// formulario marca el input igual que siempre, y el día que estos chequeos se
// saquen el frontend no ve ninguna diferencia.
interface FormularioPostulacion {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    degreeTitleId?: string;
    degreeTitleName?: string;
    degreeTitleOther?: string;
    jobProfileIds?: string | string[];
}

/**
 * Formulario PÚBLICO de postulación.
 *
 * El backend actúa como puente hacia Gestión Petrogas, dueña de las
 * postulaciones: acá NO se guarda nada, ni los datos ni el CV. El PDF pasa
 * del request del visitante directo a la API de ellos.
 *
 * La ruta es la misma de siempre para que el frontend no cambie.
 */
@Controller('recruitment/applications')
export class ApplicationsController {
    private readonly logger = new Logger(ApplicationsController.name);

    constructor(private readonly gestion: GestionClient) {}

    // El límite es por IP y muchos postulantes comparten una (CGNAT, ferias de
    // empleo, locutorios), así que el cupo es holgado.
    @Post()
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    // 50 campos: un envío legítimo tiene 7 de texto + hasta 3 puestos = 10.
    // Los puestos viajan UNO POR CAMPO, que es el detalle que engaña al contar
    // "el formulario tiene 8 campos". El margen es para que subir el máximo de
    // puestos no exija tocar esto.
    @SingleFileUpload('cv', MAX_CV_SIZE_BYTES, { maxCampos: 50 })
    @ResponseMessage('Recibimos tu postulación.')
    create(
        @Body() formulario: FormularioPostulacion,
        @UploadedFile() cv: Express.Multer.File | undefined,
    ): Promise<ApplicationReceipt> {
        // Sigue siendo 400: el request está genuinamente incompleto, y así está
        // documentado. Lo que viene abajo es distinto —el request está bien
        // armado y el contenido es el que falla—, por eso es 422.
        if (!cv) {
            throw new BadRequestException(
                'Falta el CV (campo "cv" del formulario)',
            );
        }

        const cvContentType = this.verificarCv(cv);

        const jobProfileIds = Array.isArray(formulario.jobProfileIds)
            ? formulario.jobProfileIds
            : formulario.jobProfileIds
              ? [formulario.jobProfileIds]
              : [];

        if (jobProfileIds.length > MAX_PUESTOS_POR_POSTULACION) {
            throw this.rechazo(
                'jobProfileIds',
                `Podés elegir hasta ${MAX_PUESTOS_POR_POSTULACION} puestos.`,
            );
        }

        return this.gestion.submitApplication({
            fullName: formulario.fullName ?? '',
            email: formulario.email ?? '',
            phone: formulario.phone ?? '',
            location: formulario.location ?? '',
            degreeTitleId: formulario.degreeTitleId,
            degreeTitleName: formulario.degreeTitleName,
            degreeTitleOther: formulario.degreeTitleOther,
            jobProfileIds,
            cv,
            cvContentType,
        });
    }

    /**
     * Verifica que el CV sea lo que dice ser, y devuelve su Content-Type real.
     *
     * Mira los BYTES, no el `mimetype` ni la extensión que declaró el cliente:
     * un .exe renombrado a cv.pdf se rechaza acá. Es el mismo criterio que ya
     * usan las subidas de media (ver MediaService).
     */
    private verificarCv(cv: Express.Multer.File): ContentTypeDeCv {
        const tipo = detectFileType(cv.buffer);
        const aceptado =
            tipo && tipo in TIPOS_DE_CV_ACEPTADOS
                ? TIPOS_DE_CV_ACEPTADOS[tipo as keyof typeof TIPOS_DE_CV_ACEPTADOS]
                : null;

        if (!aceptado) {
            this.registrarRechazo(cv, `tipo detectado: ${tipo ?? 'ninguno'}`);
            throw this.rechazo('cv', 'El CV debe ser un PDF.');
        }

        // Contenido activo. NO es un antivirus: atrapa lo evidente y nada más
        // (ver pdf-active-content.util.ts).
        const marcador = detectActivePdfContent(cv.buffer);
        if (marcador) {
            this.registrarRechazo(cv, `contenido activo: ${marcador}`);
            throw this.rechazo(
                'cv',
                'El CV no puede contener contenido activo (JavaScript, archivos adjuntos o acciones automáticas). Volvé a exportarlo como PDF simple.',
            );
        }

        return aceptado;
    }

    /**
     * Rechazo con la MISMA forma que devolvería Gestión: 422 con el detalle por
     * campo, para que el formulario marque el input igual que siempre y estos
     * chequeos se puedan sacar sin tocar una línea del frontend.
     */
    private rechazo(campo: string, mensaje: string): HttpException {
        return new HttpException(
            { message: mensaje, errors: { [campo]: [mensaje] } },
            HttpStatus.UNPROCESSABLE_ENTITY,
        );
    }

    /**
     * Deja constancia del rechazo para poder detectar falsos positivos: si
     * empiezan a rebotar CV legítimos, esto dice por qué.
     *
     * Se registran el nombre y los primeros bytes, NUNCA el contenido: es el CV
     * de una persona.
     */
    private registrarRechazo(cv: Express.Multer.File, motivo: string): void {
        this.logger.warn(
            `CV rechazado (${motivo}) — archivo "${cv.originalname}", ` +
                `declarado como "${cv.mimetype}", empieza con ` +
                `${cv.buffer.subarray(0, 8).toString('hex')}`,
        );
    }
}
