import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { WorkspaceManagerError, workspaceManager } from '../clients/workspace-manager.client.js'
import { config } from '../config/config.js'
import { isUniqueViolation } from '../database/errors.js'
import { runInTransaction } from '../database/transaction.js'
import { HttpError } from '../errors/http-error.js'
import type { Project } from '../models/project.model.js'
import { projectRepository, type NewProject } from '../repositories/project.repository.js'
import type { CreateProjectInput } from '../validators/project.validator.js'
import { STARTER_FILES } from './starter-files.js'

const NAME_TAKEN = 'Ai deja un proiect cu acest nume.'
// Advisory lock class for "one project creation at a time per user".
const PROJECT_LOCK_CLASS = 7_231_002
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class ProjectService {
  async list(userId: string): Promise<Project[]> {
    return projectRepository.findByUser(userId)
  }

  // The same 404 for a project that doesn't exist and one that isn't the
  // user's, so IDs of other people's projects can't be probed.
  async getOwned(userId: string, projectId: string): Promise<Project> {
    const project = UUID.test(projectId) ? await projectRepository.findOwned(projectId, userId) : null
    if (!project) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Proiectul nu există.')
    return project
  }

  // US04. The row is saved first, so the unique index settles two simultaneous
  // requests for the same name; then the project gets its workspace and starter
  // file. If that fails, both are removed again and the name is free.
  async create(userId: string, { name, language }: CreateProjectInput): Promise<Project> {
    const project = await this.reserve({ userId, name, language, workspaceId: `ws-${randomUUID()}` })

    try {
      await this.setUpWorkspace(project)
    } catch (err) {
      console.error(`project ${project.id}: workspace ${project.workspaceId} could not be set up:`, err)
      await workspaceManager.deleteWorkspace(project.workspaceId).catch((cleanupErr: unknown) => {
        console.error(`project ${project.id}: workspace ${project.workspaceId} left behind:`, cleanupErr)
      })
      await projectRepository.delete(project.id).catch((cleanupErr: unknown) => {
        console.error(`project ${project.id}: row left behind:`, cleanupErr)
      })
      throw new HttpError(
        503,
        'WORKSPACE_UNAVAILABLE',
        'Nu am putut pregăti mediul de lucru al proiectului. Încearcă din nou.',
      )
    }
    return project
  }

  // Saves the row, if the name is free and the user is under the limit. The
  // lock makes a user's simultaneous requests count one after the other.
  private async reserve(data: NewProject): Promise<Project> {
    const { maxPerUser } = config.projects
    try {
      return await runInTransaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [PROJECT_LOCK_CLASS, data.userId])
        if ((await projectRepository.countByUser(data.userId, manager)) >= maxPerUser) {
          throw new HttpError(409, 'PROJECT_LIMIT_REACHED', `Poți avea cel mult ${maxPerUser} proiecte.`)
        }
        return projectRepository.create(data, manager)
      })
    } catch (err) {
      if (isUniqueViolation(err, 'UQ_projects_userId_name')) {
        throw new HttpError(409, 'PROJECT_NAME_TAKEN', NAME_TAKEN, { name: NAME_TAKEN })
      }
      throw err
    }
  }

  private async setUpWorkspace(project: Project): Promise<void> {
    await workspaceManager.createWorkspace(project.workspaceId, project.userId)

    // The file agent answers 503 until the workspace's pod is up, so retry.
    const { readyTimeoutMs, retryIntervalMs } = config.workspaceManager
    const deadline = Date.now() + readyTimeoutMs
    const starter = STARTER_FILES[project.language]
    for (;;) {
      try {
        await workspaceManager.createFile(project.workspaceId, starter.path, starter.content)
        return
      } catch (err) {
        if (!(err instanceof WorkspaceManagerError)) throw err
        // The workspace is brand new, so the file can only exist if an earlier
        // attempt wrote it before failing to answer.
        if (err.status === 409) return
        if (err.status !== 503 || Date.now() + retryIntervalMs > deadline) throw err
      }
      await sleep(retryIntervalMs)
    }
  }
}

export const projectService = new ProjectService()
