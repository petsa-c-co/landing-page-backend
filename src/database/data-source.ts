import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import * as path from 'path';

// Este archivo lo usa la CLI de TypeORM (migration:generate/run/revert), NUNCA
// la app en runtime (esa usa TypeOrmModule.forRootAsync en app.module.ts).
// A propósito no importa nada del proyecto con el alias "@/": la CLI de
// TypeORM (typeorm-ts-node-commonjs) registra ts-node pero NO tsconfig-paths,
// así que cualquier import "@/..." aquí fallaría en dev. Entities y
// migrations se referencian por glob de archivos, no por import.

// En Docker, las variables ya las inyecta `env_file` (docker-compose) y el
// archivo .env.* no existe dentro del contenedor (lo excluye .dockerignore);
// dotenv no pisa variables ya presentes en process.env, así que este config()
// no hace nada en ese caso y no rompe nada. Fuera de Docker (CLI en el host),
// carga el archivo correspondiente al entorno, igual que ConfigModule.
config({
    path: process.env.NODE_ENV === 'production' ? '.env.prod' : '.env.dev',
});

// __dirname es src/database en dev (ts-node) y dist/database en producción
// (compilado); el glob ".entity{.ts,.js}" cubre ambos casos con el mismo código.
export const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    entities: [path.join(__dirname, '..', '**', '*.entity{.ts,.js}')],
    migrations: [path.join(__dirname, 'migrations', '*{.ts,.js}')],
    migrationsTableName: 'migrations',
    // Esta instancia jamás sincroniza: la usa solo la CLI de migraciones.
    synchronize: false,
    logging: ['error', 'warn'],
});
