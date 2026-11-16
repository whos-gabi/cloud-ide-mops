import { apiRequest } from './client'
import type { CreateProjectInput, Project } from '../types/project'

export const projectsApi = {
  list: () => apiRequest<{ projects: Project[] }>('/projects'),

  // Poate dura până la ~60 de secunde: serverul pornește mediul proiectului
  // și scrie fișierul de pornire înainte să răspundă.
  create: (input: CreateProjectInput) =>
    apiRequest<{ project: Project }>('/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
}
