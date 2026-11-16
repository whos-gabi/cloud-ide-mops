import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { WorkspaceManagerError, workspaceManager } from '../clients/workspace-manager.client.js'
import { config } from '../config/config.js'
import { isUniqueViolation } from '../database/errors.js'
import { HttpError } from '../errors/http-error.js'
import type { Project } from '../models/project.model.js'
import { projectRepository } from '../repositories/project.repository.js'
import type { CreateProjectInput } from '../validators/project.validator.js'
import { STARTER_FILES } from './starter-files.js'

const NAME_TAKEN = 'Ai deja un proiect cu acest nume.'

export class ProjectService {
  async list(userId: string): Promise<Project[]> {
    return projectRepository.findByUser(userId)
  }

  // US04. The row is saved first, so the unique index settles two simultaneous
  // requests for the same name; then the project gets its workspace and starter
  // file. If that fails, both are removed again and the name is free.
  async create(userId: string, { name, language }: CreateProjectInput): Promise<Project> {
    let project: Project
    try {
      project = await projectRepository.create({ userId, name, language, workspaceId: `ws-${randomUUID()}` })
    } catch (err) {
      if (isUniqueViolation(err, 'UQ_projects_userId_name')) {
        throw new HttpError(409, 'PROJECT_NAME_TAKEN', NAME_TAKEN, { name: NAME_TAKEN })
      }
      throw err
    }

    try {
      await this.setUpWorkspace(project)
    } catch (err) {
      console.error(`project ${project.id}: workspace ${project.workspaceId} could not be set up:`, err)
      await workspaceManager.deleteWorkspace(project.workspaceId).catch((cleanupErr: unknown) => {
        console.error(`project ${project.id}: workspace ${project.workspaceId} left behind:`, cleanupErr)
      })
      await projectRepository.delete(project.id)
      throw new HttpError(
        503,
        'WORKSPACE_UNAVAILABLE',
        'Nu am putut pregăti mediul de lucru al proiectului. Încearcă din nou.',
      )
    }
    return project
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
