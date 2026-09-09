import { DeleteDateColumn } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * Entidad con papelera (soft delete). Extiende BaseEntity y agrega `deletedAt`:
 * al "borrar" (softRemove) se setea la fecha en vez de eliminar la fila, y
 * TypeORM la excluye automáticamente de todas las consultas normales
 * (find/findOne/findAndCount/QueryBuilder). Para verlas hay que pedir
 * `withDeleted`. Se restaura con recover() y se elimina de verdad con remove().
 *
 * El toggle de visibilidad (isActive/isPublished) es independiente: ocultar no
 * es borrar. Un item borrado no aparece ni en el sitio ni en el listado admin;
 * solo en la papelera.
 */
export abstract class SoftDeletableEntity extends BaseEntity {
    @DeleteDateColumn({ type: 'timestamp', nullable: true })
    deletedAt: Date | null;
}
