import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Agrega los niveles 'primario' y 'secundario' (común, no técnico) al catálogo
 * de títulos: muchos puestos del rubro (Maestranza, Tareas Generales, Pañolero,
 * Amolador) se cubren con gente sin título técnico, que antes no tenía ninguna
 * opción y caía en texto libre.
 *
 * Nota sobre el ORDEN del enum: `ALTER TYPE ... ADD VALUE` agrega los valores
 * al FINAL, así que una base construida con migraciones queda con el orden
 * (..., primario, secundario) mientras que una creada con `synchronize` los
 * pone al principio, en el orden del enum de TypeScript. Es una diferencia
 * inocua y verificada: la app nunca ordena ni compara por `level` (los listados
 * ordenan por sortOrder/name y filtran por igualdad), y `migration:generate`
 * no lo detecta como cambio pendiente, así que no genera migraciones espurias.
 * Recrear el tipo solo para reordenarlo implicaría reescribir la columna sin
 * ningún beneficio funcional.
 */
export class AddPrimarioSecundarioLevels1784723893716 implements MigrationInterface {
    name = 'AddPrimarioSecundarioLevels1784723893716'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // IF NOT EXISTS: en desarrollo `synchronize` puede haber agregado ya
        // estos valores al arrancar la app antes de correr la migración; sin
        // esto, `migration:run` fallaría en esas bases con "value already
        // exists". En una base limpia (producción) el comportamiento es idéntico.
        await queryRunner.query(`ALTER TYPE "public"."degree_titles_level_enum" ADD VALUE IF NOT EXISTS 'primario'`);
        await queryRunner.query(`ALTER TYPE "public"."degree_titles_level_enum" ADD VALUE IF NOT EXISTS 'secundario'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."degree_titles_level_enum_old" AS ENUM('secundario_tecnico', 'terciario', 'universitario', 'formacion_profesional')`);
        await queryRunner.query(`ALTER TABLE "degree_titles" ALTER COLUMN "level" TYPE "public"."degree_titles_level_enum_old" USING "level"::"text"::"public"."degree_titles_level_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."degree_titles_level_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."degree_titles_level_enum_old" RENAME TO "degree_titles_level_enum"`);
    }

}
