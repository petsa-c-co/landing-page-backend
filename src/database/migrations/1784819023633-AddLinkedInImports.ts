import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLinkedInImports1784819023633 implements MigrationInterface {
    name = 'AddLinkedInImports1784819023633'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."linkedin_imports_status_enum" AS ENUM('pending', 'approved', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "linkedin_imports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "externalId" character varying(255) NOT NULL, "status" "public"."linkedin_imports_status_enum" NOT NULL DEFAULT 'pending', "externalUrl" character varying(500) NOT NULL, "text" text NOT NULL, "mediaUrl" text, "authorName" character varying(200), "postedAt" TIMESTAMP, "newsPostId" uuid, "reviewedAt" TIMESTAMP, CONSTRAINT "PK_7392428f9851c38019b90771224" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_18693ed7e39a3f25d867ea2e85" ON "linkedin_imports"  ("externalId") `);
        await queryRunner.query(`CREATE INDEX "IDX_2e50036c900b0ecdbda3530e0d" ON "linkedin_imports"  ("status", "postedAt") `);
        await queryRunner.query(`CREATE TYPE "public"."news_posts_source_enum" AS ENUM('manual', 'linkedin')`);
        await queryRunner.query(`ALTER TABLE "news_posts" ADD "source" "public"."news_posts_source_enum" NOT NULL DEFAULT 'manual'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "news_posts" DROP COLUMN "source"`);
        await queryRunner.query(`DROP TYPE "public"."news_posts_source_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2e50036c900b0ecdbda3530e0d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_18693ed7e39a3f25d867ea2e85"`);
        await queryRunner.query(`DROP TABLE "linkedin_imports"`);
        await queryRunner.query(`DROP TYPE "public"."linkedin_imports_status_enum"`);
    }

}
