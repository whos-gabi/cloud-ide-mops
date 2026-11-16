import { dataSource } from '../database/data-source.js'
import { Project } from '../models/project.model.js'

export type NewProject = Pick<Project, 'userId' | 'name' | 'language' | 'workspaceId'>

export class ProjectRepository {
  async create(data: NewProject): Promise<Project> {
    const projects = dataSource.getRepository(Project)
    return projects.save(projects.create(data))
  }

  async delete(id: string): Promise<void> {
    await dataSource.getRepository(Project).delete({ id })
  }

  // The user's projects, most recently changed first.
  async findByUser(userId: string): Promise<Project[]> {
    return dataSource.getRepository(Project).find({
      where: { userId },
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    })
  }
}

export const projectRepository = new ProjectRepository()
