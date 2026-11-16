import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm'
import { User } from './user.model.js'

export const LANGUAGES = ['python', 'javascript', 'java', 'cpp'] as const
export type Language = (typeof LANGUAGES)[number]

@Entity('projects')
@Unique('UQ_projects_workspaceId', ['workspaceId'])
@Check('CHK_projects_language', `"language" IN ('python', 'javascript', 'java', 'cpp')`)
// Unique on ("userId", lower("name")): TypeORM can't describe an index on an
// expression, so the migration creates it and schema sync leaves it alone.
@Index('UQ_projects_userId_name', { synchronize: false })
export class Project {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_projects' })
  id!: string

  @Column({ type: 'uuid' })
  userId!: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'FK_projects_userId' })
  user!: User

  @Column({ type: 'varchar', length: 100 })
  name!: string

  @Column({ type: 'varchar', length: 16 })
  language!: Language

  // Name of the project's workspace in workspace-manager ("ws-<uuid>").
  @Column({ type: 'varchar', length: 63 })
  workspaceId!: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
