import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { projectsApi } from '../api/projects.api'
import type { Project } from '../types/project'

export type ProjectsStatus = 'loading' | 'ready' | 'error'

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [status, setStatus] = useState<ProjectsStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [recentId, setRecentId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true

    projectsApi
      .list()
      .then((res) => {
        if (!active) return
        // Păstrăm proiectele create cât timp lista se încărca (ex. după o eroare).
        setProjects((prev) => {
          const serverIds = new Set(res.projects.map((p) => p.id))
          return [...prev.filter((p) => !serverIds.has(p.id)), ...res.projects]
        })
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(err instanceof ApiError ? err.message : 'Nu s-a putut contacta serverul.')
        setStatus('error')
      })

    return () => {
      active = false
    }
  }, [reloadKey])

  const reload = useCallback(() => {
    setError(null)
    setStatus('loading')
    setReloadKey((key) => key + 1)
  }, [])

  const addProject = useCallback((project: Project) => {
    setProjects((prev) => [project, ...prev.filter((p) => p.id !== project.id)])
    setRecentId(project.id)
  }, [])

  return { projects, status, error, recentId, reload, addProject }
}
