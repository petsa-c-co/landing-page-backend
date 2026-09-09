import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsMediaKey } from '@/common/decorators/media-key.decorator';

/**
 * PATCH del singleton de configuración. Semántica de cada campo:
 *  - ausente (undefined): no se toca;
 *  - null: se LIMPIA (borra la marca / el texto);
 *  - string: se reemplaza.
 * (@IsOptional salta la validación tanto para undefined como para null.)
 *
 * ANTES DE AGREGAR UN CAMPO ACÁ: este DTO lo puede escribir el rol AUDITOR,
 * porque hoy contiene SOLO lo de la certificación, que es lo que ese rol
 * mantiene. Un campo nuevo queda automáticamente a su alcance. Si lo que vas a
 * agregar no es de certificación, partí el endpoint en dos en vez de ampliar
 * este (ver el comentario del @Patch en site-settings.controller.ts).
 */
export class UpdateSiteSettingsDto {
    // Key devuelta por POST /media/uploads (bucket público).
    @IsOptional()
    @IsMediaKey('La marca de certificación')
    certificationMarkImage?: string | null;

    @IsOptional()
    @IsString({
        message: 'El texto de alcance debe ser una cadena de texto',
    })
    @MaxLength(1000, {
        message: 'El texto de alcance no puede tener más de 1000 caracteres',
    })
    certificationScopeText?: string | null;
}
