import { PartialType } from '@nestjs/mapped-types';
import { CreateDegreeTitleDto } from './create-degree-title.dto';

export class UpdateDegreeTitleDto extends PartialType(CreateDegreeTitleDto) {}
