import type { Request, Response } from 'express'
import { fileService } from '../services/file.service.js'
import { projectService } from '../services/project.service.js'
import { createEntrySchema, deleteEntryQuerySchema, listFilesQuerySchema } from '../validators/file.validator.js'
import { validate } from '../validators/validate.js'

// Every route here is under /api/projects/:projectId, behind requireAuth.
const ownedProject = (req: Request) => projectService.getOwned(req.user!.id, String(req.params.projectId))

// GET /api/projects/:projectId/files?path=
export async function listFiles(req: Request, res: Response): Promise<void> {
  const project = await ownedProject(req)
  const { path } = validate(listFilesQuerySchema, req.query)
  res.json({ path, entries: await fileService.list(project, path) })
}

// POST /api/projects/:projectId/files
export async function createEntry(req: Request, res: Response): Promise<void> {
  const project = await ownedProject(req)
  const input = validate(createEntrySchema, req.body)
  res.status(201).json({ entry: await fileService.create(project, input) })
}

// DELETE /api/projects/:projectId/files?path=&type=
export async function deleteEntry(req: Request, res: Response): Promise<void> {
  const project = await ownedProject(req)
  const input = validate(deleteEntryQuerySchema, req.query)
  await fileService.delete(project, input)
  res.status(204).end()
}
