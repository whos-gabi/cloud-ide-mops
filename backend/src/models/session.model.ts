import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm'
import { User } from './user.model.js'

@Entity('sessions')
@Unique('UQ_sessions_tokenHash', ['tokenHash'])
@Index('IDX_sessions_userId', ['userId'])
export class Session {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_sessions' })
  id!: string

  // SHA-256 of the cookie token; the token itself is never stored.
  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string

  @Column({ type: 'uuid' })
  userId!: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'FK_sessions_userId' })
  user!: User

  @Column({ type: 'timestamptz' })
  expiresAt!: Date

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date
}
