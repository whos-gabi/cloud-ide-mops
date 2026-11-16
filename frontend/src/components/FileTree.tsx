import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from 'react'
import { ApiError } from '../api/client'
import { filesApi } from '../api/files.api'
import {
  ROOT_PATH,
  isSameOrInside,
  parentPath,
  sortEntries,
  type FileEntry,
  type FileEntryType,
} from '../types/file'
import { ConfirmDialog } from './ConfirmDialog'
import {
  ChevronIcon,
  FileIcon,
  FilePlusIcon,
  FolderIcon,
  FolderPlusIcon,
  TrashIcon,
} from './icons'

interface DirectoryState {
  status: 'loading' | 'ready' | 'error'
  entries: FileEntry[]
  error?: string
}

/** Rândul în care utilizatorul scrie numele unui element nou. */
interface Draft {
  parent: string
  type: FileEntryType
}

interface FileTreeProps {
  projectId: string
  selected: FileEntry | null
  onSelect: Dispatch<SetStateAction<FileEntry | null>>
}

const NETWORK_ERROR = 'Nu s-a putut contacta serverul.'

function errorMessage(err: unknown) {
  return err instanceof ApiError ? err.message : NETWORK_ERROR
}

/** Unde se creează elementele noi: în directorul selectat, lângă fișierul selectat sau în rădăcină. */
function targetDirectory(selected: FileEntry | null) {
  if (!selected) return ROOT_PATH
  return selected.type === 'directory' ? selected.path : parentPath(selected.path)
}

function locationLabel(directory: string) {
  return directory === ROOT_PATH ? 'rădăcină' : `${directory}/`
}

/** Indentarea unui rând după adâncime; `extra` aliniază textul cu numele elementelor. */
function indent(depth: number, extra = 0) {
  return `${0.5 + depth * 0.9 + extra}rem`
}

