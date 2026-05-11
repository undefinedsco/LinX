import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PATH = '/auth/callback'
const SUCCESS_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LinX 登录完成</title>
    <style>
      :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b1020; color: #f8fafc; }
      main { max-width: 420px; padding: 24px; border-radius: 16px; background: rgba(15, 23, 42, 0.92); box-shadow: 0 12px 40px rgba(15, 23, 42, 0.32); text-align: center; }
      h1 { margin: 0 0 12px; font-size: 20px; }
      p { margin: 0; line-height: 1.6; color: rgba(248, 250, 252, 0.82); }
    </style>
  </head>
  <body>
    <main>
      <h1>登录已完成</h1>
      <p>可以回到 LinX 继续使用。</p>
    </main>
    <script>
      setTimeout(() => {
        try {
          window.close();
        } catch {}
      }, 120);
    </script>
  </body>
</html>`

export interface AuthLoopbackServerOptions {
  onCallback: (url: string) => void
  host?: string
  callbackPath?: string
  successHtml?: string
  onError?: (error: unknown) => void
}

export class AuthLoopbackServer {
  private server: ReturnType<typeof createServer> | null = null
  private redirectUrl: string | null = null
  private listenPromise: Promise<string> | null = null

  constructor(private readonly options: AuthLoopbackServerOptions) {}

  async prepareRedirectUrl(): Promise<string> {
    if (this.redirectUrl) {
      return this.redirectUrl
    }

    if (this.listenPromise) {
      return this.listenPromise
    }

    this.listenPromise = this.start()
    return this.listenPromise
  }

  async stop(): Promise<void> {
    const activeServer = this.server
    this.server = null
    this.redirectUrl = null
    this.listenPromise = null

    if (!activeServer) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  private async start(): Promise<string> {
    const host = this.options.host ?? DEFAULT_HOST
    const callbackPath = normalizePathname(this.options.callbackPath ?? DEFAULT_PATH)

    return new Promise<string>((resolve, reject) => {
      const server = createServer((request, response) => {
        void this.handleRequest(request, response, callbackPath).catch((error) => {
          this.options.onError?.(error)
          if (!response.headersSent) {
            response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
          }
          response.end('Internal Server Error')
        })
      })

      server.once('error', (error) => {
        this.listenPromise = null
        reject(error)
      })

      server.listen(0, host, () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          this.listenPromise = null
          reject(new Error('Failed to resolve loopback auth server address'))
          return
        }

        this.server = server
        this.redirectUrl = buildRedirectUrl(address, callbackPath)
        this.listenPromise = null
        resolve(this.redirectUrl)
      })
    })
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
    callbackPath: string,
  ): Promise<void> {
    if (request.method !== 'GET') {
      response.writeHead(405, {
        'content-type': 'text/plain; charset=utf-8',
        allow: 'GET',
      })
      response.end('Method Not Allowed')
      return
    }

    const redirectUrl = this.redirectUrl
    if (!redirectUrl) {
      response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Service Unavailable')
      return
    }

    const requestUrl = new URL(request.url ?? '/', redirectUrl)
    if (normalizePathname(requestUrl.pathname) !== callbackPath) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not Found')
      return
    }

    const callbackUrl = new URL(redirectUrl)
    callbackUrl.search = requestUrl.search
    this.options.onCallback(callbackUrl.href)

    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
    })
    response.end(this.options.successHtml ?? SUCCESS_HTML)
  }
}

function buildRedirectUrl(address: AddressInfo, callbackPath: string): string {
  return `http://${address.address}:${address.port}${callbackPath}`
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim()
  if (!trimmed) {
    return '/'
  }

  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return normalized.replace(/\/+$/, '') || '/'
}
