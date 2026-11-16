import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { projectsApi } from '../api/projects.api'
import { FileTree } from '../components/FileTree'
import { FileIcon } from '../components/icons'
import { useAuth } from '../context/AuthContext'
import { parentPath, type FileEntry } from '../types/file'
import { findLanguage, type Project } from '../types/project'

type ProjectState =
  | { status: 'loading' }
  | { status: 'ready'; project: Project }
  | { status: 'not-found' }
  | { status: 'error'; message: string }

export function ProjectPage() {
  const { projectId = '' } = useParams()
  // Alt proiect înseamnă altă stare: arborele, selecția și cererile pornesc de la zero.
  return <ProjectWorkspace key={projectId} projectId={projectId} />
}

function ProjectWorkspace({ projectId }: { projectId: string }) {
  const { logout } = useAuth()
  const [state, setState] = useState<ProjectState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [selected, setSelected] = useState<FileEntry | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    let active = true

    projectsApi.get(projectId).then(
      ({ project }) => {
        if (active) setState({ status: 'ready', project })
      },
      (err: unknown) => {
        if (!active) return
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'not-found' })
        } else {
          setState({
            status: 'error',
            message: err instanceof ApiError ? err.message : 'Nu s-a putut contacta serverul.',
          })
        }
      },
    )

    return () => {
      active = false
    }
  }, [projectId, reloadKey])

  const retry = () => {
    setState({ status: 'loading' })
    setReloadKey((key) => key + 1)
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      setLoggingOut(false)
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="layout layout-message">
        <main className="card">
          <div className="loading-state" role="status">
            <span className="spinner" aria-hidden="true" />
            Se încarcă proiectul…
          </div>
        </main>
      </div>
    )
  }

  if (state.status === 'not-found') {
    return (
      <div className="layout layout-message">
        <main className="card">
          <h1 className="card-title">Proiectul nu există.</h1>
          <p className="card-subtitle">Poate a fost șters sau linkul nu este corect.</p>
          <Link to="/dashboard" className="btn-primary btn-link">
            Înapoi la proiectele mele
          </Link>
        </main>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="layout layout-message">
        <main className="card">
          <div className="alert err alert-row" role="alert">
            <span>Nu am putut încărca proiectul. {state.message}</span>
            <button type="button" className="alert-action" onClick={retry}>
              Încearcă din nou
            </button>
          </div>
          <Link to="/dashboard" className="back-link">
            <span aria-hidden="true">←</span> Proiectele mele
          </Link>
        </main>
      </div>
    )
  }

  const { project } = state
  const language = findLanguage(project.language)

  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <Link to="/dashboard" className="back-link">
          <span aria-hidden="true">←</span> Proiectele mele
        </Link>
        <div className="workspace-title">
          <h1 className="workspace-name" title={project.name}>
            {project.name}
          </h1>
          <span className="lang-badge" data-language={project.language}>
            {language?.label ?? project.language}
          </span>
        </div>
        <button
          type="button"
          className="btn-danger btn-compact"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? 'Se deconectează...' : 'Deconectare'}
        </button>
      </header>

      <div className="workspace">
        <FileTree projectId={project.id} selected={selected} onSelect={setSelected} />
        <main className="workspace-main">
          <SelectionPanel selected={selected} />
        </main>
      </div>
    </div>
  )
}

function SelectionPanel({ selected }: { selected: FileEntry | null }) {
  if (selected?.type !== 'file') {
    return (
      <div className="workspace-placeholder">
        <p className="empty-title">
          Selectează un fișier <span className="only-wide">din stânga</span>
          <span className="only-narrow">de mai sus</span>.
        </p>
        <p>
          {selected ? (
            <>
              Fișierele și directoarele noi se vor crea în <code>{selected.path}/</code>.
            </>
          ) : (
            'Sau creează unul cu „Fișier nou”.'
          )}
        </p>
      </div>
    )
  }

  const directory = parentPath(selected.path)

  return (
    <article className="file-view" aria-labelledby="file-view-path">
      <header className="file-view-header">
        <FileIcon />
        <h2 id="file-view-path" className="file-view-path">
          {directory && <span className="file-view-dir">{directory}/</span>}
          {selected.name}
        </h2>
      </header>
      <div className="workspace-placeholder">
        <p className="empty-title">Editorul de cod va fi disponibil în curând.</p>
        <p>Deocamdată poți crea și șterge fișiere și directoare din panoul „Fișiere”.</p>
      </div>
    </article>
  )
}
