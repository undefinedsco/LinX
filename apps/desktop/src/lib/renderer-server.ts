import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_RENDERER_PORT = 42137;

export interface RendererStaticServerOptions {
  host?: string;
  preferredPort?: number;
  onError?: (error: unknown) => void;
}

export class RendererStaticServer {
  private server: ReturnType<typeof createServer> | null = null;
  private baseUrl: string | null = null;
  private rootDir: string | null = null;
  private indexFile: string | null = null;
  private listenPromise: Promise<string> | null = null;

  constructor(private readonly options: RendererStaticServerOptions = {}) {}

  async prepareUrl(indexFilePath: string): Promise<string> {
    const nextIndexFile = path.resolve(indexFilePath);
    const nextRootDir = path.dirname(nextIndexFile);

    if (this.baseUrl && this.indexFile === nextIndexFile) {
      return this.baseUrl;
    }

    if (this.listenPromise && this.indexFile === nextIndexFile) {
      return this.listenPromise;
    }

    if (this.server) {
      await this.stop();
    }

    this.indexFile = nextIndexFile;
    this.rootDir = nextRootDir;
    this.listenPromise = this.start();
    return this.listenPromise;
  }

  getBaseUrl(indexFilePath?: string): string | null {
    if (!indexFilePath) {
      return this.baseUrl;
    }

    return this.indexFile === path.resolve(indexFilePath) ? this.baseUrl : null;
  }

  async stop(): Promise<void> {
    const activeServer = this.server;
    this.server = null;
    this.baseUrl = null;
    this.rootDir = null;
    this.indexFile = null;
    this.listenPromise = null;

    if (!activeServer) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private async start(): Promise<string> {
    const host = this.options.host ?? DEFAULT_HOST;
    const preferredPort = normalizePort(this.options.preferredPort, DEFAULT_RENDERER_PORT);

    try {
      return await this.listen(host, preferredPort);
    } catch (error: any) {
      if (preferredPort !== 0 && error?.code === 'EADDRINUSE') {
        this.options.onError?.(error);
        return this.listen(host, 0);
      }

      throw error;
    } finally {
      this.listenPromise = null;
    }
  }

  private async listen(host: string, port: number): Promise<string> {
    const server = createServer((request, response) => {
      void this.handleRequest(request, response).catch((error) => {
        this.options.onError?.(error);
        if (!response.headersSent) {
          response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        }
        response.end('Internal Server Error');
      });
    });

    return new Promise<string>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        const address = server.address();
        if (!address || typeof address === 'string') {
          server.close();
          reject(new Error('Failed to resolve renderer server address'));
          return;
        }

        this.server = server;
        this.baseUrl = buildBaseUrl(address);
        resolve(this.baseUrl);
      });
    });
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, {
        allow: 'GET, HEAD',
        'content-type': 'text/plain; charset=utf-8',
      });
      response.end('Method Not Allowed');
      return;
    }

    const rootDir = this.rootDir;
    const indexFile = this.indexFile;
    const baseUrl = this.baseUrl;
    if (!rootDir || !indexFile || !baseUrl) {
      response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Service Unavailable');
      return;
    }

    const requestUrl = new URL(request.url ?? '/', baseUrl);
    const target = await this.resolveStaticFile(rootDir, indexFile, requestUrl.pathname);
    if (!target) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not Found');
      return;
    }

    if (!isPathInside(rootDir, target)) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }

    await serveFile(request, response, target);
  }

  private async resolveStaticFile(
    rootDir: string,
    indexFile: string,
    pathname: string,
  ): Promise<string | null> {
    const decodedPathname = safeDecodePathname(pathname);
    if (!decodedPathname) {
      return null;
    }

    const normalizedPathname = decodedPathname === '/'
      ? '/index.html'
      : decodedPathname;
    const candidate = path.resolve(rootDir, `.${normalizedPathname}`);

    if (!isPathInside(rootDir, candidate)) {
      return candidate;
    }

    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isFile()) {
      return candidate;
    }

    if (stat?.isDirectory()) {
      const nestedIndex = path.join(candidate, 'index.html');
      const nestedStat = await fs.stat(nestedIndex).catch(() => null);
      if (nestedStat?.isFile()) {
        return nestedIndex;
      }
    }

    // SPA routes such as /chat and /auth/callback are handled by the renderer.
    if (!path.extname(normalizedPathname)) {
      return indexFile;
    }

    return null;
  }
}

export function resolveRendererServerPort(env: NodeJS.ProcessEnv = process.env): number {
  return normalizePort(Number(env.LINX_DESKTOP_RENDERER_PORT), DEFAULT_RENDERER_PORT);
}

function normalizePort(value: unknown, fallback: number): number {
  const port = Number(value);
  return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : fallback;
}

function buildBaseUrl(address: AddressInfo): string {
  return `http://${address.address}:${address.port}/`;
}

function safeDecodePathname(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function isPathInside(rootDir: string, target: string): boolean {
  const relative = path.relative(rootDir, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function serveFile(
  request: IncomingMessage,
  response: ServerResponse,
  filePath: string,
): Promise<void> {
  const stat = await fs.stat(filePath);
  response.writeHead(200, {
    'cache-control': path.basename(filePath) === 'index.html'
      ? 'no-store'
      : 'public, max-age=31536000, immutable',
    'content-length': stat.size,
    'content-type': resolveContentType(filePath),
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(response);
  });
}

function resolveContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
    case '.map':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml; charset=utf-8';
    case '.ico':
      return 'image/x-icon';
    case '.wasm':
      return 'application/wasm';
    case '.txt':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}
