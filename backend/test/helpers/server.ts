import type { AddressInfo } from 'node:net'
import { createApp } from '../../src/app.js'

export interface TestServer {
  url: string
  close: () => Promise<void>
  postJson: (path: string, body: unknown) => Promise<Response>
}

// The value and attributes of a cookie the response sets, or null.
export function getSetCookie(res: Response, name: string): { value: string; attributes: string[] } | null {
  const header = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))
  if (!header) return null
  const [pair, ...attributes] = header.split(';').map((part) => part.trim())
  return { value: decodeURIComponent(pair.slice(name.length + 1)), attributes }
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
