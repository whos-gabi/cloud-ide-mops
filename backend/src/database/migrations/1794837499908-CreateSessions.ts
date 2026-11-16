import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateSessions1794837499908 implements MigrationInterface {
  name = 'CreateSessions1794837499908'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Login sessions (US02). Only a SHA-256 of the cookie token is stored.
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tokenHash" varchar(64) NOT NULL, "userId" uuid NOT NULL, "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_sessions" PRIMARY KEY ("id"), CONSTRAINT "UQ_sessions_tokenHash" UNIQUE ("tokenHash"), CONSTRAINT "FK_sessions_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE)`,
    )
    await queryRunner.query(`CREATE INDEX "IDX_sessions_userId" ON "sessions" ("userId")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sessions"`)
  }
}
