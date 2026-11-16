// Dev defaults match docker-compose.yml.
const isProduction = process.env.NODE_ENV === 'production'

function databaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (url) return url
  if (isProduction) {
    throw new Error('DATABASE_URL is not set')
  }
  return 'postgres://cloudide:cloudide@localhost:5432/cloudide'
}

// Local dev: `npm run dev:workspace-manager` serves a fake one on these defaults.
function workspaceManagerSetting(name: string, devDefault: string): string {
  const value = process.env[name]
  if (value) return value
  if (isProduction) {
    throw new Error(`${name} is not set`)
  }
  return devDefault
}

export const config = {
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: databaseUrl(),
  version: process.env.APP_VERSION ?? 'dev',
  session: {
    cookieName: 'sid',
    ttlMs: 7 * 24 * 60 * 60 * 1000,
  },
  projects: {
    // Each project keeps a workspace (a pod and a volume), so one account
    // can't fill the server.
    maxPerUser: 10,
  },
  workspaceManager: {
    url: workspaceManagerSetting('WORKSPACE_MANAGER_URL', 'http://localhost:8080'),
    token: workspaceManagerSetting('WORKSPACE_MANAGER_TOKEN', 'dev-workspace-manager-token'),
    // Per call to workspace-manager.
    requestTimeoutMs: 15_000,
    // How long a new project waits for its workspace to start (RNF2 expects
    // under 10 s); stays below Cloudflare's 100 s limit for the request.
    readyTimeoutMs: 60_000,
    retryIntervalMs: 500,
  },
}
