import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ContactMessage } from './entities/contact-message.entity';
import { ContactMessageStatus } from './enum/contact-message-status.enum';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { ContactQueryDto } from './dto/contact-query.dto';
import { MailService } from '@/mail/mail.service';
import { paginate } from '@/common/utils/pagination.util';
import { PaginatedResult } from '@/common/interfaces/paginated-result.interface';

@Injectable()
export class ContactService {
    private readonly logger = new Logger(ContactService.name);

    constructor(
        @InjectRepository(ContactMessage)
        private readonly contactMessageRepository: Repository<ContactMessage>,
        private readonly mailService: MailService,
    ) {}

    /**
     * Alta pública. Se persiste PRIMERO (el mensaje queda en el panel aunque
     * el proveedor de correo falle); la notificación es best-effort.
     */
    async create(createDto: CreateContactMessageDto): Promise<{ id: string }> {
        const { referencia, ...datos } = createDto;

        // Campo trampa: en el formulario está oculto y sin acceso por teclado,
        // así que una persona no puede haberlo completado. Si viene con algo,
        // es un bot.
        //
        // Se responde como si hubiera salido bien, y con un id verosímil: un
        // error le avisa al bot que lo detectamos y prueba otra cosa, mientras
        // que un "gracias" lo manda contento a la próxima víctima. Lo que
        // importa es que no se guarda ni se notifica a nadie.
        //
        // No se registra ningún dato del envío: si algún día esto descartara
        // por error el mensaje de una persona, no queremos su nombre ni su
        // correo en los logs. Para diagnosticarlo alcanza con la frecuencia.
        if (referencia) {
            this.logger.warn(
                'Mensaje de contacto descartado por el campo trampa (honeypot)',
            );
            return { id: randomUUID() };
        }

        const contactMessage = this.contactMessageRepository.create(datos);
        const saved = await this.contactMessageRepository.save(contactMessage);

        this.mailService.sendContactNotification(saved).catch((err: unknown) => {
            this.logger.error(
                `Fallo al notificar el mensaje de contacto ${saved.id}`,
                err instanceof Error ? err.stack : String(err),
            );
        });

        return { id: saved.id };
    }

    async findAll(
        query: ContactQueryDto,
    ): Promise<PaginatedResult<ContactMessage>> {
        const where: FindOptionsWhere<ContactMessage> = {};
        if (query.status) {
            where.status = query.status;
        }
        const [items, total] = await this.contactMessageRepository.findAndCount(
            {
                where,
                order: { createdAt: 'DESC' },
                skip: (query.page - 1) * query.limit,
                take: query.limit,
            },
        );
        return paginate(items, total, query);
    }

    async updateStatus(
        id: string,
        status: ContactMessageStatus,
    ): Promise<ContactMessage> {
        const contactMessage = await this.contactMessageRepository.findOne({
            where: { id },
        });
        if (!contactMessage) {
            throw new NotFoundException('El mensaje no existe');
        }
        contactMessage.status = status;
        return this.contactMessageRepository.save(contactMessage);
    }

    async remove(id: string): Promise<void> {
        const contactMessage = await this.contactMessageRepository.findOne({
            where: { id },
        });
        if (!contactMessage) {
            throw new NotFoundException('El mensaje no existe');
        }
        await this.contactMessageRepository.remove(contactMessage);
    }
}
