import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { LinkedInImportStatus } from '../enum/linkedin-import-status.enum';

/**
 * Bandeja de entrada de LinkedIn: cada posteo traído por el sync entra acá como
 * candidato. Admin/rrhh lo aprueba (se copia a news_posts y se publica) o lo
 * rechaza. Se identifica por `externalId` (el URN de LinkedIn) para que el sync
 * no reimporte lo que ya fue procesado. NO es contenido público: la web sale de
 * news_posts.
 */
@Entity('linkedin_imports')
// La cola del panel filtra por estado y ordena por fecha del posteo.
@Index(['status', 'postedAt'])
export class LinkedInImport extends BaseEntity {
    // URN del post en LinkedIn (p. ej. "urn:li:share:123"). Clave de dedupe.
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 255 })
    externalId: string;

    @Column({
        type: 'enum',
        enum: LinkedInImportStatus,
        default: LinkedInImportStatus.PENDING,
    })
    status: LinkedInImportStatus;

    // Permalink al post original en LinkedIn.
    @Column({ type: 'varchar', length: 500 })
    externalUrl: string;

    // Texto del posteo tal como vino de LinkedIn.
    @Column({ type: 'text' })
    text: string;

    // URL de la imagen del post en LinkedIn (para previsualizar en la cola y
    // descargar al almacenamiento al aprobar). Puede ser larga o venir firmada -> text.
    @Column({ type: 'text', nullable: true })
    mediaUrl: string | null;

    // Nombre de la organización/autor del post.
    @Column({ type: 'varchar', length: 200, nullable: true })
    authorName: string | null;

    // Fecha en que se publicó en LinkedIn.
    @Column({ type: 'timestamp', nullable: true })
    postedAt: Date | null;

    // Id de la nota creada al aprobar (trazabilidad). Sin FK dura para no
    // acoplar el borrado de una nota con su registro de importación.
    @Column({ type: 'uuid', nullable: true })
    newsPostId: string | null;

    // Momento en que admin/rrhh lo aprobó o rechazó.
    @Column({ type: 'timestamp', nullable: true })
    reviewedAt: Date | null;
}