export function FileTree({ projectId, selected, onSelect }: FileTreeProps) {
  const [dirs, setDirs] = useState<Record<string, DirectoryState>>({
    [ROOT_PATH]: { status: 'loading', entries: [] },
  })
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [recentPath, setRecentPath] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<FileEntry | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const titleId = useId()
  const draftErrorId = useId()
  const treeRef = useRef<HTMLUListElement>(null)
  const draftInputRef = useRef<HTMLInputElement>(null)
  // Ultima cerere pornită pentru fiecare director; răspunsurile mai vechi sunt ignorate.
  const latestRequest = useRef(new Map<string, number>())
  const requestCounter = useRef(0)
  // Elementul care primește focusul după următoarea randare ('' = primul din arbore).
  const pendingFocus = useRef<string | null>(null)
  // Unde revine focusul când utilizatorul renunță (Esc / „Anulează”).
  const returnFocus = useRef<HTMLElement | null>(null)
  const pointerDown = useRef(false)

  const fetchDirectory = useCallback(
    (path: string) => {
      const requestId = ++requestCounter.current
      latestRequest.current.set(path, requestId)
      const isLatest = () => latestRequest.current.get(path) === requestId

      filesApi.list(projectId, path).then(
        ({ entries }) => {
          if (!isLatest()) return
          setDirs((prev) => ({ ...prev, [path]: { status: 'ready', entries } }))
        },
        (err: unknown) => {
          if (!isLatest()) return
          setDirs((prev) => ({
            ...prev,
            [path]: { status: 'error', entries: prev[path]?.entries ?? [], error: errorMessage(err) },
          }))
        },
      )
    },
    [projectId],
  )

  // Un director deja încărcat rămâne vizibil cât timp îl reîncărcăm.
  const loadDirectory = useCallback(
    (path: string) => {
      setDirs((prev) => {
        const current = prev[path]
        if (current?.status === 'ready') return prev
        return { ...prev, [path]: { status: 'loading', entries: current?.entries ?? [] } }
      })
      fetchDirectory(path)
    },
    [fetchDirectory],
  )

  useEffect(() => {
    const requests = latestRequest.current
    fetchDirectory(ROOT_PATH)
    return () => requests.clear()
  }, [fetchDirectory])

  useEffect(() => {
    const down = () => {
      pointerDown.current = true
    }
    const up = () => {
      pointerDown.current = false
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', up, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', up, true)
    }
  }, [])

  useEffect(() => {
    if (draft && !creating) draftInputRef.current?.focus()
  }, [draft, creating])

  useEffect(() => {
    const path = pendingFocus.current
    const tree = treeRef.current
    if (path === null || !tree) return
    pendingFocus.current = null
    const item = tree.querySelector<HTMLElement>(
      path === ROOT_PATH ? '.tree-label' : `.tree-label[data-path="${CSS.escape(path)}"]`,
    )
    ;(item ?? tree).focus()
  })

  const expandDirectory = (path: string) => {
    setExpanded((prev) => (prev.has(path) ? prev : new Set(prev).add(path)))
    const dir = dirs[path]
    if (!dir || dir.status === 'error') loadDirectory(path)
  }

  const collapseDirectory = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.delete(path)
      return next
    })
    // Un rând de creare ascuns n-ar mai putea fi completat.
    if (!creating) setDraft((current) => (current && isSameOrInside(current.parent, path) ? null : current))
  }

  /** Deschide directorul și toate directoarele părinte, ca să fie vizibil. */
  const revealDirectory = (path: string) => {
    if (path === ROOT_PATH) return
    const parts = path.split('/')
    parts.forEach((_, i) => expandDirectory(parts.slice(0, i + 1).join('/')))
  }

  const handleItemClick = (entry: FileEntry) => {
    onSelect(entry)
    setRecentPath(null)
    if (entry.type !== 'directory') return
    if (expanded.has(entry.path)) collapseDirectory(entry.path)
    else expandDirectory(entry.path)
  }

  // ---------- Creare ----------

  const startCreate = (type: FileEntryType) => {
    const parent = targetDirectory(selected)
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDraft({ parent, type })
    setDraftName('')
    setDraftError(null)
    revealDirectory(parent)
  }

  const cancelDraft = () => {
    setDraft(null)
    setDraftName('')
    setDraftError(null)
    if (returnFocus.current?.isConnected) returnFocus.current.focus()
  }

  const handleDraftBlur = () => {
    if (draftName.trim() || creating) return
    const blurred = draft
    const cancel = () => setDraft((current) => (current === blurred ? null : current))
    if (pointerDown.current) {
      // Renunțăm abia după clic: altfel rândurile de dedesubt urcă sub cursor și clicul se pierde.
      window.addEventListener('pointerup', () => setTimeout(cancel), { once: true })
    } else {
      cancel()
    }
  }

  const submitDraft = async () => {
    if (!draft || creating) return
    const name = draftName.trim()
    if (!name) {
      setDraftError('Introdu un nume.')
      return
    }

    const { parent, type } = draft
    setCreating(true)
    setDraftError(null)

    try {
      const { entry } = await filesApi.create(projectId, { parent, name, type })
      // Îl arătăm imediat, apoi reîncărcăm doar directorul în care l-am creat.
      setDirs((prev) => {
        const next = { ...prev }
        const dir = next[parent]
        if (dir) {
          next[parent] = {
            ...dir,
            entries: sortEntries([...dir.entries.filter((e) => e.path !== entry.path), entry]),
          }
        }
        if (entry.type === 'directory') next[entry.path] = { status: 'ready', entries: [] }
        return next
      })
      loadDirectory(parent)
      revealDirectory(parent)
      setDraft(null)
      setDraftName('')
      setRecentPath(entry.path)
      pendingFocus.current = entry.path
      onSelect(entry)
    } catch (err) {
      setDraftError(err instanceof ApiError ? (err.fields?.name ?? err.message) : NETWORK_ERROR)
    } finally {
      setCreating(false)
    }
  }

  const handleDraftKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter/Esc care confirmă sau anulează o compunere IME aparțin IME-ului
    // (keyCode 229: Safari termină compunerea înainte de keydown).
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'Enter') {
      e.preventDefault()
      void submitDraft()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (!creating) cancelDraft()
    }
  }

  // ---------- Ștergere ----------

  const requestDelete = (entry: FileEntry) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setDeleteError(null)
    setPendingDelete(entry)
  }

  const cancelDelete = () => {
    setPendingDelete(null)
    setDeleteError(null)
    if (returnFocus.current?.isConnected) returnFocus.current.focus()
  }

  const removeFromTree = (entry: FileEntry) => {
    const parent = parentPath(entry.path)
    const isGone = (path: string) => isSameOrInside(path, entry.path)

    // Răspunsurile încă pe drum pentru directoarele șterse nu mai contează.
    for (const path of [...latestRequest.current.keys()]) {
      if (isGone(path)) latestRequest.current.delete(path)
    }
    setDirs((prev) => {
      const next: Record<string, DirectoryState> = {}
      for (const [path, dir] of Object.entries(prev)) {
        if (!isGone(path)) next[path] = dir
      }
      const parentDir = next[parent]
      if (parentDir) {
        next[parent] = { ...parentDir, entries: parentDir.entries.filter((e) => e.path !== entry.path) }
      }
      return next
    })
    setExpanded((prev) => new Set([...prev].filter((path) => !isGone(path))))
    setDraft((current) => (current && isGone(current.parent) ? null : current))
    onSelect((current) => (current && isGone(current.path) ? null : current))
    setPendingDelete(null)
    pendingFocus.current = parent
    loadDirectory(parent)
  }

  const confirmDelete = async () => {
    const entry = pendingDelete
    if (!entry || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await filesApi.remove(projectId, entry.path, entry.type)
      removeFromTree(entry)
    } catch (err) {
      // A dispărut deja: rezultatul e același, îl scoatem din arbore.
      if (err instanceof ApiError && err.code === 'PATH_NOT_FOUND') removeFromTree(entry)
      else setDeleteError(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  // ---------- Tastatură ----------

  const handleTreeKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const current = e.target
    if (!(current instanceof HTMLButtonElement) || !current.classList.contains('tree-label')) return

    const items = Array.from(treeRef.current?.querySelectorAll<HTMLButtonElement>('.tree-label') ?? [])
    const index = items.indexOf(current)
    const path = current.dataset.path ?? ''
    const isDirectory = current.dataset.type === 'directory'
    const next = items[index + 1]

    switch (e.key) {
      case 'ArrowDown':
        next?.focus()
        break
      case 'ArrowUp':
        items[index - 1]?.focus()
        break
      case 'Home':
        items[0]?.focus()
        break
      case 'End':
        items[items.length - 1]?.focus()
        break
      case 'ArrowRight':
        if (!isDirectory) break
        if (!expanded.has(path)) expandDirectory(path)
        else if (next?.dataset.path?.startsWith(`${path}/`)) next.focus()
        break
      // Fără selecție, „Fișier nou” / „Director nou” creează din nou în rădăcină.
      case 'Escape':
        onSelect(null)
        break
      case 'ArrowLeft': {
        if (isDirectory && expanded.has(path)) {
          collapseDirectory(path)
          break
        }
        const parent = parentPath(path)
        items.find((item) => item.dataset.path === parent)?.focus()
        break
      }
      default:
        return
    }
    e.preventDefault()
  }

  // ---------- Randare ----------

  const renderDraft = (depth: number) => {
    if (!draft) return null
    const kind = draft.type === 'file' ? 'fișier' : 'director'
    const where = locationLabel(draft.parent)

    return (
      <li className="tree-draft">
        <div className="tree-draft-row" style={{ paddingLeft: indent(depth) }}>
          <span className="tree-chevron" />
          {draft.type === 'directory' ? (
            <FolderIcon className="tree-icon is-folder" />
          ) : (
            <FileIcon className="tree-icon" />
          )}
          <input
            ref={draftInputRef}
            className="tree-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={draftName}
            placeholder={`nume ${kind} în ${where}`}
            aria-label={`Nume ${kind} nou în ${where}`}
            aria-invalid={draftError ? true : undefined}
            aria-describedby={draftError ? draftErrorId : undefined}
            disabled={creating}
            onChange={(e) => {
              setDraftName(e.target.value)
              if (draftError) setDraftError(null)
            }}
            onKeyDown={handleDraftKeyDown}
            onBlur={handleDraftBlur}
          />
          {creating && <span className="spinner tree-spinner" aria-hidden="true" />}
        </div>
        {draftError && (
          <p
            id={draftErrorId}
            className="field-error tree-draft-error"
            role="alert"
            style={{ paddingLeft: indent(depth, 1.85) }}
          >
            {draftError}
          </p>
        )}
      </li>
    )
  }

  const renderEntry = (entry: FileEntry, depth: number) => {
    const isDirectory = entry.type === 'directory'
    const isExpanded = isDirectory && expanded.has(entry.path)
    const isSelected = selected?.path === entry.path
    const rowClass = `tree-row${isSelected ? ' is-selected' : ''}${entry.path === recentPath ? ' is-new' : ''}`

    return (
      <li key={entry.path} className="tree-item">
        <div className={rowClass}>
          <button
            type="button"
            className="tree-label"
            style={{ paddingLeft: indent(depth) }}
            data-path={entry.path}
            data-type={entry.type}
            title={entry.path}
            // Stările sunt pe butonul care primește focusul, ca cititoarele de
            // ecran să le anunțe.
            aria-expanded={isDirectory ? isExpanded : undefined}
            aria-current={isSelected ? 'true' : undefined}
            onClick={() => handleItemClick(entry)}
          >
            <span className={`tree-chevron${isExpanded ? ' is-open' : ''}`}>
              {isDirectory && <ChevronIcon />}
            </span>
            {isDirectory ? (
              <FolderIcon open={isExpanded} className="tree-icon is-folder" />
            ) : (
              <FileIcon className="tree-icon" />
            )}
            <span className="tree-name">{entry.name}</span>
          </button>
          <button
            type="button"
            className="tree-delete"
            aria-label={`Șterge ${entry.name}`}
            title={`Șterge ${entry.name}`}
            onClick={() => requestDelete(entry)}
          >
            <TrashIcon />
          </button>
        </div>
        {isExpanded && (
          <ul className="tree-group">
            {renderChildren(entry.path, depth + 1)}
          </ul>
        )}
      </li>
    )
  }

  function renderChildren(path: string, depth: number) {
    const dir = dirs[path]
    const entries = dir?.entries ?? []
    const isRoot = path === ROOT_PATH
    const draftHere = draft?.parent === path
    // Mesajele din rădăcină au stil propriu; în directoare se aliniază cu numele copiilor.
    const statusProps = isRoot
      ? { className: 'tree-status is-root' }
      : { className: 'tree-status', style: { paddingLeft: indent(depth, 1.85) } }

    return (
      <>
        {draftHere && renderDraft(depth)}
        {entries.map((entry) => renderEntry(entry, depth))}
        {(!dir || dir.status === 'loading') && (
          <li {...statusProps}>
            <span className="spinner" aria-hidden="true" />
            {isRoot ? 'Se încarcă fișierele…' : 'Se încarcă…'}
          </li>
        )}
        {dir?.status === 'error' && (
          <li {...statusProps} className={`${statusProps.className} is-error`}>
            <span role="alert">{dir.error}</span>
            <button type="button" className="alert-action" onClick={() => loadDirectory(path)}>
              Încearcă din nou
            </button>
          </li>
        )}
        {dir?.status === 'ready' && entries.length === 0 && !draftHere && (
          <li {...statusProps} className={`${statusProps.className} is-muted`}>
            {isRoot ? 'Proiectul nu are fișiere.' : 'Gol'}
          </li>
        )}
      </>
    )
  }

  const target = locationLabel(targetDirectory(selected))

  return (
    <section className="explorer" aria-labelledby={titleId}>
      <div className="explorer-header">
        <h2 id={titleId} className="explorer-title">
          Fișiere
        </h2>
        <div className="explorer-actions">
          <button
            type="button"
            className="explorer-action"
            title={`Fișier nou în ${target}`}
            onClick={() => startCreate('file')}
            disabled={creating}
          >
            <FilePlusIcon />
            <span>Fișier nou</span>
          </button>
          <button
            type="button"
            className="explorer-action"
            title={`Director nou în ${target}`}
            onClick={() => startCreate('directory')}
            disabled={creating}
          >
            <FolderPlusIcon />
            <span>Director nou</span>
          </button>
        </div>
      </div>

      <p className="explorer-target">
        Elementele noi se creează în <code>{target}</code>
        {selected && (
          <button type="button" className="explorer-target-reset" onClick={() => onSelect(null)}>
            Creează în rădăcină
          </button>
        )}
      </p>

      {/* Un click pe spațiul gol deselectează, ca ținta să redevină rădăcina. */}
      <div
        className="explorer-body"
        onClick={(e) => {
          if (e.target === e.currentTarget || e.target === treeRef.current) onSelect(null)
        }}
      >
        <ul ref={treeRef} aria-labelledby={titleId} className="tree" onKeyDown={handleTreeKeyDown}>
          {renderChildren(ROOT_PATH, 0)}
        </ul>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={
            pendingDelete.type === 'directory' ? (
              <>Ștergi directorul „{pendingDelete.name}” și tot ce conține?</>
            ) : (
              <>Ștergi fișierul „{pendingDelete.name}”?</>
            )
          }
          message={
            <>
              {pendingDelete.path !== pendingDelete.name && (
                <p className="dialog-path">
                  <code>{pendingDelete.path}</code>
                </p>
              )}
              <p>Acțiunea nu poate fi anulată.</p>
            </>
          }
          confirmLabel="Șterge"
          busyLabel="Se șterge…"
          busy={deleting}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onCancel={cancelDelete}
        />
      )}
    </section>
  )
}
