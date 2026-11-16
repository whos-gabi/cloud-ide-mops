import { WorkspaceManagerError, workspaceManager } from '../clients/workspace-manager.client.js'
import { HttpError } from '../errors/http-error.js'
import type { Project } from '../models/project.model.js'
import { projectRepository } from '../repositories/project.repository.js'
import { isValidPath, type CreateEntryInput, type DeleteEntryInput } from '../validators/file.validator.js'
import type { FileEntryView } from '../views/file.view.js'

const NAME_TAKEN = 'Există deja un element cu acest nume.'

const joinPath = (parent: string, name: string) => (parent ? `${parent}/${name}` : name)

// Turns workspace-manager's answer into one for the user. `notFound` says
// what was missing in this operation.
function toHttpError(err: unknown, notFound: string): unknown {
  if (!(err instanceof WorkspaceManagerError)) return err
  switch (err.status) {
    case 409:
      return new HttpError(409, 'NAME_TAKEN', NAME_TAKEN, { name: NAME_TAKEN })
    case 404:
      return new HttpError(404, 'PATH_NOT_FOUND', notFound)
    // E.g. the parent is a file, or a directory was deleted as a file.
    case 400:
      return new HttpError(400, 'INVALID_PATH', 'Calea nu este validă.')
    case 503:
      return new HttpError(
        503,
        'WORKSPACE_UNAVAILABLE',
        'Mediul de lucru al proiectului nu răspunde acum. Încearcă din nou peste câteva secunde.',
      )
    default:
      return err
  }
}

// US08. Files live in the project's workspace; workspace-manager enforces the
// rules (unique names, existing parent), this only translates.
export class FileService {
  // One directory level: directories first, then files, each by name.
  async list(project: Project, path: string): Promise<FileEntryView[]> {
    let directory
    try {
      directory = await workspaceManager.listDirectory(project.workspaceId, path)
    } catch (err) {
      throw toHttpError(err, 'Directorul nu există.')
    }
    return (directory.children ?? [])
      .filter((child) => child.type === 'file' || child.type === 'directory')
      .map((child) => ({
        name: child.name,
        path: joinPath(path, child.name),
        type: child.type as FileEntryView['type'],
        ...(child.type === 'file' && { size: child.size ?? 0 }),
      }))
      .sort(
        (a, b) =>
          Number(b.type === 'directory') - Number(a.type === 'directory') ||
          a.name.localeCompare(b.name, 'ro', { sensitivity: 'base', numeric: true }) ||
          a.name.localeCompare(b.name),
      )
  }

  async create(project: Project, { parent, name, type }: CreateEntryInput): Promise<FileEntryView> {
    const path = joinPath(parent, name)
    if (!isValidPath(path)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Datele trimise nu sunt valide.', { name: 'Calea este prea lungă.' })
    }
    try {
      if (type === 'file') {
        await workspaceManager.createFile(project.workspaceId, path, '')
      } else {
        await workspaceManager.createDirectory(project.workspaceId, path)
      }
    } catch (err) {
      throw toHttpError(err, 'Directorul în care creezi nu mai există.')
    }
    await projectRepository.touch(project.id)
    return { name, path, type, ...(type === 'file' && { size: 0 }) }
  }

  // A directory goes with everything in it.
  async delete(project: Project, { path, type }: DeleteEntryInput): Promise<void> {
    try {
      if (type === 'file') {
        await workspaceManager.deleteFile(project.workspaceId, path)
      } else {
        await workspaceManager.deleteDirectory(project.workspaceId, path)
      }
    } catch (err) {
      throw toHttpError(err, 'Elementul nu mai există.')
    }
    await projectRepository.touch(project.id)
  }
}

export const fileService = new FileService()
