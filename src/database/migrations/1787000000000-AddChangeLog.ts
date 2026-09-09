import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registro de cambios del sitio y numeración de revisiones.
 *
 * Lo pide el control de documentos de la certificación: cada cambio sobre el
 * contenido queda asentado, y el footer muestra un "Rev. X.Y" que sube solo,
 * una vez por cada día en que se tocó algo.
 *
 * Se escribe a mano y con `IF NOT EXISTS` porque en desarrollo `synchronize`
 * está encendido: las tablas ya se auto-crearon ahí y un CREATE pelado haría
 * fallar el `migration:run` con "already exists". Mismo criterio que
 * AddSessionControls.
 *
 * Sobre el diseño, dos cosas que parecen detalles y no lo son:
 *
 *  - `actorId` es ON DELETE SET NULL y convive con `actorLabel`, que guarda el
 *    nombre y el correo del momento. Un rastro de auditoría tiene que seguir
 *    siendo legible cuando el usuario que hizo el cambio ya no existe.
 *  - `change_log_entries` NO tiene claves foráneas hacia las tablas de
 *    contenido, y `entityLabel` guarda el nombre congelado. Tras un borrado
 *    definitivo, ese texto es el único rastro de qué era el registro.
 */
export class AddChangeLog1787000000000 implements MigrationInterface {
    name = 'AddChangeLog1787000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "public"."change_log_entries_action_enum" AS ENUM
                    ('creacion', 'modificacion', 'baja', 'restauracion', 'eliminacion');
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        `);
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "public"."change_log_entries_actorkind_enum" AS ENUM
                    ('usuario', 'sistema');
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        `);
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "public"."change_log_details_valuekind_enum" AS ENUM
                    ('texto', 'booleano', 'numero', 'fecha', 'archivo', 'lista');
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "site_revisions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "day" date NOT NULL,
                "number" integer NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_site_revisions_day" UNIQUE ("day"),
                CONSTRAINT "UQ_site_revisions_number" UNIQUE ("number"),
                CONSTRAINT "PK_site_revisions" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "change_log_entries" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "revisionId" uuid NOT NULL,
                "entityType" character varying(40) NOT NULL,
                "entityId" uuid NOT NULL,
                "entityLabel" character varying(200) NOT NULL,
                "action" "public"."change_log_entries_action_enum" NOT NULL,
                "actorId" uuid,
                "actorLabel" character varying(280) NOT NULL,
                "actorKind" "public"."change_log_entries_actorkind_enum" NOT NULL DEFAULT 'usuario',
                "requestId" uuid NOT NULL,
                CONSTRAINT "PK_change_log_entries" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "change_log_details" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "entryId" uuid NOT NULL,
                "field" character varying(60) NOT NULL,
                "fieldLabel" character varying(80) NOT NULL,
                "previousValue" text,
                "newValue" text,
                "summary" character varying(200),
                "valueKind" "public"."change_log_details_valuekind_enum" NOT NULL DEFAULT 'texto',
                CONSTRAINT "PK_change_log_details" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_change_log_entries_occurredAt" ON "change_log_entries" ("occurredAt")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_change_log_entries_entity" ON "change_log_entries" ("entityType", "entityId")`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_change_log_details_entryId" ON "change_log_details" ("entryId")`,
        );

        await queryRunner.query(`
            DO $$ BEGIN
                ALTER TABLE "change_log_entries"
                    ADD CONSTRAINT "FK_change_log_entries_revision"
                    FOREIGN KEY ("revisionId") REFERENCES "site_revisions"("id")
                    ON DELETE RESTRICT;
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        `);
        await queryRunner.query(`
            DO $$ BEGIN
                ALTER TABLE "change_log_entries"
                    ADD CONSTRAINT "FK_change_log_entries_actor"
                    FOREIGN KEY ("actorId") REFERENCES "users"("id")
                    ON DELETE SET NULL;
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        `);
        await queryRunner.query(`
            DO $$ BEGIN
                ALTER TABLE "change_log_details"
                    ADD CONSTRAINT "FK_change_log_details_entry"
                    FOREIGN KEY ("entryId") REFERENCES "change_log_entries"("id")
                    ON DELETE CASCADE;
            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        `);
    }

    /**
     * Revierte del todo: borra el registro y la numeración.
     *
     * A diferencia del `up`, acá no hace falta ser tolerante — si las tablas no
     * están, `IF EXISTS` no se queja.
     */
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "change_log_details"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "change_log_entries"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "site_revisions"`);
        await queryRunner.query(
            `DROP TYPE IF EXISTS "public"."change_log_details_valuekind_enum"`,
        );
        await queryRunner.query(
            `DROP TYPE IF EXISTS "public"."change_log_entries_actorkind_enum"`,
        );
        await queryRunner.query(
            `DROP TYPE IF EXISTS "public"."change_log_entries_action_enum"`,
        );
    }
}
