import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Una revisión del sitio: un día en el que se cambió algo.
 *
 * Es el "Rev. X.Y" que muestra el footer, exigido por el control de documentos
 * de la certificación. Se crea sola con el primer cambio de cada día y agrupa
 * todos los de esa jornada.
 *
 * NO tiene controller, ni DTO, ni endpoint de escritura, y eso es la garantía
 * de que el número no se puede maquillar: no es que esté restringido por rol,
 * es que no existe forma de escribirlo desde afuera. Solo el subscriber del
 * registro de cambios inserta acá.
 *
 * No extiende BaseEntity: una revisión nunca se edita, así que un `updatedAt`
 * sería una mentira.
 */
@Entity('site_revisions')
export class SiteRevision {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /**
     * Día calendario ARGENTINO que agrupa los cambios, como `YYYY-MM-DD`.
     *
     * Único: es lo que hace atómica el alta del primer cambio del día. Si dos
     * requests simultáneos intentan crearla, uno recibe el error de duplicado y
     * relee (ver SiteRevisionService).
     */
    @Column({ type: 'date', unique: true })
    day: string;

    /**
     * Contador correlativo desde 1. Crece PARA SIEMPRE y nunca se repite: es la
     * fuente de verdad y la que ordena.
     *
     * La etiqueta que se muestra sí da la vuelta —dos dígitos, `01`…`99`, y a
     * los tres vuelve a `01`— pero eso pasa solo al formatear, no acá. Ver
     * revision-number.util.ts.
     */
    @Column({ type: 'int', unique: true })
    number: number;

    // Con zona: el día de la revisión depende de la hora local argentina, así
    // que guardar el instante sin zona haría ambiguo el propio registro.
    @Column({ type: 'timestamptz', default: () => 'now()' })
    createdAt: Date;
}
