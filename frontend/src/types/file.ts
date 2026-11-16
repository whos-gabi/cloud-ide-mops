export type FileEntryType = 'file' | 'directory'

/** Un fișier sau un director din proiect, așa cum îl întoarce API-ul. */
export interface FileEntry {
  name: string
  /** Relativă la rădăcina proiectului, ex. 'src/app.py'. */
  path: string
  type: FileEntryType
  /** Dimensiunea în octeți; doar pentru fișiere. */
  size?: number
}

export interface CreateFileEntryInput {
  /** Directorul în care creăm; '' este rădăcina proiectului. */
  parent: string
  name: string
  type: FileEntryType
}

/** Calea rădăcinii proiectului. */
export const ROOT_PATH = ''

/** Directorul care conține `path` ('' pentru elementele din rădăcină). */
export function parentPath(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? ROOT_PATH : path.slice(0, slash)
}

/** `path` este chiar `ancestor` sau se află undeva în interiorul lui. */
export function isSameOrInside(path: string, ancestor: string): boolean {
  return ancestor === ROOT_PATH || path === ancestor || path.startsWith(`${ancestor}/`)
}

/** Aceeași ordine ca serverul: întâi directoarele, apoi fișierele, fiecare după nume. */
export function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort(
    (a, b) =>
      Number(b.type === 'directory') - Number(a.type === 'directory') ||
      a.name.localeCompare(b.name, 'ro', { sensitivity: 'base', numeric: true }) ||
      a.name.localeCompare(b.name),
  )
}
