import { Link } from 'react-router-dom'
import type { ProjectsStatus } from '../hooks/useProjects'
import { findLanguage, type Project } from '../types/project'

interface ProjectListProps {
  projects: Project[]
  status: ProjectsStatus
  error: string | null
  recentId: string | null
  onRetry: () => void
}

const dateTimeFormat = new Intl.DateTimeFormat('ro-RO', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatDateTime(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : dateTimeFormat.format(date)
}

export function ProjectList({ projects, status, error, recentId, onRetry }: ProjectListProps) {
  return (
    <section className="card" aria-labelledby="projects-title">
      <div className="card-header">
        <h2 id="projects-title" className="card-title">
          Proiectele mele
        </h2>
        {projects.length > 0 && <span className="count-pill">{projects.length}</span>}
      </div>

      {status === 'error' && (
        <div className="alert err alert-row" role="alert">
          <span>Nu am putut încărca proiectele. {error}</span>
          <button type="button" className="alert-action" onClick={onRetry}>
            Încearcă din nou
          </button>
        </div>
      )}

      {status === 'loading' && projects.length === 0 && (
        <div className="loading-state" role="status">
          <span className="spinner" aria-hidden="true" />
          Se încarcă proiectele…
        </div>
      )}

      {status === 'ready' && projects.length === 0 && (
        <div className="empty-state">
          <p className="empty-title">Nu ai încă niciun proiect.</p>
          <p>Creează primul mai jos.</p>
        </div>
      )}

      {projects.length > 0 && (
        <ul className="project-list">
          {projects.map((project) => {
            const language = findLanguage(project.language)
            return (
              <li key={project.id}>
                <Link
                  to={`/projects/${encodeURIComponent(project.id)}`}
                  className={`project-row${project.id === recentId ? ' is-new' : ''}`}
                >
                  <div className="project-info">
                    <span className="project-name">{project.name}</span>
                    <span className="project-meta">
                      Modificat{' '}
                      <time dateTime={project.updatedAt}>{formatDateTime(project.updatedAt)}</time>
                    </span>
                  </div>
                  <span className="lang-badge" data-language={project.language}>
                    {language?.label ?? project.language}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
