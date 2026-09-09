import { attachmentDisposition } from './content-disposition.util';

describe('attachmentDisposition', () => {
    it('manda las dos variantes: ASCII y UTF-8', () => {
        expect(attachmentDisposition('CV - Ana Pérez.pdf')).toBe(
            `attachment; filename="CV - Ana Perez.pdf"; ` +
                `filename*=UTF-8''${encodeURIComponent('CV - Ana Pérez.pdf')}`,
        );
    });

    it('conserva el acento en filename* (es lo que usa el navegador)', () => {
        const header = attachmentDisposition('Pérez.pdf');
        // 'é' percent-encoded en UTF-8.
        expect(header).toContain("filename*=UTF-8''P%C3%A9rez.pdf");
    });

    it('en la variante ASCII quita la tilde en vez de romper la letra', () => {
        expect(attachmentDisposition('Muñoz Ñandú.pdf')).toContain(
            'filename="Munoz Nandu.pdf"',
        );
    });

    it('descarta comillas para que no se pueda alterar la cabecera', () => {
        const header = attachmentDisposition('Ana "La Jefa".pdf');

        // Exactamente dos comillas: las que delimitan el filename ASCII.
        expect(header.match(/"/g)).toHaveLength(2);
        expect(header).toContain('filename="Ana La Jefa.pdf"');
    });

    it('reemplaza los caracteres no representables en ASCII', () => {
        expect(attachmentDisposition('CV 简历.pdf')).toContain(
            'filename="CV __.pdf"',
        );
    });

    it('codifica también los espacios en filename*', () => {
        expect(attachmentDisposition('a b.pdf')).toContain(
            "filename*=UTF-8''a%20b.pdf",
        );
    });
});
