import type { AddressInfo } from 'node:net'
import { createApp } from '../../src/app.js'

export interface TestServer {
  url: string
  close: () => Promise<void>
  postJson: (path: string, body: unknown) => Promise<Response>
}

export async function startServer(): Promise<TestServer> {
  const server = createApp().listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    url,
    close: () => new Promise((resolve) => server.close(() => resolve())),
    postJson: (path, body) =>
      fetch(url + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
  }
}
