import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateUsers1794827149538 implements MigrationInterface {
  name = 'CreateUsers1794827149538'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // User accounts (US01). Emails are stored lowercased.
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" varchar(254) NOT NULL, "passwordHash" text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_users" PRIMARY KEY ("id"), CONSTRAINT "UQ_users_email" UNIQUE ("email"), CONSTRAINT "CHK_users_email_lowercase" CHECK ("email" = lower("email")))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`)
  }
}
