import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'response_message';

/**
 * Define el `message` de nivel superior del sobre de respuesta estándar.
 * Uso: @ResponseMessage('Usuario obtenido correctamente')
 */
export const ResponseMessage = (message: string): CustomDecorator<string> =>
    SetMetadata(RESPONSE_MESSAGE_KEY, message);
