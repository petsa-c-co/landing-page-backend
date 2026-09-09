import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Las postulaciones y los puestos pasaron a Gestión Petrogas.
 *
 * El sitio ya no los guarda: su formulario es un puente hacia la API de
 * Gestión, así que estas tablas quedaron sin dueño. Se eliminan para que no
 * queden datos personales (CVs, teléfonos, emails) en un sistema que ya no los
 * administra ni los purga.
 *
 * `degree_titles` NO se toca: el catálogo de títulos académicos sigue siendo
 * del sitio y alimenta el autocompletado del formulario.
 *
 * IRREVERSIBLE en cuanto a datos: el `down` recrea la estructura para poder
 * volver atrás el esquema, pero las filas no se recuperan. Antes de correrla en
 * un entorno con postulaciones cargadas, exportarlas.
 */
export class DropLocalApplications1786000000000 implements MigrationInterface {
    name = 'DropLocalApplications1786000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Primero la tabla intermedia: tiene FKs hacia las otras dos.
        await queryRunner.query(
            `DROP TABLE IF EXISTS "application_job_profiles"`,
        );
        await queryRunner.query(`DROP TABLE IF EXISTS "applications"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "job_profiles"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "job_profiles" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "deletedAt" TIMESTAMP,
                "name" character varying(120) NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "sortOrder" integer NOT NULL DEFAULT 0,
                CONSTRAINT "PK_job_profiles" PRIMARY KEY ("id")
            )`,
        );
        await queryRunner.query(
            `CREATE TABLE "applications" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "fullName" character varying(120) NOT NULL,
                "degreeTitleOther" character varying(150),
                "location" character varying(120) NOT NULL,
                "phone" character varying(30) NOT NULL,
                "email" character varying(254) NOT NULL,
                "cvKey" character varying(500) NOT NULL,
                "cvHash" character varying(64) NOT NULL,
                "cvOriginalName" character varying(255) NOT NULL,
                "cvSizeBytes" integer NOT NULL,
                "submissionCount" integer NOT NULL DEFAULT 1,
                "degreeTitleId" uuid,
                CONSTRAINT "PK_applications" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_applications_email" UNIQUE ("email"),
                CONSTRAINT "FK_applications_degree_title" FOREIGN KEY ("degreeTitleId")
                    REFERENCES "degree_titles"("id") ON DELETE SET NULL
            )`,
        );
        await queryRunner.query(
            `CREATE TABLE "application_job_profiles" (
                "applicationId" uuid NOT NULL,
                "jobProfileId" uuid NOT NULL,
                CONSTRAINT "PK_application_job_profiles" PRIMARY KEY ("applicationId", "jobProfileId"),
                CONSTRAINT "FK_ajp_application" FOREIGN KEY ("applicationId")
                    REFERENCES "applications"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ajp_job_profile" FOREIGN KEY ("jobProfileId")
                    REFERENCES "job_profiles"("id") ON DELETE CASCADE
            )`,
        );
    }
}
