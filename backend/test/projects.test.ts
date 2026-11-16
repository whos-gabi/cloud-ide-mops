// US04 · Creare proiect cu alegerea limbajului
import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { config } from '../src/config/config.js'
import { dataSource } from '../src/database/data-source.js'
import { Project } from '../src/models/project.model.js'
import { setupDatabase, teardownDatabase, testEmail } from './helpers/database.js'
import { startFakeWorkspaceManager, type FakeWorkspaceManager } from './helpers/fake-workspace-manager.js'
import { getSetCookie, startServer, type TestServer } from './helpers/server.js'

const PASSWORD = 'parola-buna'
const TOKEN = 'test-workspace-manager-token'

let server: TestServer
let workspaces: FakeWorkspaceManager
const savedConfig = { ...config.workspaceManager }

interface TestUser {
  id: string
  cookie: string
}

async function loggedIn(): Promise<TestUser> {
  const email = testEmail()
  assert.equal((await server.postJson('/api/auth/register', { email, password: PASSWORD })).status, 201)
  const res = await server.postJson('/api/auth/login', { email, password: PASSWORD })
  assert.equal(res.status, 200)
  const { user } = await res.json()
  return { id: user.id, cookie: `sid=${getSetCookie(res, 'sid')!.value}` }
}

const createProject = (user: TestUser | null, body: unknown) =>
  fetch(`${server.url}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(user && { Cookie: user.cookie }) },
    body: JSON.stringify(body),
  })

const listProjects = (user: TestUser | null) =>
  fetch(`${server.url}/api/projects`, { headers: user ? { Cookie: user.cookie } : {} })

const projectRows = (userId: string) => dataSource.getRepository(Project).findBy({ userId })

before(async () => {
  await setupDatabase()
  server = await startServer()
})

after(async () => {
  Object.assign(config.workspaceManager, savedConfig)
  await server.close()
  await teardownDatabase()
})

beforeEach(async () => {
  workspaces = await startFakeWorkspaceManager({ token: TOKEN })
  Object.assign(config.workspaceManager, {
    url: workspaces.url,
    token: TOKEN,
    readyTimeoutMs: 1_000,
    retryIntervalMs: 10,
  })
})

afterEach(() => workspaces.close())

describe('POST /api/projects', () => {
  const STARTERS = [
    { language: 'python', path: 'main.py', snippet: 'print(' },
    { language: 'javascript', path: 'index.js', snippet: 'console.log(' },
    { language: 'java', path: 'Main.java', snippet: 'public class Main' },
    { language: 'cpp', path: 'main.cpp', snippet: 'int main()' },
  ]

  for (const { language, path, snippet } of STARTERS) {
    it(`creates a ${language} project whose workspace starts with ${path}`, async () => {
      const user = await loggedIn()

      const res = await createProject(user, { name: `Proiect ${language}`, language })

      assert.equal(res.status, 201)
      const { project } = await res.json()
      assert.deepEqual(Object.keys(project).sort(), ['createdAt', 'id', 'language', 'name', 'updatedAt'])
      assert.equal(project.name, `Proiect ${language}`)
      assert.equal(project.language, language)

      const [row] = await projectRows(user.id)
      assert.equal(row.id, project.id)
      assert.match(row.workspaceId, /^ws-[0-9a-f-]{36}$/)
      const workspace = workspaces.workspaces.get(row.workspaceId)
      assert.ok(workspace, 'no workspace was created')
      assert.equal(workspace.userId, user.id)
      assert.deepEqual([...workspace.files.keys()], [path])
      const file = workspace.files.get(path)!
      assert.equal(file.type, 'file')
      assert.ok(file.type === 'file' && file.content.includes(snippet), `unexpected ${path}`)
    })
  }

  it('gives every project its own workspace', async () => {
    const user = await loggedIn()
    assert.equal((await createProject(user, { name: 'unu', language: 'python' })).status, 201)
    assert.equal((await createProject(user, { name: 'doi', language: 'python' })).status, 201)
    const ids = (await projectRows(user.id)).map((p) => p.workspaceId)
    assert.equal(new Set(ids).size, 2)
    assert.equal(workspaces.workspaces.size, 2)
  })

  it('stores the name without surrounding spaces', async () => {
    const user = await loggedIn()
    const res = await createProject(user, { name: '  Temă   1  ', language: 'cpp' })
    assert.equal(res.status, 201)
    assert.equal((await res.json()).project.name, 'Temă   1')
  })

  it('needs a logged-in user', async () => {
    const res = await createProject(null, { name: 'x', language: 'python' })
    assert.equal(res.status, 401)
    assert.equal(workspaces.workspaces.size, 0)
  })

  describe('validation', () => {
    const cases: { body: unknown; field: string; message: string }[] = [
      { body: { language: 'python' }, field: 'name', message: 'Introdu numele proiectului.' },
      { body: { name: '   ', language: 'python' }, field: 'name', message: 'Introdu numele proiectului.' },
      { body: { name: 'a'.repeat(101), language: 'python' }, field: 'name', message: 'Numele poate avea cel mult 100 de caractere.' },
      { body: { name: 'linia1\nlinia2', language: 'python' }, field: 'name', message: 'Numele nu poate conține caractere de control sau invizibile.' },
      { body: { name: 'Tem\u200Bă', language: 'python' }, field: 'name', message: 'Numele nu poate conține caractere de control sau invizibile.' },
      { body: { name: 'abc\u202Edcba', language: 'python' }, field: 'name', message: 'Numele nu poate conține caractere de control sau invizibile.' },
      { body: { name: 'x' }, field: 'language', message: 'Alege limbajul: Python, JavaScript, Java sau C++.' },
      { body: { name: 'x', language: 'rust' }, field: 'language', message: 'Alege limbajul: Python, JavaScript, Java sau C++.' },
      { body: { name: 'x', language: 'Python' }, field: 'language', message: 'Alege limbajul: Python, JavaScript, Java sau C++.' },
    ]

    for (const { body, field, message } of cases) {
      it(`rejects ${JSON.stringify(body).slice(0, 60)} with a message for ${field}`, async () => {
        const user = await loggedIn()
        const res = await createProject(user, body)
        assert.equal(res.status, 400)
        const json = await res.json()
        assert.equal(json.code, 'VALIDATION_ERROR')
        assert.equal(json.fields[field], message)
        assert.equal((await projectRows(user.id)).length, 0)
        assert.equal(workspaces.workspaces.size, 0)
      })
    }

    it('accepts emoji, including ones joined with a zero-width joiner', async () => {
      const user = await loggedIn()
      const res = await createProject(user, { name: 'Proiect 👩\u200D💻', language: 'python' })
      assert.equal(res.status, 201)
    })

    it('accepts a name of exactly 100 characters', async () => {
      const user = await loggedIn()
      assert.equal((await createProject(user, { name: 'a'.repeat(100), language: 'java' })).status, 201)
    })
  })

  describe('unique name', () => {
    const TAKEN = {
      error: 'Ai deja un proiect cu acest nume.',
      code: 'PROJECT_NAME_TAKEN',
      fields: { name: 'Ai deja un proiect cu acest nume.' },
    }

    it('rejects a name the user already has, ignoring letter case and spaces', async () => {
      const user = await loggedIn()
      assert.equal((await createProject(user, { name: 'Tema 1', language: 'python' })).status, 201)

      const res = await createProject(user, { name: ' TEMA 1 ', language: 'java' })

      assert.equal(res.status, 409)
      assert.deepEqual(await res.json(), TAKEN)
      assert.equal((await projectRows(user.id)).length, 1)
      assert.equal(workspaces.workspaces.size, 1)
    })

    it('treats the same name typed with a combining accent as the same name', async () => {
      const user = await loggedIn()
      assert.equal((await createProject(user, { name: 'Temă'.normalize('NFC'), language: 'python' })).status, 201)
      const res = await createProject(user, { name: 'Temă'.normalize('NFD'), language: 'python' })
      assert.equal(res.status, 409)
      assert.equal((await res.json()).code, 'PROJECT_NAME_TAKEN')
    })

    it('lets two users have projects with the same name', async () => {
      const ana = await loggedIn()
      const ion = await loggedIn()
      assert.equal((await createProject(ana, { name: 'Tema 1', language: 'python' })).status, 201)
      assert.equal((await createProject(ion, { name: 'Tema 1', language: 'python' })).status, 201)
    })

    it('creates only one project when the same name is submitted twice at once', async () => {
      const user = await loggedIn()
      const statuses = (
        await Promise.all([
          createProject(user, { name: 'Dublu', language: 'python' }),
          createProject(user, { name: 'Dublu', language: 'python' }),
        ])
      ).map((res) => res.status)
      assert.deepEqual(statuses.sort(), [201, 409])
      assert.equal((await projectRows(user.id)).length, 1)
    })
  })

  describe('limit per user', () => {
    const savedLimit = config.projects.maxPerUser
    beforeEach(() => {
      config.projects.maxPerUser = 3
    })
    afterEach(() => {
      config.projects.maxPerUser = savedLimit
    })

    it('refuses a project over the limit, without touching workspace-manager', async () => {
      const user = await loggedIn()
      for (const name of ['a', 'b', 'c']) {
        assert.equal((await createProject(user, { name, language: 'python' })).status, 201)
      }

      const res = await createProject(user, { name: 'd', language: 'python' })

      assert.equal(res.status, 409)
      assert.deepEqual(await res.json(), { error: 'Poți avea cel mult 3 proiecte.', code: 'PROJECT_LIMIT_REACHED' })
      assert.equal(workspaces.workspaces.size, 3)
    })

    it('holds when the requests come all at once', async () => {
      const user = await loggedIn()
      const statuses = (
        await Promise.all(['a', 'b', 'c', 'd', 'e'].map((name) => createProject(user, { name, language: 'python' })))
      ).map((res) => res.status)
      assert.deepEqual(statuses.sort(), [201, 201, 201, 409, 409])
      assert.equal((await projectRows(user.id)).length, 3)
    })

    it('counts each user separately', async () => {
      const ana = await loggedIn()
      const ion = await loggedIn()
      for (const name of ['a', 'b', 'c']) {
        assert.equal((await createProject(ana, { name, language: 'python' })).status, 201)
      }
      assert.equal((await createProject(ion, { name: 'a', language: 'python' })).status, 201)
    })
  })

  describe('workspace', () => {
    const UNAVAILABLE = {
      error: 'Nu am putut pregăti mediul de lucru al proiectului. Încearcă din nou.',
      code: 'WORKSPACE_UNAVAILABLE',
    }

    it('waits for the workspace to start before writing the starter file', async () => {
      workspaces.startingRequests = 3
      const user = await loggedIn()

      const res = await createProject(user, { name: 'Pornire lentă', language: 'javascript' })

      assert.equal(res.status, 201)
      const [row] = await projectRows(user.id)
      assert.ok(workspaces.workspaces.get(row.workspaceId)?.files.has('index.js'))
    })

    it('sends the shared token to workspace-manager', async () => {
      config.workspaceManager.token = 'wrong-token'
      const user = await loggedIn()

      const res = await createProject(user, { name: 'x', language: 'python' })

      assert.equal(res.status, 503)
      assert.equal(workspaces.workspaces.size, 0)
    })

    it('undoes everything when the workspace cannot be created, so the name stays free', async () => {
      workspaces.failNext('POST', '/workspaces', 500)
      const user = await loggedIn()

      const res = await createProject(user, { name: 'Tema 2', language: 'python' })

      assert.equal(res.status, 503)
      assert.deepEqual(await res.json(), UNAVAILABLE)
      assert.equal((await projectRows(user.id)).length, 0)
      assert.equal((await createProject(user, { name: 'Tema 2', language: 'python' })).status, 201)
    })

    it('deletes the workspace when it never starts in time', async () => {
      workspaces.startingRequests = 1_000
      const user = await loggedIn()

      const res = await createProject(user, { name: 'Nu pornește', language: 'cpp' })

      assert.equal(res.status, 503)
      assert.deepEqual(await res.json(), UNAVAILABLE)
      assert.equal((await projectRows(user.id)).length, 0)
      assert.equal(workspaces.deleted.length, 1)
      assert.equal(workspaces.workspaces.size, 0)
    })

    it('deletes the workspace when writing the starter file fails', async () => {
      workspaces.failNext('POST', '/files', 500)
      const user = await loggedIn()

      const res = await createProject(user, { name: 'x', language: 'java' })

      assert.equal(res.status, 503)
      assert.equal((await projectRows(user.id)).length, 0)
      assert.equal(workspaces.deleted.length, 1)
    })

    it('treats a starter file that is already there as written (a retried request)', async () => {
      workspaces.failNext('POST', '/files', 409)
      const user = await loggedIn()
      assert.equal((await createProject(user, { name: 'x', language: 'python' })).status, 201)
    })

    it('answers 503 when workspace-manager is down', async () => {
      await workspaces.close()
      const user = await loggedIn()

      const res = await createProject(user, { name: 'x', language: 'python' })

      assert.equal(res.status, 503)
      assert.equal((await projectRows(user.id)).length, 0)
    })
  })
})

describe('GET /api/projects', () => {
  it('needs a logged-in user', async () => {
    const res = await listProjects(null)
    assert.equal(res.status, 401)
    assert.equal(res.headers.get('cache-control'), 'no-store')
  })

  it('is empty for a new user', async () => {
    const res = await listProjects(await loggedIn())
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { projects: [] })
  })

  it('shows a new project right away, newest first, and only the user’s own', async () => {
    const user = await loggedIn()
    const other = await loggedIn()
    assert.equal((await createProject(other, { name: 'Al altcuiva', language: 'python' })).status, 201)
    const first = (await (await createProject(user, { name: 'Primul', language: 'python' })).json()).project
    const second = (await (await createProject(user, { name: 'Al doilea', language: 'java' })).json()).project

    const res = await listProjects(user)

    assert.equal(res.status, 200)
    assert.deepEqual((await res.json()).projects, [second, first])
  })
})
