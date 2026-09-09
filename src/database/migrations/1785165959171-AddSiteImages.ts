import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSiteImages1785165959171 implements MigrationInterface {
    name = 'AddSiteImages1785165959171'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "site_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "slot" character varying(60) NOT NULL, "imageKey" character varying(500) NOT NULL, CONSTRAINT "PK_97c9efa63cdcc9af0af46569f2e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6e1dc788d51b5e3e9042b12abd" ON "site_images"  ("slot") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_6e1dc788d51b5e3e9042b12abd"`);
        await queryRunner.query(`DROP TABLE "site_images"`);
    }

}
