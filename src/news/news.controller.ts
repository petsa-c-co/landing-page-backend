import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import { NewsService } from './news.service';
import { NewsPost } from './entities/news-post.entity';
import { CreateNewsPostDto } from './dto/create-news-post.dto';
import { UpdateNewsPostDto } from './dto/update-news-post.dto';
import { NewsQueryDto } from './dto/news-query.dto';
import { AdminNewsQueryDto } from './dto/admin-news-query.dto';
import { PaginatedResult } from '@/common/interfaces/paginated-result.interface';
import { Auth } from '@/auth/decorators/auth.decorator';
import { UserRoles } from '@/auth/enum/user-roles.enum';
import { ResponseMessage } from '@/common/decorators/response-message.decorator';

@Controller('news')
export class NewsController {
    constructor(private readonly newsService: NewsService) {}

    @Get()
    @ResponseMessage('Notas obtenidas correctamente')
    findPublic(
        @Query() query: NewsQueryDto,
    ): Promise<PaginatedResult<NewsPost>> {
        return this.newsService.findPublic(query);
    }

    // Rutas estáticas /admin ANTES de :slug para que no las capture el
    // parámetro (además "admin" está vetado como slug en el DTO).
    @Get('admin')
    @Auth(UserRoles.ADMIN, UserRoles.RRHH)
    @ResponseMessage('Notas obtenidas correctamente')
    findAdmin(
        @Query() query: AdminNewsQueryDto,
    ): Promise<PaginatedResult<NewsPost>> {
        return this.newsService.findAdmin(query);
    }

    // Papelera: notas borradas (soft delete). ANTES de admin/:id para que el
    // parámetro no capture "trash".
    @Get('admin/trash')
    @Auth(UserRoles.ADMIN, UserRoles.RRHH)
    @ResponseMessage('Papelera obtenida correctamente')
    findTrash(): Promise<NewsPost[]> {
        return this.newsService.findTrash();
    }

    @Get('admin/:id')
    @Auth(UserRoles.ADMIN, UserRoles.RRHH)
    @ResponseMessage('Nota obtenida correctamente')
    findOneAdmin(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<NewsPost> {
        return this.newsService.findOneById(id);
    }

    @Get(':slug')
    @ResponseMessage('Nota obtenida correctamente')
    findOne(@Param('slug') slug: string): Promise<NewsPost> {
        return this.newsService.findOneBySlug(slug);
    }

    @Post()
    @Auth(UserRoles.ADMIN, UserRoles.RRHH)
    @ResponseMessage('Nota creada correctamente')
    create(@Body() createNewsPostDto: CreateNewsPostDto): Promise<NewsPost> {
        return this.newsService.create(createNewsPostDto);
    }

    @Patch(':id')
    @Auth(UserRoles.ADMIN, UserRoles.RRHH)
    @ResponseMessage('Nota actualizada correctamente')
    update(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
        @Body() updateNewsPostDto: UpdateNewsPostDto,
    ): Promise<NewsPost> {
        return this.newsService.update(id, updateNewsPostDto);
    }

    @Delete(':id')
    @Auth(UserRoles.ADMIN, UserRoles.RRHH)
    @ResponseMessage('Nota movida a la papelera')
    remove(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<void> {
        return this.newsService.remove(id);
    }

    @Post(':id/restore')
    @Auth(UserRoles.ADMIN, UserRoles.RRHH)
    @ResponseMessage('Nota restaurada correctamente')
    restore(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<NewsPost> {
        return this.newsService.restore(id);
    }

    @Delete(':id/permanent')
    @Auth(UserRoles.ADMIN, UserRoles.RRHH)
    @ResponseMessage('Nota eliminada definitivamente')
    removePermanent(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    ): Promise<void> {
        return this.newsService.removePermanent(id);
    }
}
