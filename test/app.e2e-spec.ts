import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    it('/ (GET)', () => {
        // El sobre estándar viene de los providers APP_* de AppModule, por lo
        // que el e2e lo ejercita igual que producción.
        return request(app.getHttpServer())
            .get('/')
            .expect(200)
            .expect((res) => {
                expect(res.body).toMatchObject({
                    success: true,
                    statusCode: 200,
                    message: 'Servicio operativo',
                    data: 'Hello World!',
                });
            });
    });

    afterEach(async () => {
        await app.close();
    });
});
