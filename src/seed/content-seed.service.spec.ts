import { Repository } from 'typeorm';
import { ContentSeedService } from './content-seed.service';
import { Service } from '@/services/entities/service.entity';
import { Certification } from '@/certifications/entities/certification.entity';
import {
    INITIAL_CERTIFICATIONS,
    INITIAL_SERVICES,
} from './data/initial-content';
import { auditContext } from '@/change-log/audit-context';

/**
 * El contenido que va a ver la empresa el día que se despliegue en producción.
 *
 * Se fija acá porque un seed que quedó corto no rompe nada: la app arranca, el
 * sitio queda a medias y nadie se entera hasta que alguien mira la home. Y
 * porque el seed corre UNA sola vez —si la tabla ya tiene algo no vuelve a
 * tocar—, así que un error no se corrige redesplegando.
 */
describe('INITIAL_SERVICES', () => {
    it('son los dos servicios vigentes de Petrogas', () => {
        expect(INITIAL_SERVICES.map((s) => s.slug)).toEqual([
            'operacion-y-mantenimiento',
            'transporte-de-personal',
        ]);
    });

    it('cada uno trae los textos y los ítems que muestra el sitio', () => {
        for (const servicio of INITIAL_SERVICES) {
            expect(servicio.title.length).toBeGreaterThan(0);
            expect(servicio.shortDescription.length).toBeGreaterThan(0);
            expect(servicio.longDescription.length).toBeGreaterThan(0);
            expect(servicio.items.length).toBeGreaterThan(0);
        }
    });

    // El orden del listado sale de sortOrder, no del orden del array.
    it('el sortOrder no se repite', () => {
        const ordenes = INITIAL_SERVICES.map((s) => s.sortOrder);
        expect(new Set(ordenes).size).toBe(ordenes.length);
    });

    it('las certificaciones son las tres que la empresa mantiene', () => {
        expect(INITIAL_CERTIFICATIONS.map((c) => c.title)).toEqual([
            'ISO 9001:2015',
            'ISO 14001:2015',
            'ISO 45001:2018',
        ]);
    });
});

interface RepoFalso {
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
}

describe('ContentSeedService', () => {
    let seed: ContentSeedService;
    let servicios: RepoFalso;
    let certificaciones: RepoFalso;

    beforeEach(() => {
        const repo = (): RepoFalso => ({
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn((x: unknown) => x),
            save: jest.fn((x: unknown) => Promise.resolve(x)),
        });
        servicios = repo();
        certificaciones = repo();
        seed = new ContentSeedService(
            servicios as unknown as Repository<Service>,
            certificaciones as unknown as Repository<Certification>,
        );
    });

    it('siembra los dos servicios con sus ítems ordenados', async () => {
        await seed.onApplicationBootstrap();

        expect(servicios.save).toHaveBeenCalledTimes(INITIAL_SERVICES.length);
        const guardados = servicios.save.mock.calls.map(
            ([s]) => s as { slug: string; items: { sortOrder: number }[] },
        );
        expect(guardados.map((s) => s.slug)).toEqual([
            'operacion-y-mantenimiento',
            'transporte-de-personal',
        ]);
        // El orden de los ítems dentro de cada servicio sale del array.
        expect(guardados[0].items.map((i) => i.sortOrder)).toEqual([
            0, 1, 2, 3, 4, 5, 6,
        ]);
    });

    it('siembra las tres certificaciones', async () => {
        await seed.onApplicationBootstrap();

        expect(certificaciones.save).toHaveBeenCalledTimes(1);
        const [lote] = certificaciones.save.mock.calls[0] as [
            { title: string }[],
        ];
        expect(lote).toHaveLength(INITIAL_CERTIFICATIONS.length);
    });

    /**
     * La condición es "la tabla está vacía", contando la papelera: si alguien
     * borró todos los servicios a propósito, el próximo reinicio no debe
     * resucitarlos.
     */
    it('no vuelve a sembrar si ya hay contenido, ni siquiera en la papelera', async () => {
        servicios.count.mockResolvedValue(1);
        certificaciones.count.mockResolvedValue(1);

        await seed.onApplicationBootstrap();

        expect(servicios.save).not.toHaveBeenCalled();
        expect(certificaciones.save).not.toHaveBeenCalled();
        expect(servicios.count).toHaveBeenCalledWith({ withDeleted: true });
        expect(certificaciones.count).toHaveBeenCalledWith({
            withDeleted: true,
        });
    });

    /**
     * Lo sembrado es la emisión inicial —la Rev. 00—, no un cambio. Si esto se
     * registrara, la primera revisión del sitio nacería con más de cien
     * asientos de "sistema" cada vez que se despliega en limpio.
     */
    it('no queda registrado en el registro de cambios', async () => {
        const contextos: (boolean | undefined)[] = [];
        servicios.save.mockImplementation((x: unknown) => {
            contextos.push(auditContext.actual()?.omitido);
            return Promise.resolve(x);
        });

        await seed.onApplicationBootstrap();

        expect(contextos.length).toBe(INITIAL_SERVICES.length);
        expect(contextos.every((omitido) => omitido === true)).toBe(true);
    });

    // El sitio a medias es un problema; el sitio caído es otro peor.
    it('un fallo de la base no impide que la app arranque', async () => {
        servicios.count.mockRejectedValue(new Error('sin conexión'));

        await expect(seed.onApplicationBootstrap()).resolves.toBeUndefined();
    });
});
