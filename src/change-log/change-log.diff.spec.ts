import { diffDeCampos, diffDeItems, comoTexto } from './change-log.diff';
import { ENTIDADES_AUDITADAS } from './audited-entities';
import { Certification } from '@/certifications/entities/certification.entity';
import { NewsPost } from '@/news/entities/news-post.entity';
import { ValueKind } from './entities/change-log-detail.entity';

const cert = ENTIDADES_AUDITADAS.get(Certification)!;
const novedad = ENTIDADES_AUDITADAS.get(NewsPost)!;

describe('comoTexto', () => {
    it.each([
        [true, 'Sí'],
        [false, 'No'],
        [0, '0'],
        [null, null],
        [undefined, null],
        ['', null],
    ])('%p -> %p', (entrada, esperado) => {
        expect(comoTexto(entrada)).toBe(esperado);
    });

    it('una fecha se lee como día, no como instante', () => {
        expect(comoTexto(new Date('2026-08-27T18:42:00Z'))).toBe('2026-08-27');
    });
});

describe('diffDeCampos', () => {
    it('registra el antes y el después de un campo corto', () => {
        const detalles = diffDeCampos(
            cert,
            { title: 'ISO 9001', description: 'Calidad' },
            { title: 'ISO 9001', description: 'Gestión de la calidad' },
        );

        expect(detalles).toHaveLength(1);
        expect(detalles[0]).toMatchObject({
            fieldLabel: 'Descripción',
            previousValue: 'Calidad',
            newValue: 'Gestión de la calidad',
        });
    });

    it('un campo que no cambió no genera nada', () => {
        expect(
            diffDeCampos(cert, { title: 'ISO 9001' }, { title: 'ISO 9001' }),
        ).toEqual([]);
    });

    it('ignora los timestamps y el id', () => {
        const detalles = diffDeCampos(
            cert,
            { title: 'ISO', id: 'a', updatedAt: new Date('2026-01-01') },
            { title: 'ISO', id: 'b', updatedAt: new Date('2026-02-02') },
        );

        expect(detalles).toEqual([]);
    });

    it.each<[string | null, string | null]>([
        [null, 'algo'],
        ['algo', null],
    ])('detecta el paso de %p a %p', (antes, despues) => {
        const detalles = diffDeCampos(
            cert,
            { subtitle: antes },
            { subtitle: despues },
        );

        expect(detalles).toHaveLength(1);
    });

    describe('campos de archivo', () => {
        it('guarda solo el nombre, no la ruta entera', () => {
            const [detalle] = diffDeCampos(
                cert,
                { logoImage: 'media/2026/07/viejo.png' },
                { logoImage: 'media/2026/08/nuevo.png' },
            );

            expect(detalle).toMatchObject({
                previousValue: 'viejo.png',
                newValue: 'nuevo.png',
                summary: 'Se reemplazó logo',
                valueKind: ValueKind.ARCHIVO,
            });
        });

        it('distingue cargar, reemplazar y quitar', () => {
            const cargar = diffDeCampos(cert, { logoImage: null }, { logoImage: 'media/x.png' });
            const quitar = diffDeCampos(cert, { logoImage: 'media/x.png' }, { logoImage: null });

            expect(cargar[0].summary).toContain('Se cargó');
            expect(quitar[0].summary).toContain('Se quitó');
        });
    });

    /**
     * La decisión que evita que el registro se vuelva inmanejable: el cuerpo de
     * una nota admite 100.000 caracteres y guardarlo en cada edición inflaría
     * la tabla y el Excel.
     */
    describe('campos largos', () => {
        it('dice que cambió, sin volcar el contenido', () => {
            const [detalle] = diffDeCampos(
                novedad,
                { body: 'a'.repeat(50_000) },
                { body: 'b'.repeat(50_000) },
            );

            expect(detalle).toMatchObject({
                fieldLabel: 'Cuerpo',
                previousValue: null,
                newValue: null,
                summary: 'Se modificó el cuerpo de la nota',
            });
        });

        it('pero si no cambió, no dice nada', () => {
            expect(
                diffDeCampos(novedad, { body: 'igual' }, { body: 'igual' }),
            ).toEqual([]);
        });
    });

    describe('altas', () => {
        it('lista los campos que vienen con algo, y omite los vacíos', () => {
            const detalles = diffDeCampos(cert, undefined, {
                title: 'ISO 45001',
                subtitle: 'Seguridad',
                logoImage: null,
                certificatePdf: null,
                sortOrder: 0,
            });

            // Un alta registra el estado inicial completo. El cero de `orden`
            // entra porque es un valor con significado, no un campo vacío; el
            // logo ausente no, porque no hay nada que contar.
            expect(detalles.map((d) => d.fieldLabel)).toEqual([
                'Norma',
                'Categoría',
                'Orden',
            ]);
        });
    });
});

/**
 * El caso que decide si el registro sirve o no. ServicesService.update()
 * reconstruye los ítems como objetos nuevos, así que TypeORM los borra y
 * reinserta todos en CADA edición. Sin esta comparación, tocar el título de un
 * servicio ensuciaría el registro con diez ítems "cambiados".
 */
describe('diffDeItems', () => {
    it('la misma lista no es un cambio, aunque se hayan reinsertado', () => {
        expect(
            diffDeItems(['Mecánica', 'Eléctrica'], ['Mecánica', 'Eléctrica']),
        ).toBeNull();
    });

    it('el orden sí importa: es lo que ve el visitante', () => {
        expect(
            diffDeItems(['Mecánica', 'Eléctrica'], ['Eléctrica', 'Mecánica']),
        ).not.toBeNull();
    });

    it('registra el antes y el después cuando cambia de verdad', () => {
        const detalle = diffDeItems(['Mecánica'], ['Mecánica', 'Eléctrica']);

        expect(detalle).toMatchObject({
            fieldLabel: 'Ítems',
            previousValue: 'Mecánica',
            newValue: 'Mecánica, Eléctrica',
            valueKind: ValueKind.LISTA,
        });
    });

    it('quedarse sin ítems se lee como vacío, no como texto raro', () => {
        expect(diffDeItems(['Mecánica'], [])).toMatchObject({
            newValue: null,
        });
    });
});
