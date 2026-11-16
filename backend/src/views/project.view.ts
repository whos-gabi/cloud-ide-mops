import type { Language, Project } from '../models/project.model.js'

// What the API returns for a project; the workspace stays internal.
export interface ProjectView {
  id: string
  name: string
  language: Language
  createdAt: string
  updatedAt: string
}

export function toProjectView(project: Project): ProjectView {
  return {
    id: project.id,
    name: project.name,
    language: project.language,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  }
}
