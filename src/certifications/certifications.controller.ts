import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
} from '@nestjs/common';
import { CertificationsService } from './certifications.service';
import { Certification } from './entities/certification.entity';
import { CreateCertificationDto } from './dto/create-certification.dto';
import { UpdateCertificationDto } from './dto/update-certification.dto';
import { Auth } from '@/auth/decorators/auth.decorator';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';

@Controller('certifications')
export class CertificationsController {
    constructor(
        private readonly certificationsService: CertificationsService,
    ) {}

    @Get()
    @ResponseMessage('Certificaciones obtenidas correctamente')
    findAll(): Promise<Certification[]> {
        return this.certificationsService.findAll();
    }

    @Post()
    @Auth(UserRoles.ADMIN, UserRoles.AUDITOR)
    @ResponseMessage('Certificación creada correctamente')
    create(
        @Body() createCertificationDto: CreateCertificationDto,
    ): Promise<Certification> {
        return this.certificationsService.create(createCertificationDto);
    }

    @Patch(':id')
    @Auth(UserRoles.ADMIN, UserRoles.AUDITOR)
    @ResponseMessage('Certificación actualizada correctamente')
    update(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
        @Body() updateCertificationDto: UpdateCertificationDto,
    ): Promise<Certification> {
        return this.certificationsService.update(id, updateCertificationDto);
    }

    @Delete(':id')
    @Auth(UserRoles.ADMIN, UserRoles.AUDITOR)
    @ResponseMessage('Certificación movida a la papelera')
    remove(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<void> {
        return this.certificationsService.remove(id);
    }

    // Papelera: certificaciones borradas (soft delete).
    @Get('admin/trash')
    @Auth(UserRoles.ADMIN, UserRoles.AUDITOR)
    @ResponseMessage('Papelera obtenida correctamente')
    findTrash(): Promise<Certification[]> {
        return this.certificationsService.findTrash();
    }

    @Post(':id/restore')
    @Auth(UserRoles.ADMIN, UserRoles.AUDITOR)
    @ResponseMessage('Certificación restaurada correctamente')
    restore(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<Certification> {
        return this.certificationsService.restore(id);
    }

    @Delete(':id/permanent')
    @Auth(UserRoles.ADMIN, UserRoles.AUDITOR)
    @ResponseMessage('Certificación eliminada definitivamente')
    removePermanent(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<void> {
        return this.certificationsService.removePermanent(id);
    }
}
