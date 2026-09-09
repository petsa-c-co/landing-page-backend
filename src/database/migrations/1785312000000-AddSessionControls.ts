import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Control de sesiones:
 *  - refresh_tokens.rotatedAt: cuándo se consumió un token para rotarlo. Habilita
 *    la ventana de gracia que distingue un refresco concurrente (varias pestañas)
 *    de una reutilización maliciosa.
 *  - users.sessionsRevokedAt: cuándo un admin cerró las sesiones de la cuenta.
 *    Invalida también los access tokens ya emitidos, sin esperar a que venzan.
 *
 * Ambas nullable: las filas existentes quedan en null, que es el valor correcto
 * (ningún token rotado por este mecanismo todavía, ninguna sesión cerrada).
 *
 * Se usa IF NOT EXISTS porque en desarrollo `synchronize` puede haber creado ya
 * estas columnas al levantar la app con las entidades nuevas; sin eso, correr la
 * migración en ese entorno fallaría con "column already exists". En producción,
 * donde synchronize está apagado, las crea normalmente.
 */
export class AddSessionControls1785312000000 implements MigrationInterface {
    name = 'AddSessionControls1785312000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "rotatedAt" TIMESTAMP`,
        );
        await queryRunner.query(
            `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessionsRevokedAt" TIMESTAMP`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "users" DROP COLUMN IF EXISTS "sessionsRevokedAt"`,
        );
        await queryRunner.query(
            `ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "rotatedAt"`,
        );
    }
}
