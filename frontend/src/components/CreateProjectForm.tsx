import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { projectsApi } from '../api/projects.api'
import {
  LANGUAGES,
  PROJECT_NAME_MAX_LENGTH,
  findLanguage,
  type Language,
  type Project,
} from '../types/project'

interface CreateProjectFormProps {
  onCreated: (project: Project) => void
}

interface FieldErrors {
  name?: string
  language?: string
}

export function CreateProjectForm({ onCreated }: CreateProjectFormProps) {
  const [name, setName] = useState('')
  const [language, setLanguage] = useState<Language | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const nameRef = useRef<HTMLInputElement>(null)
  const languageGroupRef = useRef<HTMLFieldSetElement>(null)
  const focusInvalidField = useRef(false)

  // Mută focusul pe primul câmp invalid după ce formularul este din nou activ.
  useEffect(() => {
    if (!focusInvalidField.current) return
    focusInvalidField.current = false
    if (fieldErrors.name) {
      nameRef.current?.focus()
    } else if (fieldErrors.language) {
      languageGroupRef.current?.querySelector<HTMLInputElement>('input')?.focus()
    }
  }, [fieldErrors])

  const showFieldErrors = (errors: FieldErrors) => {
    focusInvalidField.current = true
    setFieldErrors(errors)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return

    setError(null)
    setNotice(null)

    const trimmedName = name.trim()
    if (!trimmedName || !language) {
      showFieldErrors({
        name: trimmedName ? undefined : 'Introdu numele proiectului.',
        language: language ? undefined : 'Alege limbajul proiectului.',
      })
      return
    }

    setFieldErrors({})
    setSubmitting(true)

    try {
      const { project } = await projectsApi.create({ name: trimmedName, language })
      onCreated(project)
      setName('')
      setLanguage(null)
      setNotice(`Proiectul „${project.name}” a fost creat.`)
    } catch (err) {
      if (err instanceof ApiError) {
        const serverErrors: FieldErrors = {
          name: err.fields?.name,
          language: err.fields?.language,
        }
        if (serverErrors.name || serverErrors.language) {
          showFieldErrors(serverErrors)
        } else if (err.code === 'PROJECT_NAME_TAKEN') {
          showFieldErrors({ name: err.message })
        } else {
          setError(err.message)
        }
      } else {
        setError('Nu s-a putut contacta serverul.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleNameChange = (value: string) => {
    setName(value)
    setNotice(null)
    if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }))
  }

  const handleLanguageChange = (value: Language) => {
    setLanguage(value)
    setNotice(null)
    if (fieldErrors.language) setFieldErrors((prev) => ({ ...prev, language: undefined }))
  }

  const starterFile = language ? findLanguage(language)?.starterFile : undefined

  return (
    <section className="card" aria-labelledby="new-project-title">
      <div className="card-header">
        <div>
          <h2 id="new-project-title" className="card-title">
            Proiect nou
          </h2>
          <p className="card-subtitle">
            Alege un nume și limbajul. Îți pregătim mediul de lucru și fișierul de pornire.
          </p>
        </div>
      </div>

      <div role="status">{notice && <div className="alert ok">{notice}</div>}</div>
      {error && (
        <div className="alert err" role="alert">
          {error}
        </div>
      )}

      <form className="form" onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <div className="field">
          <div className="field-label-row">
            <label htmlFor="project-name">Nume proiect</label>
            <span className="field-counter">
              {name.length}/{PROJECT_NAME_MAX_LENGTH}
            </span>
          </div>
          <input
            ref={nameRef}
            id="project-name"
            type="text"
            autoComplete="off"
            placeholder="ex. Algoritmi – tema 1"
            maxLength={PROJECT_NAME_MAX_LENGTH}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            disabled={submitting}
            aria-required="true"
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? 'project-name-error' : undefined}
          />
          {fieldErrors.name && (
            <p id="project-name-error" className="field-error">
              {fieldErrors.name}
            </p>
          )}
        </div>

        <fieldset
          ref={languageGroupRef}
          className={`lang-group${fieldErrors.language ? ' has-error' : ''}`}
          aria-describedby={fieldErrors.language ? 'project-language-error' : undefined}
        >
          <legend>Limbaj</legend>
          <div className="lang-grid">
            {LANGUAGES.map((option) => (
              <label key={option.value} className="lang-option">
                <input
                  type="radio"
                  name="language"
                  value={option.value}
                  checked={language === option.value}
                  onChange={() => handleLanguageChange(option.value)}
                  disabled={submitting}
                />
                <span className="lang-tile">
                  <span className="lang-name">{option.label}</span>
                  <span className="lang-file">{option.starterFile}</span>
                </span>
              </label>
            ))}
          </div>
          {fieldErrors.language && (
            <p id="project-language-error" className="field-error">
              {fieldErrors.language}
            </p>
          )}
        </fieldset>

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Se pregătește mediul de lucru…' : 'Creează proiectul'}
        </button>
      </form>

      <div role="status">
        {submitting && (
          <p className="progress-note">
            <span className="spinner" aria-hidden="true" />
            <span>
              Pornim mediul proiectului și creăm fișierul{' '}
              <code>{starterFile}</code>. Poate dura câteva secunde.
            </span>
          </p>
        )}
      </div>
    </section>
  )
}
