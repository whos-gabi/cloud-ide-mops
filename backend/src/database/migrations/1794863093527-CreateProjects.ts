import type { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateProjects1794863093527 implements MigrationInterface {
  name = 'CreateProjects1794863093527'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Projects (US04). Each one has its own workspace in workspace-manager.
    await queryRunner.query(
      `CREATE TABLE "projects" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "userId" uuid NOT NULL, "name" varchar(100) NOT NULL, "language" varchar(16) NOT NULL, "workspaceId" varchar(63) NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_projects" PRIMARY KEY ("id"), CONSTRAINT "UQ_projects_workspaceId" UNIQUE ("workspaceId"), CONSTRAINT "CHK_projects_language" CHECK ("language" IN ('python', 'javascript', 'java', 'cpp')), CONSTRAINT "FK_projects_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE)`,
    )
    // A name is unique among the user's projects, ignoring letter case.
    // Also serves lookups by "userId".
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_projects_userId_name" ON "projects" ("userId", lower("name"))`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "projects"`)
  }
}
