import { Column, Entity, Index } from 'typeorm';
import { SoftDeletableEntity } from '@/common/entities/soft-deletable.entity';
import { NewsCategory } from '../enum/news-category.enum';
import { NewsSource } from '../enum/news-source.enum';

@Entity('news_posts')
// El listado público filtra por publicada y ordena por fecha.
@Index(['isPublished', 'publishedAt'])
export class NewsPost extends SoftDeletableEntity {
    @Column({ type: 'varchar', length: 200 })
    title: string;

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 220 })
    slug: string;

    @Index()
    @Column({ type: 'enum', enum: NewsCategory })
    category: NewsCategory;

    // Fecha visible de publicación; se fija al publicar si no se envía.
    @Column({ type: 'timestamp', nullable: true })
    publishedAt: Date | null;

    // Key en el área pública del almacenamiento.
    @Column({ type: 'varchar', length: 500, nullable: true })
    coverImage: string | null;

    @Column({ type: 'varchar', length: 500 })
    excerpt: string;

    // Cuerpo completo para la página de detalle.
    @Column({ type: 'text' })
    body: string;

    @Column({ type: 'boolean', default: false })
    isFeatured: boolean;

    // false = borrador (solo visible en el panel).
    @Column({ type: 'boolean', default: false })
    isPublished: boolean;

    // Origen de la nota: manual (panel) o importada desde LinkedIn.
    @Column({ type: 'enum', enum: NewsSource, default: NewsSource.MANUAL })
    source: NewsSource;

    // URL del post original en LinkedIn (si la nota vino de una importación).
    @Column({ type: 'varchar', length: 500, nullable: true })
    externalUrl: string | null;
}
