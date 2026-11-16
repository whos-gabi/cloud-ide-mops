// US08 · Creare și ștergere fișiere și directoare
import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { config } from '../src/config/config.js'
import { dataSource } from '../src/database/data-source.js'
import { Project } from '../src/models/project.model.js'
import { setupDatabase, teardownDatabase, testEmail } from './helpers/database.js'
import { startFakeWorkspaceManager, type FakeWorkspace, type FakeWorkspaceManager } from './helpers/fake-workspace-manager.js'
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

interface TestProject {
  id: string
  owner: TestUser
  workspace: FakeWorkspace
}

async function loggedIn(): Promise<TestUser> {
  const email = testEmail()
  assert.equal((await server.postJson('/api/auth/register', { email, password: PASSWORD })).status, 201)
  const res = await server.postJson('/api/auth/login', { email, password: PASSWORD })
  assert.equal(res.status, 200)
  const { user } = await res.json()
  return { id: user.id, cookie: `sid=${getSetCookie(res, 'sid')!.value}` }
}

// A python project: its workspace starts with main.py.
async function newProject(owner?: TestUser): Promise<TestProject> {
  owner ??= await loggedIn()
  const res = await fetch(`${server.url}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
    body: JSON.stringify({ name: `Proiect ${Math.random()}`, language: 'python' }),
  })
  assert.equal(res.status, 201)
  const { project } = await res.json()
  const row = await dataSource.getRepository(Project).findOneByOrFail({ id: project.id })
  return { id: project.id, owner, workspace: workspaces.workspaces.get(row.workspaceId)! }
}

const call = (user: TestUser | null, method: string, path: string, body?: unknown) =>
  fetch(`${server.url}${path}`, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(user && { Cookie: user.cookie }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const filesUrl = (project: TestProject, query: Record<string, string> = {}) => {
  const params = new URLSearchParams(query).toString()
  return `/api/projects/${project.id}/files${params ? `?${params}` : ''}`
}
const list = (project: TestProject, path?: string, as: TestUser = project.owner) =>
  call(as, 'GET', filesUrl(project, path === undefined ? {} : { path }))
const create = (project: TestProject, body: unknown, as: TestUser = project.owner) =>
  call(as, 'POST', filesUrl(project), body)
const remove = (project: TestProject, query: Record<string, string>, as: TestUser = project.owner) =>
  call(as, 'DELETE', filesUrl(project, query))

async function names(project: TestProject, path?: string): Promise<string[]> {
  const res = await list(project, path)
  assert.equal(res.status, 200)
  return (await res.json()).entries.map((e: { name: string }) => e.name)
}

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
  Object.assign(config.workspaceManager, { url: workspaces.url, token: TOKEN, readyTimeoutMs: 1_000, retryIntervalMs: 10 })
})

afterEach(() => workspaces.close())

describe('GET /api/projects/:projectId', () => {
  it('returns the user’s project', async () => {
    const project = await newProject()
    const res = await call(project.owner, 'GET', `/api/projects/${project.id}`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.project.id, project.id)
    assert.equal(body.project.language, 'python')
  })

  it('answers 404 for someone else’s project, an unknown id and a malformed id alike', async () => {
    const project = await newProject()
    const stranger = await loggedIn()
    for (const id of [project.id, '00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const res = await call(stranger, 'GET', `/api/projects/${id}`)
      assert.equal(res.status, 404)
      assert.deepEqual(await res.json(), { error: 'Proiectul nu există.', code: 'PROJECT_NOT_FOUND' })
    }
  })

  it('needs a logged-in user', async () => {
    const project = await newProject()
    assert.equal((await call(null, 'GET', `/api/projects/${project.id}`)).status, 401)
  })
})

describe('GET /api/projects/:projectId/files', () => {
  it('lists the root: a new project has its starter file', async () => {
    const project = await newProject()
    const res = await list(project)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {
      path: '',
      entries: [{ name: 'main.py', path: 'main.py', type: 'file', size: Buffer.byteLength('print("Salut, lume!")\n') }],
    })
  })

  it('lists directories first, then files, each by name', async () => {
    const project = await newProject()
    for (const [name, type] of [
      ['zeta.py', 'file'],
      ['Beta', 'directory'],
      ['alfa.py', 'file'],
      ['alfa', 'directory'],
      ['fișier 10.txt', 'file'],
      ['fișier 9.txt', 'file'],
    ]) {
      assert.equal((await create(project, { name, type })).status, 201)
    }
    assert.deepEqual(await names(project), ['alfa', 'Beta', 'alfa.py', 'fișier 9.txt', 'fișier 10.txt', 'main.py', 'zeta.py'])
  })

  it('lists a subdirectory with paths relative to the project', async () => {
    const project = await newProject()
    await create(project, { name: 'src', type: 'directory' })
    await create(project, { parent: 'src', name: 'app.py', type: 'file' })
    const res = await list(project, 'src')
    assert.deepEqual(await res.json(), { path: 'src', entries: [{ name: 'app.py', path: 'src/app.py', type: 'file', size: 0 }] })
  })

  it('answers 404 for a directory that does not exist', async () => {
    const project = await newProject()
    const res = await list(project, 'lipsa')
    assert.equal(res.status, 404)
    assert.equal((await res.json()).code, 'PATH_NOT_FOUND')
  })

  it('rejects paths that leave the project', async () => {
    const project = await newProject()
    for (const path of ['..', '../x', '/etc', 'a//b', 'a/./b', 'a\\b']) {
      const res = await list(project, path)
      assert.equal(res.status, 400, path)
      assert.equal((await res.json()).fields.path, 'Calea nu este validă.')
    }
  })
})

describe('POST /api/projects/:projectId/files', () => {
  it('creates a file in the root', async () => {
    const project = await newProject()

    const res = await create(project, { name: 'util.py', type: 'file' })

    assert.equal(res.status, 201)
    assert.deepEqual(await res.json(), { entry: { name: 'util.py', path: 'util.py', type: 'file', size: 0 } })
    assert.deepEqual(project.workspace.files.get('util.py'), { type: 'file', content: '' })
    assert.deepEqual(await names(project), ['main.py', 'util.py'])
  })

  it('creates a directory, and files and directories inside it', async () => {
    const project = await newProject()

    assert.equal((await create(project, { name: 'src', type: 'directory' })).status, 201)
    assert.equal((await create(project, { parent: 'src', name: 'lib', type: 'directory' })).status, 201)
    const res = await create(project, { parent: 'src/lib', name: 'helpers.py', type: 'file' })

    assert.equal(res.status, 201)
    assert.deepEqual((await res.json()).entry, { name: 'helpers.py', path: 'src/lib/helpers.py', type: 'file', size: 0 })
    assert.equal(project.workspace.files.get('src/lib')?.type, 'directory')
    assert.deepEqual(await names(project, 'src/lib'), ['helpers.py'])
  })

  it('keeps names with spaces and diacritics, without surrounding spaces', async () => {
    const project = await newProject()
    const res = await create(project, { name: '  Temă finală.py ', type: 'file' })
    assert.equal(res.status, 201)
    assert.equal((await res.json()).entry.path, 'Temă finală.py')
  })

  describe('two elements with the same name in one directory', () => {
    const TAKEN = {
      error: 'Există deja un element cu acest nume.',
      code: 'NAME_TAKEN',
      fields: { name: 'Există deja un element cu acest nume.' },
    }

    for (const [existing, created] of [
      ['file', 'file'],
      ['file', 'directory'],
      ['directory', 'file'],
      ['directory', 'directory'],
    ]) {
      it(`refuses a ${created} named like an existing ${existing}`, async () => {
        const project = await newProject()
        assert.equal((await create(project, { name: 'x', type: existing })).status, 201)

        const res = await create(project, { name: 'x', type: created })

        assert.equal(res.status, 409)
        assert.deepEqual(await res.json(), TAKEN)
        assert.equal(project.workspace.files.get('x')?.type, existing)
      })
    }

    it('treats the same name typed with a combining accent as the same name', async () => {
      const project = await newProject()
      assert.equal((await create(project, { name: 'Temă.py'.normalize('NFC'), type: 'file' })).status, 201)
      const res = await create(project, { name: 'Temă.py'.normalize('NFD'), type: 'file' })
      assert.equal(res.status, 409)
      assert.deepEqual(await names(project), ['main.py', 'Temă.py'])
    })

    it('allows the same name in different directories', async () => {
      const project = await newProject()
      await create(project, { name: 'src', type: 'directory' })
      assert.equal((await create(project, { parent: 'src', name: 'main.py', type: 'file' })).status, 201)
    })
  })

  it('answers 404 when the parent directory is gone', async () => {
    const project = await newProject()
    const res = await create(project, { parent: 'lipsa', name: 'a.py', type: 'file' })
    assert.equal(res.status, 404)
    assert.deepEqual(await res.json(), { error: 'Directorul în care creezi nu mai există.', code: 'PATH_NOT_FOUND' })
  })

  it('refuses to create inside a file', async () => {
    const project = await newProject()
    const res = await create(project, { parent: 'main.py', name: 'a.py', type: 'file' })
    assert.equal(res.status, 400)
    assert.equal((await res.json()).code, 'INVALID_PATH')
  })

  describe('validation', () => {
    const cases: { body: unknown; field: string; message: string }[] = [
      { body: { type: 'file' }, field: 'name', message: 'Introdu un nume.' },
      { body: { name: '   ', type: 'file' }, field: 'name', message: 'Introdu un nume.' },
      { body: { name: 'a/b', type: 'file' }, field: 'name', message: 'Numele nu poate conține „/” sau „\\”.' },
      { body: { name: 'a\\b', type: 'file' }, field: 'name', message: 'Numele nu poate conține „/” sau „\\”.' },
      { body: { name: '..', type: 'directory' }, field: 'name', message: 'Numele nu poate fi „.” sau „..”.' },
      { body: { name: '.', type: 'directory' }, field: 'name', message: 'Numele nu poate fi „.” sau „..”.' },
      { body: { name: 'a\tb', type: 'file' }, field: 'name', message: 'Numele nu poate conține caractere de control.' },
      { body: { name: 'ă'.repeat(128), type: 'file' }, field: 'name', message: 'Numele este prea lung.' },
      { body: { name: 'a', type: 'symlink' }, field: 'type', message: 'Alege dacă e fișier sau director.' },
      { body: { name: 'a' }, field: 'type', message: 'Alege dacă e fișier sau director.' },
      { body: { parent: '../..', name: 'a', type: 'file' }, field: 'parent', message: 'Calea nu este validă.' },
      { body: { parent: '/src', name: 'a', type: 'file' }, field: 'parent', message: 'Calea nu este validă.' },
    ]

    for (const { body, field, message } of cases) {
      it(`rejects ${JSON.stringify(body)}`, async () => {
        const project = await newProject()
        const res = await create(project, body)
        assert.equal(res.status, 400)
        const json = await res.json()
        assert.equal(json.code, 'VALIDATION_ERROR')
        assert.equal(json.fields[field], message)
        assert.deepEqual([...project.workspace.files.keys()], ['main.py'])
      })
    }
  })
})

describe('DELETE /api/projects/:projectId/files', () => {
  it('deletes a file', async () => {
    const project = await newProject()

    const res = await remove(project, { path: 'main.py', type: 'file' })

    assert.equal(res.status, 204)
    assert.deepEqual(await names(project), [])
  })

  it('deletes a directory with everything in it', async () => {
    const project = await newProject()
    await create(project, { name: 'src', type: 'directory' })
    await create(project, { parent: 'src', name: 'lib', type: 'directory' })
    await create(project, { parent: 'src/lib', name: 'a.py', type: 'file' })
    await create(project, { parent: 'src', name: 'b.py', type: 'file' })
    await create(project, { name: 'src2', type: 'directory' })

    const res = await remove(project, { path: 'src', type: 'directory' })

    assert.equal(res.status, 204)
    assert.deepEqual([...project.workspace.files.keys()].sort(), ['main.py', 'src2'])
  })

  it('answers 404 for something already gone', async () => {
    const project = await newProject()
    const res = await remove(project, { path: 'lipsa.py', type: 'file' })
    assert.equal(res.status, 404)
    assert.deepEqual(await res.json(), { error: 'Elementul nu mai există.', code: 'PATH_NOT_FOUND' })
  })

  it('does not delete a directory asked for as a file, or a file as a directory', async () => {
    const project = await newProject()
    await create(project, { name: 'src', type: 'directory' })
    assert.equal((await remove(project, { path: 'src', type: 'file' })).status, 400)
    assert.equal((await remove(project, { path: 'main.py', type: 'directory' })).status, 400)
    assert.deepEqual(await names(project), ['src', 'main.py'])
  })

  it('never deletes the project root', async () => {
    const project = await newProject()
    for (const query of [{ path: '', type: 'directory' }, { type: 'directory' }, { path: '.', type: 'directory' }]) {
      const res = await remove(project, query)
      assert.equal(res.status, 400, JSON.stringify(query))
      assert.ok((await res.json()).fields.path)
    }
    assert.deepEqual(await names(project), ['main.py'])
  })
})

describe('access and failures', () => {
  it('keeps other users out of the project’s files', async () => {
    const project = await newProject()
    const stranger = await loggedIn()

    for (const res of [
      await list(project, undefined, stranger),
      await create(project, { name: 'x.py', type: 'file' }, stranger),
      await remove(project, { path: 'main.py', type: 'file' }, stranger),
    ]) {
      assert.equal(res.status, 404)
      assert.equal((await res.json()).code, 'PROJECT_NOT_FOUND')
    }
    assert.deepEqual([...project.workspace.files.keys()], ['main.py'])
  })

  it('needs a logged-in user', async () => {
    const project = await newProject()
    assert.equal((await call(null, 'GET', filesUrl(project))).status, 401)
    assert.equal((await call(null, 'POST', filesUrl(project), { name: 'x', type: 'file' })).status, 401)
    assert.equal((await call(null, 'DELETE', filesUrl(project, { path: 'main.py', type: 'file' }))).status, 401)
    assert.deepEqual([...project.workspace.files.keys()], ['main.py'])
  })

  it('does not pass other workspace-manager errors (like its 401) on to the browser', async () => {
    const project = await newProject()
    for (const status of [401, 403, 405, 500]) {
      workspaces.failNext('GET', '/files/list', status)
      const res = await list(project)
      assert.equal(res.status, 502, String(status))
      assert.deepEqual(await res.json(), {
        error: 'Mediul de lucru al proiectului a răspuns cu o eroare. Încearcă din nou.',
        code: 'WORKSPACE_ERROR',
      })
    }
    // The user's session is untouched.
    assert.equal((await call(project.owner, 'GET', '/api/auth/me')).status, 200)
  })

  it('answers 503 while the workspace does not respond', async () => {
    const project = await newProject()
    project.workspace.startingRequests = 3
    for (const res of [
      await list(project),
      await create(project, { name: 'x.py', type: 'file' }),
      await remove(project, { path: 'main.py', type: 'file' }),
    ]) {
      assert.equal(res.status, 503)
      assert.equal((await res.json()).code, 'WORKSPACE_UNAVAILABLE')
    }
  })

  it('marks the project as changed when something is created or deleted', async () => {
    const owner = await loggedIn()
    const older = await newProject(owner)
    const newer = await newProject(owner)
    const order = async () =>
      (await (await call(owner, 'GET', '/api/projects')).json()).projects.map((p: { id: string }) => p.id)
    assert.deepEqual(await order(), [newer.id, older.id])

    assert.equal((await create(older, { name: 'nou.py', type: 'file' })).status, 201)
    assert.deepEqual(await order(), [older.id, newer.id])

    assert.equal((await remove(newer, { path: 'main.py', type: 'file' })).status, 204)
    assert.deepEqual(await order(), [newer.id, older.id])
  })
})
