// Límites de tamaño de archivos subidos (multer usa bytes).
// Tope del CV que se acepta en el formulario. No se guarda acá —se reenvía a
// Gestión Petrogas— pero el límite igual se aplica: sin él, un archivo enorme
// se cargaría entero en memoria antes de descubrir que Gestión lo rechaza.
// Debe coincidir con el límite de ellos (5 MB).
export const MAX_CV_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Tipos que se aceptan como CV, y el Content-Type con el que se reenvían.
 *
 * Va acá, pegado al límite de tamaño, porque son las DOS únicas cosas que este
 * backend afirma sobre un CV, y las dos son espejo de una regla de Gestión. Si
 * mañana ellos aceptan .docx: se agrega una entrada acá y su firma en
 * file-signature.util.ts. No hay un tercer lugar.
 */
export const TIPOS_DE_CV_ACEPTADOS = {
    pdf: 'application/pdf',
} as const;

/**
 * Content-Type verificado de un CV.
 *
 * Es un union de un solo valor, no `string`, a propósito: así el único modo de
 * obtener uno es habiendo validado los bytes. Alguien que "arregle" el
 * Content-Type del adjunto pasándole el `mimetype` que declaró el cliente —que
 * es justo lo que no hay que creerle— no compila.
 */
export type ContentTypeDeCv =
    (typeof TIPOS_DE_CV_ACEPTADOS)[keyof typeof TIPOS_DE_CV_ACEPTADOS];

export const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB
// Documentos públicos (p. ej. certificados ISO en PDF). Más holgado que las
// imágenes porque un PDF escaneado pesa más.
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// Prefijo de las keys de media, que los métodos de borrado validan.
export const MEDIA_KEY_PREFIX = 'media/';
