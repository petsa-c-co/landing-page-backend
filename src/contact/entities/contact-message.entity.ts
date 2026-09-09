import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { ContactMessageStatus } from '../enum/contact-message-status.enum';

// Mensaje del formulario público de contacto.
@Entity('contact_messages')
export class ContactMessage extends BaseEntity {
    @Column({ type: 'varchar', length: 100 })
    name: string;

    @Column({ type: 'varchar', length: 254 })
    email: string;

    @Column({ type: 'varchar', length: 30, nullable: true })
    phone: string | null;

    @Column({ type: 'varchar', length: 150, nullable: true })
    subject: string | null;

    @Column({ type: 'text' })
    message: string;

    @Index()
    @Column({
        type: 'enum',
        enum: ContactMessageStatus,
        default: ContactMessageStatus.NUEVA,
    })
    status: ContactMessageStatus;
}
