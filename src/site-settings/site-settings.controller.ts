import { Body, Controller, Get, Header, Patch } from '@nestjs/common';
import {
    SiteSettingsService,
    SiteSettingsView,
} from './site-settings.service';
import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto';
import { Auth } from '@/auth/decorators/auth.decorator';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';

// Configuración global del sitio (singleton, sin :id en la URL).
@Controller('site-settings')
export class SiteSettingsController {
    constructor(private readonly siteSettingsService: SiteSettingsService) {}

    // Público: lo consume el footer en todas las páginas -> cacheable 5 min
    // (tras un PATCH, el cambio tarda a lo sumo eso en verse).
    @Get()
    @Header('Cache-Control', 'public, max-age=300')
    @ResponseMessage('Configuración del sitio obtenida correctamente')
    get(): Promise<SiteSettingsView> {
        return this.siteSettingsService.get();
    }

    // El AUDITOR entra acá porque los dos campos de este singleton —la marca de
    // Bureau Veritas y su texto de alcance— son justamente lo que mantiene.
    //
    // OJO si agregás un campo a UpdateSiteSettingsDto: el auditor gana permiso
    // de escritura sobre él sin que nadie lo decida. Si esta configuración
    // crece más allá de la certificación, hay que partirla en dos endpoints.
    // El test de roles de site-settings.controller.spec.ts lo deja fijado.
    @Patch()
    @Auth(UserRoles.ADMIN, UserRoles.AUDITOR)
    @ResponseMessage('Configuración del sitio actualizada correctamente')
    update(@Body() dto: UpdateSiteSettingsDto): Promise<SiteSettingsView> {
        return this.siteSettingsService.update(dto);
    }
}
