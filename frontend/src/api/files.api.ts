import { apiRequest } from './client'
import type { CreateFileEntryInput, FileEntry, FileEntryType } from '../types/file'

function filesEndpoint(projectId: string, query?: Record<string, string>) {
  const endpoint = `/projects/${encodeURIComponent(projectId)}/files`
  const search = query ? new URLSearchParams(query).toString() : ''
  return search ? `${endpoint}?${search}` : endpoint
}

export const filesApi = {
  // Un singur nivel: conținutul directorului `path` ('' = rădăcina proiectului).
  list: (projectId: string, path = '') =>
    apiRequest<{ path: string; entries: FileEntry[] }>(
      filesEndpoint(projectId, path ? { path } : undefined),
    ),

  create: (projectId: string, input: CreateFileEntryInput) =>
    apiRequest<{ entry: FileEntry }>(filesEndpoint(projectId), {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // Un director se șterge împreună cu tot ce conține.
  remove: (projectId: string, path: string, type: FileEntryType) =>
    apiRequest<void>(filesEndpoint(projectId, { path, type }), { method: 'DELETE' }),
}
