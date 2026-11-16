import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm'

// Always pass the column type: tsx can't infer it.
@Entity('users')
@Unique('UQ_users_email', ['email'])
@Check('CHK_users_email_lowercase', `"email" = lower("email")`)
export class User {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_users' })
  id!: string

  // Stored lowercased by the app.
  @Column({ type: 'varchar', length: 254 })
  email!: string

  // Not selected by default, so it can't leak into a response.
  @Column({ type: 'text', select: false })
  passwordHash!: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date
}
