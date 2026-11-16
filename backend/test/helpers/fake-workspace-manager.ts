// In-memory stand-in for workspace-manager (workspace-manager/API.md), for tests
// and local dev. Same routes, token check, status codes and file rules as the
// real one, without Kubernetes.
// Local dev: `npm run dev:workspace-manager` (port 8080); workspaces are lost on restart.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { posix } from 'node:path'
import { pathToFileURL } from 'node:url'

export type FakeEntry = { type: 'file'; content: string } | { type: 'directory' }

export interface FakeWorkspace {
  userId: string
  // Keyed by clean relative path, e.g. "src/main.py".
  files: Map<string, FakeEntry>
  // File requests that still answer 503, like a pod that is still starting.
  startingRequests: number
}

interface InjectedFailure {
  method: string
  pathSuffix: string
  status: number
  remaining: number
}

export interface FakeWorkspaceManager {
  url: string
  workspaces: Map<string, FakeWorkspace>
  // Workspace IDs passed to DELETE /workspaces/{id}, in order.
  deleted: string[]
  // New workspaces answer 503 to this many file requests before they "start".
  startingRequests: number
  // The next `times` requests whose method matches and whose path ends with
  // `pathSuffix` answer `status` instead.
  failNext: (method: string, pathSuffix: string, status: number, times?: number) => void
  close: () => Promise<void>
}

const WORKSPACE_ID = /^ws-[a-z0-9]([-a-z0-9]{0,46}[a-z0-9])?$/

class Answer extends Error {
  constructor(
    readonly status: number,
    readonly body = '',
  ) {
    super(body)
  }
}

// Like the file agent's safePath: relative, no "..", no backslashes.
function cleanPath(raw: string | null): string {
  if (!raw || raw.includes('\\') || raw.includes('\0')) throw new Answer(400, 'invalid path')
  const cleaned = posix.normalize(raw)
  if (cleaned.startsWith('/') || cleaned === '.' || cleaned === '..' || cleaned.startsWith('../')) {
    throw new Answer(400, 'path outside workspace')
  }
  return cleaned.replace(/\/$/, '')
}

function requireParentDirectory(workspace: FakeWorkspace, path: string): void {
  const parent = posix.dirname(path)
  if (parent === '.') return
  const entry = workspace.files.get(parent)
  if (!entry) throw new Answer(404, 'file not found')
  if (entry.type !== 'directory') throw new Answer(400, 'parent is not a directory')
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

export async function startFakeWorkspaceManager({
  token,
  port = 0,
}: {
  token: string
  port?: number
}): Promise<FakeWorkspaceManager> {
  const workspaces = new Map<string, FakeWorkspace>()
  const deleted: string[] = []
  const failures: InjectedFailure[] = []

  const fake: FakeWorkspaceManager = {
    url: '',
    workspaces,
    deleted,
    startingRequests: 0,
    failNext: (method, pathSuffix, status, times = 1) => {
      failures.push({ method, pathSuffix, status, remaining: times })
    },
    // Safe to call twice.
    close: () => new Promise((resolve) => (server.listening ? server.close(() => resolve()) : resolve())),
  }

  function workspaceFor(id: string): FakeWorkspace {
    const workspace = workspaces.get(id)
    if (!workspace) throw new Answer(503, 'workspace is not reachable')
    if (workspace.startingRequests > 0) {
      workspace.startingRequests--
      throw new Answer(503, 'workspace is not reachable')
    }
    return workspace
  }

  async function handle(req: IncomingMessage): Promise<Answer> {
    const url = new URL(req.url ?? '/', 'http://fake')
    const method = req.method ?? 'GET'

    if (method === 'GET' && url.pathname === '/health') return new Answer(200, 'Up')
    if (req.headers.authorization !== `Bearer ${token}`) return new Answer(401, 'unauthorized')

    const failure = failures.find((f) => f.method === method && url.pathname.endsWith(f.pathSuffix))
    if (failure) {
      if (--failure.remaining === 0) failures.splice(failures.indexOf(failure), 1)
      return new Answer(failure.status, 'injected failure')
    }

    if (method === 'POST' && url.pathname === '/workspaces') {
      let body: { workspaceID?: unknown; userID?: unknown }
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        return new Answer(400, 'invalid request body')
      }
      if (typeof body.workspaceID !== 'string' || !WORKSPACE_ID.test(body.workspaceID)) {
        return new Answer(400, 'invalid workspace id')
      }
      if (typeof body.userID !== 'string' || !body.userID) return new Answer(400, 'invalid user id')
      if (workspaces.has(body.workspaceID)) return new Answer(409, 'already exists')
      workspaces.set(body.workspaceID, {
        userId: body.userID,
        files: new Map(),
        startingRequests: fake.startingRequests,
      })
      return new Answer(201)
    }

    const match = /^\/workspaces\/([^/]+)(\/.*)?$/.exec(url.pathname)
    if (!match) return new Answer(404, 'not found')
    const [, id, rest = ''] = match
    if (!WORKSPACE_ID.test(id)) return new Answer(400, 'invalid workspace id')

    if (method === 'DELETE' && rest === '') {
      deleted.push(id)
      workspaces.delete(id)
      return new Answer(204)
    }

    if (method === 'POST' && rest === '/files') {
      const workspace = workspaceFor(id)
      const path = cleanPath(url.searchParams.get('path'))
      requireParentDirectory(workspace, path)
      if (workspace.files.has(path)) return new Answer(409, 'file already exists')
      workspace.files.set(path, { type: 'file', content: await readBody(req) })
      return new Answer(204)
    }

    if (method === 'POST' && rest === '/directories') {
      const workspace = workspaceFor(id)
      const path = cleanPath(url.searchParams.get('path'))
      requireParentDirectory(workspace, path)
      if (workspace.files.has(path)) return new Answer(409, 'directory already exists')
      workspace.files.set(path, { type: 'directory' })
      return new Answer(201)
    }

    return new Answer(404, 'not found')
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    handle(req)
      .catch((err: unknown) => (err instanceof Answer ? err : new Answer(500, String(err))))
      .then((answer) => {
        res.writeHead(answer.status, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(answer.status === 204 ? undefined : answer.body)
      })
  })

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return fake
}

// Started directly: serve on the backend's dev defaults (config.ts).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fake = await startFakeWorkspaceManager({
    token: process.env.WORKSPACE_MANAGER_TOKEN ?? 'dev-workspace-manager-token',
    port: Number(process.env.PORT ?? 8080),
  })
  console.log(`fake workspace-manager listening on ${fake.url} (in memory)`)
}
