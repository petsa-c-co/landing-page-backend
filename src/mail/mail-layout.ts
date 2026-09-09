/**
 * Layout de los correos transaccionales, portado del diseño provisto por
 * Petrogas (`activacion-cuenta.html`). Se mantiene su markup tal cual: tablas,
 * condicionales de Outlook, `mso-line-height-rule`, media queries para móvil y
 * el preheader oculto.
 *
 * Está parametrizado en vez de duplicado en tres archivos HTML: los tres
 * correos comparten encabezado, botón y pie, y solo cambia el contenido. Un
 * cambio de dirección o de teléfono se hace una sola vez.
 */

// Colores del diseño original.
const AZUL = '#24378f';
const AZUL_OSCURO = '#1f2f78';
const ROJO = '#ed1c24';
const TEXTO = '#3b4152';
const TEXTO_SUAVE = '#7b8194';
const FONDO = '#eef0f4';
const GRIS_SUAVE = '#f4f6fa';
// Tabla de datos de la notificación de contacto.
const TEXTO_DATO = '#2c3143';
const FONDO_ETIQUETA = '#f8f9fc';
const BORDE = '#e2e5ec';

/** Imagen embebida en el propio correo (se referencia con cid:). */
export interface InlineImage {
    cid: string;
    filename: string;
    /** Nombre del archivo dentro de src/mail/assets. */
    asset: string;
    contentType: string;
    /** Texto alternativo, por si el cliente no muestra imágenes. */
    alt: string;
}

export interface MailLayoutOptions {
    /** Resumen que muestra la bandeja junto al asunto. */
    preheader: string;
    /** Banner de cabecera. Sin él, se usa una franja con el nombre. */
    banner?: InlineImage;
    /** Título del cuerpo (solo se muestra si NO hay banner con el título). */
    heading?: string;
    /** Párrafos del cuerpo (HTML ya escapado por quien llama). */
    paragraphs: string[];
    button?: { label: string; url: string };
    /** Enlace en texto plano, por si el botón no funciona. */
    fallbackUrl?: string;
    /** Aviso destacado con la barra roja al costado. */
    notice?: string;
    /**
     * Filas de datos (se usa en la notificación de contacto). Con `block` la
     * fila ocupa el ancho completo y el valor va debajo de la etiqueta, para
     * contenido largo como el cuerpo del mensaje.
     */
    dataRows?: { label: string; value: string; block?: boolean }[];
    /** Reemplaza el "no respondas a esta dirección" del pie. */
    replyNote?: string;
}

const parrafo = (html: string, margenInferior: number): string =>
    `<p style="margin:0 0 ${margenInferior}px 0; font-size:16px; line-height:26px; mso-line-height-rule:exactly; color:${TEXTO};">${html}</p>`;

// Estilo compartido por las etiquetas de la tabla de datos (mayúsculas azules).
const ETIQUETA_DATO = `font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; letter-spacing:1px; font-weight:bold; color:${AZUL}; text-transform:uppercase;`;

