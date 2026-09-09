import { Body, Controller, Get, Header, Patch } from '@nestjs/common';
import { SiteImagesService, SiteImagesView } from './site-images.service';
import { UpdateSiteImageDto } from './dto/update-site-image.dto';
import { Auth } from '@/auth/decorators/auth.decorator';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';

// Sub-recurso de la configuración del sitio: imágenes de cabecera por slot.
@Controller('site-settings/images')
export class SiteImagesController {
    constructor(private readonly siteImagesService: SiteImagesService) {}

    // Público: lo consumen las páginas fijas -> cacheable 5 min, igual que
    // /site-settings.
    @Get()
    @Header('Cache-Control', 'public, max-age=300')
    @ResponseMessage('Imágenes del sitio obtenidas correctamente')
    findAll(): Promise<SiteImagesView> {
        return this.siteImagesService.findAll();
    }

    @Patch()
    @Auth(UserRoles.ADMIN)
    @ResponseMessage('Imagen del sitio actualizada correctamente')
    update(@Body() dto: UpdateSiteImageDto): Promise<SiteImagesView> {
        return this.siteImagesService.update(dto);
    }
}
