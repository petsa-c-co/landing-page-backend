import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSoftDeleteToCatalog1784833874469 implements MigrationInterface {
    name = 'AddSoftDeleteToCatalog1784833874469'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "certifications" ADD "deletedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "clients" ADD "deletedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "news_posts" ADD "deletedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "job_profiles" ADD "deletedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "degree_titles" ADD "deletedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "services" ADD "deletedAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "degree_titles" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "job_profiles" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "news_posts" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "clients" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "certifications" DROP COLUMN "deletedAt"`);
    }

}
