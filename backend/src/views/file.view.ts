// A file or directory in a project, as the API returns it.
export interface FileEntryView {
  name: string
  // Relative to the project root, e.g. "src/main.py".
  path: string
  type: 'file' | 'directory'
  // Bytes; files only.
  size?: number
}
