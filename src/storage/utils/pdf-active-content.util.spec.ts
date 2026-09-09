import { detectActivePdfContent } from './pdf-active-content.util';

const pdf = (cuerpo: string): Buffer =>
    Buffer.from(`%PDF-1.7\n${cuerpo}\n%%EOF`, 'latin1');

describe('detectActivePdfContent', () => {
    it('un PDF común no tiene contenido activo', () => {
        expect(
            detectActivePdfContent(
                pdf('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj'),
            ),
        ).toBeNull();
    });

    it.each([
        ['/JavaScript', '<< /S /JavaScript /JS (app.alert\\(1\\)) >>'],
        ['/JS', '<< /S /Named /JS 4 0 R >>'],
        ['/Launch', '<< /S /Launch /F (cmd.exe) >>'],
        ['/EmbeddedFile', '<< /Type /EmbeddedFile /Length 99 >>'],
    ])('detecta %s', (marcador, cuerpo) => {
        expect(detectActivePdfContent(pdf(cuerpo))).toBe(marcador);
    });

    /**
     * Se devuelve CUÁL marcador y no un booleano justamente para esto: si
     * empiezan a aparecer rechazos de CV legítimos, hay que poder ver en el log
     * qué marcador los dispara para sacarlo de la lista.
     */
    it('dice cuál marcador encontró, no solo que encontró uno', () => {
        expect(detectActivePdfContent(pdf('<< /Type /EmbeddedFile >>'))).toBe(
            '/EmbeddedFile',
        );
    });

    /**
     * `/OpenAction` es común y casi siempre benigno —fija el zoom o la página
     * inicial—. Rechazarlo tiraría abajo CV legítimos; lo peligroso es que
     * apunte a JavaScript, y eso se detecta por el /JavaScript.
     */
    it('NO rechaza /OpenAction solo, que es habitual y benigno', () => {
        expect(
            detectActivePdfContent(
                pdf('<< /OpenAction [ 3 0 R /XYZ null null 0 ] >>'),
            ),
        ).toBeNull();
    });

    it('pero sí rechaza el /OpenAction que dispara JavaScript', () => {
        expect(
            detectActivePdfContent(
                pdf('<< /OpenAction << /S /JavaScript /JS (evil()) >> >>'),
            ),
        ).toBe('/JavaScript');
    });

    // `/JS` son tres bytes: sin exigir un delimitador detrás, aparecería solo
    // dentro de cualquier stream comprimido y rechazaría PDF sanos.
    it('no confunde una coincidencia dentro de datos binarios', () => {
        expect(
            detectActivePdfContent(
                Buffer.concat([
                    Buffer.from('%PDF-1.7\nstream\n', 'latin1'),
                    Buffer.from('/JSONX/JavaScriptura/Launchpad', 'latin1'),
                    Buffer.from('\nendstream', 'latin1'),
                ]),
            ),
        ).toBeNull();
    });

    it('detecta el marcador aunque esté al final del archivo', () => {
        expect(
            detectActivePdfContent(Buffer.from('%PDF-1.7\n/Launch', 'latin1')),
        ).toBe('/Launch');
    });

    it('un buffer vacío no rompe', () => {
        expect(detectActivePdfContent(Buffer.alloc(0))).toBeNull();
    });
});
