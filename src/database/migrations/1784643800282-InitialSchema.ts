import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1784643800282 implements MigrationInterface {
    name = 'InitialSchema1784643800282'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."verification_tokens_type_enum" AS ENUM('account-activation', 'password-reset')`);
        await queryRunner.query(`CREATE TABLE "verification_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "token" character varying NOT NULL, "type" "public"."verification_tokens_type_enum" NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "isUsed" boolean NOT NULL DEFAULT false, "userId" uuid, CONSTRAINT "PK_f2d4d7a2aa57ef199e61567db22" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b00b1be0e5a820594d7c07a3df" ON "verification_tokens"  ("token") `);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying(25), "surname" character varying(25), "email" character varying(254) NOT NULL, "password" character varying(255), "passwordChangedAt" TIMESTAMP, "isActive" boolean NOT NULL DEFAULT false, "roles" text array NOT NULL DEFAULT '{user}', "isEmailVerified" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "token" character varying NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "isRevoked" boolean NOT NULL DEFAULT false, "userId" uuid, CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4542dd2f38a61354a040ba9fd5" ON "refresh_tokens"  ("token") `);
        await queryRunner.query(`CREATE TABLE "certifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "title" character varying(120) NOT NULL, "subtitle" character varying(120) NOT NULL, "description" text NOT NULL, "isFeatured" boolean NOT NULL DEFAULT false, "logoImage" character varying(500), "sortOrder" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_fd763d412e4a1fb1b6dadd6e72b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "clients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying(120) NOT NULL, "logoImage" character varying(500) NOT NULL, "sortOrder" integer NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_f1ab7cf3a5714dbc6bb4e1c28a4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."contact_messages_status_enum" AS ENUM('nueva', 'leida')`);
        await queryRunner.query(`CREATE TABLE "contact_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying(100) NOT NULL, "email" character varying(254) NOT NULL, "phone" character varying(30), "subject" character varying(150), "message" text NOT NULL, "status" "public"."contact_messages_status_enum" NOT NULL DEFAULT 'nueva', CONSTRAINT "PK_b74f96eb2edd977ccfba6533293" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b45d117b08adbde9e0fe1b259b" ON "contact_messages"  ("status") `);
        await queryRunner.query(`CREATE TABLE "job_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying(120) NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "sortOrder" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_728064bc11d9b267880a5784ffe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_84408684403414ac453fa63c8e" ON "job_profiles"  ("name") `);
        await queryRunner.query(`CREATE TYPE "public"."degree_titles_level_enum" AS ENUM('secundario_tecnico', 'terciario', 'universitario', 'formacion_profesional')`);
        await queryRunner.query(`CREATE TABLE "degree_titles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying(150) NOT NULL, "level" "public"."degree_titles_level_enum" NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "sortOrder" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_50b5f50d70acd2b0c85df2870df" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_543fb992db4ffdc44202fd87e1" ON "degree_titles"  ("name") `);
        await queryRunner.query(`CREATE INDEX "IDX_c29c52b79b593531530ae6f674" ON "degree_titles"  ("level") `);
        await queryRunner.query(`CREATE TABLE "applications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "fullName" character varying(120) NOT NULL, "degreeTitleOther" character varying(150), "location" character varying(120) NOT NULL, "phone" character varying(30) NOT NULL, "email" character varying(254) NOT NULL, "cvKey" character varying(500) NOT NULL, "cvHash" character varying(64) NOT NULL, "cvOriginalName" character varying(255) NOT NULL, "cvSizeBytes" integer NOT NULL, "submissionCount" integer NOT NULL DEFAULT '1', "degreeTitleId" uuid, CONSTRAINT "PK_938c0a27255637bde919591888f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c444b8d47e8f7e9327c1e3859d" ON "applications"  ("degreeTitleId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ac02d723199b0ebf2d838a9fc4" ON "applications"  ("email") `);
        await queryRunner.query(`CREATE INDEX "IDX_6e708aed356015cc7338ca25b7" ON "applications"  ("createdAt") `);
        await queryRunner.query(`CREATE TYPE "public"."news_posts_category_enum" AS ENUM('novedades', 'prensa')`);
        await queryRunner.query(`CREATE TABLE "news_posts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "title" character varying(200) NOT NULL, "slug" character varying(220) NOT NULL, "category" "public"."news_posts_category_enum" NOT NULL, "publishedAt" TIMESTAMP, "coverImage" character varying(500), "excerpt" character varying(500) NOT NULL, "body" text NOT NULL, "isFeatured" boolean NOT NULL DEFAULT false, "isPublished" boolean NOT NULL DEFAULT false, "externalUrl" character varying(500), CONSTRAINT "PK_95a44578e2b4bb7ca42e3ef4de6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f95fffe8fe305779d91176ffce" ON "news_posts"  ("slug") `);
        await queryRunner.query(`CREATE INDEX "IDX_e7c2d2d04ee98706fb6b9eab54" ON "news_posts"  ("category") `);
        await queryRunner.query(`CREATE INDEX "IDX_58372d6ed1cfc41b7d51875b07" ON "news_posts"  ("isPublished", "publishedAt") `);
        await queryRunner.query(`CREATE TYPE "public"."services_itemslayout_enum" AS ENUM('bullets', 'icons', 'numbered')`);
        await queryRunner.query(`CREATE TABLE "services" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "title" character varying(120) NOT NULL, "slug" character varying(140) NOT NULL, "shortDescription" text NOT NULL, "longDescription" text NOT NULL, "cardImage" character varying(500), "bannerImage" character varying(500), "detailImage" character varying(500), "itemsLayout" "public"."services_itemslayout_enum" NOT NULL DEFAULT 'bullets', "sortOrder" integer NOT NULL DEFAULT '0', "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_ba2d347a3168a296416c6c5ccb2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_02cf0d0f46e11d22d952f62367" ON "services"  ("slug") `);
        await queryRunner.query(`CREATE TABLE "service_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "label" character varying(200) NOT NULL, "spec" character varying(200), "icon" character varying(50), "sortOrder" integer NOT NULL DEFAULT '0', "serviceId" uuid, CONSTRAINT "PK_7383c18e3c8e4956860b117728a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_96dc4e3108ef91b79bb9fa3629" ON "service_items"  ("serviceId") `);
        await queryRunner.query(`CREATE TABLE "application_job_profiles" ("applicationsId" uuid NOT NULL, "jobProfilesId" uuid NOT NULL, CONSTRAINT "PK_91e8a4971c0efa325deb54948a4" PRIMARY KEY ("applicationsId", "jobProfilesId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1f291dbc97c3154cab44cf8ac8" ON "application_job_profiles"  ("applicationsId") `);
        await queryRunner.query(`CREATE INDEX "IDX_520edc6bd36133f99130c5e3f0" ON "application_job_profiles"  ("jobProfilesId") `);
        await queryRunner.query(`ALTER TABLE "verification_tokens" ADD CONSTRAINT "FK_8eb720a87e85b20fdfc69c38269" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_610102b60fea1455310ccd299de" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "applications" ADD CONSTRAINT "FK_c444b8d47e8f7e9327c1e3859da" FOREIGN KEY ("degreeTitleId") REFERENCES "degree_titles"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "service_items" ADD CONSTRAINT "FK_96dc4e3108ef91b79bb9fa36293" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "application_job_profiles" ADD CONSTRAINT "FK_1f291dbc97c3154cab44cf8ac86" FOREIGN KEY ("applicationsId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "application_job_profiles" ADD CONSTRAINT "FK_520edc6bd36133f99130c5e3f07" FOREIGN KEY ("jobProfilesId") REFERENCES "job_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "application_job_profiles" DROP CONSTRAINT "FK_520edc6bd36133f99130c5e3f07"`);
        await queryRunner.query(`ALTER TABLE "application_job_profiles" DROP CONSTRAINT "FK_1f291dbc97c3154cab44cf8ac86"`);
        await queryRunner.query(`ALTER TABLE "service_items" DROP CONSTRAINT "FK_96dc4e3108ef91b79bb9fa36293"`);
        await queryRunner.query(`ALTER TABLE "applications" DROP CONSTRAINT "FK_c444b8d47e8f7e9327c1e3859da"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_610102b60fea1455310ccd299de"`);
        await queryRunner.query(`ALTER TABLE "verification_tokens" DROP CONSTRAINT "FK_8eb720a87e85b20fdfc69c38269"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_520edc6bd36133f99130c5e3f0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1f291dbc97c3154cab44cf8ac8"`);
        await queryRunner.query(`DROP TABLE "application_job_profiles"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_96dc4e3108ef91b79bb9fa3629"`);
        await queryRunner.query(`DROP TABLE "service_items"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_02cf0d0f46e11d22d952f62367"`);
        await queryRunner.query(`DROP TABLE "services"`);
        await queryRunner.query(`DROP TYPE "public"."services_itemslayout_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_58372d6ed1cfc41b7d51875b07"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e7c2d2d04ee98706fb6b9eab54"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f95fffe8fe305779d91176ffce"`);
        await queryRunner.query(`DROP TABLE "news_posts"`);
        await queryRunner.query(`DROP TYPE "public"."news_posts_category_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6e708aed356015cc7338ca25b7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ac02d723199b0ebf2d838a9fc4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c444b8d47e8f7e9327c1e3859d"`);
        await queryRunner.query(`DROP TABLE "applications"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c29c52b79b593531530ae6f674"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_543fb992db4ffdc44202fd87e1"`);
        await queryRunner.query(`DROP TABLE "degree_titles"`);
        await queryRunner.query(`DROP TYPE "public"."degree_titles_level_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_84408684403414ac453fa63c8e"`);
        await queryRunner.query(`DROP TABLE "job_profiles"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b45d117b08adbde9e0fe1b259b"`);
        await queryRunner.query(`DROP TABLE "contact_messages"`);
        await queryRunner.query(`DROP TYPE "public"."contact_messages_status_enum"`);
        await queryRunner.query(`DROP TABLE "clients"`);
        await queryRunner.query(`DROP TABLE "certifications"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4542dd2f38a61354a040ba9fd5"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b00b1be0e5a820594d7c07a3df"`);
        await queryRunner.query(`DROP TABLE "verification_tokens"`);
        await queryRunner.query(`DROP TYPE "public"."verification_tokens_type_enum"`);
    }

}
