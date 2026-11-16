import type { Request, Response } from 'express'
import { projectService } from '../services/project.service.js'
import { createProjectSchema } from '../validators/project.validator.js'
import { validate } from '../validators/validate.js'
import { toProjectView } from '../views/project.view.js'

// GET /api/projects
export async function listProjects(req: Request, res: Response): Promise<void> {
  const projects = await projectService.list(req.user!.id)
  res.json({ projects: projects.map(toProjectView) })
}

// POST /api/projects. Answers once the workspace is up and has the starter file.
export async function createProject(req: Request, res: Response): Promise<void> {
  const input = validate(createProjectSchema, req.body)
  const project = await projectService.create(req.user!.id, input)
  res.status(201).json({ project: toProjectView(project) })
}

// GET /api/projects/:projectId
export async function getProject(req: Request, res: Response): Promise<void> {
  const project = await projectService.getOwned(req.user!.id, String(req.params.projectId))
  res.json({ project: toProjectView(project) })
}
