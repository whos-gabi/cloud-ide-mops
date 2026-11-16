import { Router } from 'express'
import { createEntry, deleteEntry, listFiles } from '../controllers/file.controller.js'
import { createProject, getProject, listProjects } from '../controllers/project.controller.js'
import { requireAuth } from '../middleware/require-auth.js'

export const projectRouter = Router()

projectRouter.use(requireAuth)
projectRouter.get('/', listProjects)
projectRouter.post('/', createProject)
projectRouter.get('/:projectId', getProject)
projectRouter.get('/:projectId/files', listFiles)
projectRouter.post('/:projectId/files', createEntry)
projectRouter.delete('/:projectId/files', deleteEntry)
