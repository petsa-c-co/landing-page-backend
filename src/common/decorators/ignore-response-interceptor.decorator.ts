import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const IGNORE_RESPONSE_INTERCEPTOR_KEY = 'ignoreResponseInterceptor';

export const IgnoreResponseInterceptor = (): CustomDecorator<string> =>
    SetMetadata(IGNORE_RESPONSE_INTERCEPTOR_KEY, true);
