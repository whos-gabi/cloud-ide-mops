import { Router } from 'express'
import { createProject, listProjects } from '../controllers/project.controller.js'
import { requireAuth } from '../middleware/require-auth.js'

export const projectRouter = Router()

projectRouter.use(requireAuth)
projectRouter.get('/', listProjects)
projectRouter.post('/', createProject)
