import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCertificatePdfToCertifications1784809446759 implements MigrationInterface {
    name = 'AddCertificatePdfToCertifications1784809446759'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "certifications" ADD "certificatePdf" character varying(500)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "certifications" DROP COLUMN "certificatePdf"`);
    }

}
