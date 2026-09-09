import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { NewsQueryDto } from './news-query.dto';

export class AdminNewsQueryDto extends NewsQueryDto {
    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value === 'true' : value,
    )
    @IsBoolean({ message: 'published debe ser true o false' })
    published?: boolean;
}