export function renderMailLayout(options: MailLayoutOptions): string {
    const {
        preheader,
        banner,
        heading,
        paragraphs,
        button,
        fallbackUrl,
        notice,
        dataRows,
        replyNote,
    } = options;

    const cabecera = banner
        ? `      <td align="center" bgcolor="#ffffff" style="background-color:#ffffff; font-size:0; line-height:0;">
        <img src="cid:${banner.cid}" width="600" alt="${banner.alt}" style="display:block; width:100%; max-width:600px; height:auto; border:0; outline:none; text-decoration:none; font-family:Arial,Helvetica,sans-serif; font-size:20px; line-height:28px; font-weight:bold; color:${AZUL};" />
      </td>`
        : `      <td align="left" bgcolor="${AZUL}" style="background-color:${AZUL}; padding:26px 36px; border-bottom:4px solid ${ROJO}; font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:12px; line-height:16px; letter-spacing:2px; color:#aab4dd; font-weight:bold;">PANEL DE GESTIÓN</div>
        <div style="font-size:24px; line-height:32px; color:#ffffff; font-weight:bold; padding-top:6px;">${heading ?? 'Petrogas S.A.'}</div>
      </td>`;

    // Con tabla de datos el cuerpo respira distinto: el último párrafo pierde
    // su margen inferior porque la tabla ya aporta la separación.
    const tieneDatos = !!dataRows?.length;

    const cuerpo = paragraphs
        .map((p, i) =>
            parrafo(
                p,
                i < paragraphs.length - 1 ? 16 : tieneDatos ? 0 : 28,
            ),
        )
        .join('\n        ');

    const tablaDatos = tieneDatos
        ? `    <tr>
      <td class="px" style="padding:0 36px 8px 36px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border:1px solid ${BORDE}; border-bottom:0;">
${dataRows
    .map((r) =>
        r.block
            ? `        <tr>
          <td colspan="2" style="padding:0; border-bottom:1px solid ${BORDE};">
            <div style="padding:14px 18px 4px 18px; ${ETIQUETA_DATO}">${r.label}</div>
            <div style="padding:0 18px 18px 18px; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:25px; mso-line-height-rule:exactly; color:${TEXTO_DATO};">${r.value}</div>
          </td>
        </tr>`
            : `        <tr>
          <td width="34%" valign="top" style="width:34%; padding:14px 16px; border-bottom:1px solid ${BORDE}; background-color:${FONDO_ETIQUETA}; ${ETIQUETA_DATO}">${r.label}</td>
          <td valign="top" style="padding:14px 18px; border-bottom:1px solid ${BORDE}; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:23px; mso-line-height-rule:exactly; color:${TEXTO_DATO};">${r.value}</td>
        </tr>`,
    )
    .join('\n')}
        </table>
      </td>
    </tr>
`
        : '';

    const boton = button
        ? `    <tr>
      <td class="px" style="padding:${tieneDatos ? '26px 36px 30px 36px' : '0 36px 30px 36px'};">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" bgcolor="${AZUL}" style="background-color:${AZUL}; border-radius:4px; border-bottom:3px solid ${AZUL_OSCURO};">
            <a href="${button.url}" style="display:block; padding:16px 34px; font-family:Arial,Helvetica,sans-serif; font-size:16px; line-height:20px; mso-line-height-rule:exactly; font-weight:bold; color:#ffffff; text-decoration:none; letter-spacing:0.4px;">${button.label}</a>
          </td>
        </tr>
        </table>
      </td>
    </tr>
`
        : '';

    const enlaceAlternativo = fallbackUrl
        ? `    <tr>
      <td class="px" style="padding:0 36px 26px 36px; font-family:Arial,Helvetica,sans-serif;">
        <p style="margin:0 0 8px 0; font-size:13px; line-height:20px; mso-line-height-rule:exactly; color:${TEXTO_SUAVE};">
          Si el botón no funciona, copiá y pegá este enlace en tu navegador:
        </p>
        <p style="margin:0; font-size:13px; line-height:20px; mso-line-height-rule:exactly; word-break:break-all;">
          <a href="${fallbackUrl}" style="color:${AZUL}; text-decoration:underline;">${fallbackUrl}</a>
        </p>
      </td>
    </tr>
`
        : '';

    const aviso = notice
        ? `    <tr>
      <td class="px" style="padding:0 36px 34px 36px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background-color:${GRIS_SUAVE};">
        <tr>
          <td width="4" style="width:4px; background-color:${ROJO}; font-size:0; line-height:0;">&nbsp;</td>
          <td style="padding:16px 20px; font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#4a5063;">
            ${notice}
          </td>
        </tr>
        </table>
      </td>
    </tr>
`
        : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>Petrogas S.A.</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  @media only screen and (max-width:620px) {
    .px { padding-left:24px !important; padding-right:24px !important; }
    .h1 { font-size:26px !important; }
    .logo { width:132px !important; height:auto !important; }
    .stack { display:block !important; width:100% !important; text-align:left !important; }
    .stack-r { padding-top:18px !important; text-align:left !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:${FONDO}; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">

<span style="display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all;">${preheader}</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${FONDO};">
<tr>
<td align="center" style="padding:32px 12px;">

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px; max-width:600px; background-color:#ffffff; border-radius:6px; overflow:hidden; box-shadow:0 1px 4px rgba(16,26,64,0.10);">

    <!-- ============ CABECERA ============ -->
    <tr>
${cabecera}
    </tr>

    <!-- ============ CUERPO ============ -->
    <tr>
      <td class="px" style="padding:${tieneDatos ? '34px 36px 22px 36px' : '34px 36px 8px 36px'}; font-family:Arial,Helvetica,sans-serif;">
        ${cuerpo}
      </td>
    </tr>

${tablaDatos}${boton}${enlaceAlternativo}${aviso}
    <!-- ============ PIE ============ -->
    <tr><td style="padding:0 36px;"><div style="height:1px; line-height:1px; font-size:0; background-color:#e2e5ec;">&nbsp;</div></td></tr>
    <tr>
      <td class="px" style="padding:26px 36px 30px 36px; font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:15px; line-height:22px; mso-line-height-rule:exactly; color:${AZUL}; font-weight:bold; padding-bottom:8px;">Petrogas S.A.</div>
        <div style="font-size:14px; line-height:24px; mso-line-height-rule:exactly; color:#5b6172;">Chubut 850 &middot; Cutral-Có, Neuquén &middot; Argentina</div>
        <div style="font-size:14px; line-height:24px; mso-line-height-rule:exactly; color:#5b6172;">
          <a href="tel:+542995573812" style="color:#5b6172; text-decoration:none;">299-5573812</a> / <a href="tel:+542994960901" style="color:#5b6172; text-decoration:none;">299-4960901</a>
        </div>
        <div style="font-size:14px; line-height:24px; mso-line-height-rule:exactly;">
          <a href="mailto:petrogas@petrogassa.com" style="color:${AZUL}; text-decoration:none;">petrogas@petrogassa.com</a>
        </div>
      </td>
    </tr>
    <tr>
      <td class="px" style="padding:14px 36px 20px 36px; background-color:${GRIS_SUAVE}; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; mso-line-height-rule:exactly; color:#8a90a0;">
        ${replyNote ?? 'Este es un correo automático; por favor no respondas a esta dirección.'}
      </td>
    </tr>
    <tr><td style="background-color:${AZUL}; height:6px; line-height:6px; font-size:0;">&nbsp;</td></tr>

  </table>

</td>
</tr>
</table>

</body>
</html>`;
}

/*
 * Banners de cabecera, uno por correo. Los tres viajan embebidos en el mensaje
 * (ver MailService.inlineImage), no por URL.
 *
 * Van en JPEG y no en PNG a propósito: el diseño tiene degradados, así que los
 * originales pesaban ~335 KB cada uno (446 KB ya en base64, que es como viajan
 * dentro del correo) contra ~50 KB del JPEG, sin diferencia visible.
 *
 * Al reemplazarlos, respetar estas dos opciones de exportación:
 *   - croma 4:4:4 (sin submuestreo): los banners tienen texto rojo fino sobre
 *     blanco, que con el 4:2:0 por defecto sale con halos de color.
 *   - JPEG baseline, NO progresivo: el progresivo se dibuja en pasadas (se ve
 *     borroso y recién después define) y Outlook de escritorio lo renderiza
 *     mal. Acá no ahorra ni un KB, así que no hay nada que ganar.
 *
 * NO usar WebP: varios clientes de correo (Outlook de escritorio entre ellos)
 * no lo soportan y mostrarían un hueco en lugar del banner.
 */

/** Acompaña al correo de activación de cuenta. */
export const BANNER_BIENVENIDA: InlineImage = {
    cid: 'banner-bienvenida',
    filename: 'banner-bienvenida.jpg',
    asset: 'banner-bienvenida.jpg',
    contentType: 'image/jpeg',
    alt: 'Petrogas S.A. — Te damos la bienvenida',
};

/** Acompaña al correo de restablecimiento de contraseña. */
export const BANNER_PASSWORD: InlineImage = {
    cid: 'banner-password',
    filename: 'banner-password.jpg',
    asset: 'banner-password.jpg',
    contentType: 'image/jpeg',
    alt: 'Petrogas S.A. — Restablecé tu contraseña',
};

/** Acompaña la notificación interna del formulario de contacto. */
export const BANNER_CONTACTO: InlineImage = {
    cid: 'banner-contacto',
    filename: 'banner-contacto.jpg',
    asset: 'banner-contacto.jpg',
    contentType: 'image/jpeg',
    alt: 'Petrogas S.A. — Nuevo mensaje de contacto',
};
