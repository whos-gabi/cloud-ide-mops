import { config } from '../config/config.js'

// A failed call to workspace-manager (workspace-manager/API.md). `status` is its
// HTTP status, or 503 if it couldn't be reached at all.
export class WorkspaceManagerError extends Error {
  readonly status: number

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options)
    this.status = status
  }
}

interface RequestOptions {
  query?: Record<string, string>
  json?: unknown
  body?: string
}

// Returns the response body. Reads config on every call, so tests can point it elsewhere.
async function request(method: string, path: string, { query, json, body }: RequestOptions = {}): Promise<string> {
  const { url: baseUrl, token, requestTimeoutMs } = config.workspaceManager
  const url = new URL(path, baseUrl)
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value)

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(json !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: json !== undefined ? JSON.stringify(json) : body,
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
  } catch (err) {
    throw new WorkspaceManagerError(503, `${method} ${url.pathname}: workspace-manager unreachable`, { cause: err })
  }

  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new WorkspaceManagerError(res.status, `${method} ${url.pathname}: ${res.status} ${text.trim()}`)
  }
  return text
}

const workspacePath = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}`

export const workspaceManager = {
  // Creates and starts the workspace (Deployment, Service and volume).
  async createWorkspace(workspaceId: string, userId: string): Promise<void> {
    await request('POST', '/workspaces', { json: { workspaceID: workspaceId, userID: userId } })
  },

  // Deletes the workspace and its files. Succeeds if it's already gone.
  async deleteWorkspace(workspaceId: string): Promise<void> {
    await request('DELETE', workspacePath(workspaceId))
  },

  // Fails with 409 if the path exists, 404 if its directory doesn't, and 503
  // while the workspace isn't running.
  async createFile(workspaceId: string, path: string, content: string): Promise<void> {
    await request('POST', `${workspacePath(workspaceId)}/files`, { query: { path }, body: content })
  },
}
