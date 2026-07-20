import { readFile } from 'node:fs/promises';
import { net, session, type ClientRequest, type ProtocolRequest, type ProtocolResponse, type Session } from 'electron';
import type { LocalOnboardingSnapshot } from './local-onboarding';
import type { XpodStatus } from './xpod-manager';

// Persist the provider's browser session across app relaunches. This is
// Chromium profile storage, not macOS Keychain storage.
export const AUTH_SESSION_PARTITION = 'persist:linx-auth';

export interface LocalSpSessionRoute {
  canonicalBaseUrl: string;
  accessBaseUrl: string;
}

const activeRoutes = new Map<string, LocalSpSessionRoute>();
const installedSessions = new WeakSet<Session>();

export function installLocalSpSessionRoutes(): void {
  installForSession(session.defaultSession);
  installForSession(session.fromPartition(AUTH_SESSION_PARTITION));
}

export function updateLocalSpSessionRoute(route: LocalSpSessionRoute | null): void {
  activeRoutes.clear();
  if (!route) {
    return;
  }

  const canonical = normalizeBaseUrl(route.canonicalBaseUrl);
  const access = normalizeBaseUrl(route.accessBaseUrl);
  if (!canonical || !access || canonical.origin === access.origin) {
    return;
  }

  activeRoutes.set(canonical.origin, {
    canonicalBaseUrl: canonical.href,
    accessBaseUrl: access.href,
  });
}

export function updateLocalSpSessionRouteFromSnapshot(snapshot: LocalOnboardingSnapshot): void {
  updateLocalSpSessionRoute(resolveLocalSpSessionRouteFromSnapshot(snapshot));
}

export function updateLocalSpSessionRouteFromStatus(status: XpodStatus): void {
  updateLocalSpSessionRoute(resolveLocalSpSessionRouteFromStatus(status));
}

export function resolveLocalSpSessionRouteFromSnapshot(
  snapshot: Pick<LocalOnboardingSnapshot, 'state' | 'spaceKind' | 'localUrl' | 'publicUrl' | 'baseUrl'>,
): LocalSpSessionRoute | null {
  if (snapshot.spaceKind !== 'local') {
    return null;
  }

  if (snapshot.state !== 'ready' && snapshot.state !== 'starting' && snapshot.state !== 'repair_required') {
    return null;
  }

  return resolveLocalSpSessionRoute({
    canonicalBaseUrl: snapshot.publicUrl ?? snapshot.baseUrl,
    accessBaseUrl: snapshot.localUrl,
  });
}

export function resolveLocalSpSessionRouteFromStatus(
  status: Pick<XpodStatus, 'running' | 'status' | 'baseUrl' | 'localUrl' | 'provisioning'>,
): LocalSpSessionRoute | null {
  if (!status.running && status.status !== 'starting') {
    return null;
  }

  return resolveLocalSpSessionRoute({
    canonicalBaseUrl: status.provisioning?.publicUrl ?? status.baseUrl ?? null,
    accessBaseUrl: status.localUrl ?? null,
  });
}

export function rewriteLocalSpUrl(requestUrl: string): string | null {
  const request = resolveRouteForUrl(requestUrl);
  const route = request?.route;
  if (!route) {
    return null;
  }

  return rewriteUrlBase(request.url.href, route.canonicalBaseUrl, route.accessBaseUrl);
}

export async function resolveLocalSpOidcIssuer(
  entryUrl: string,
  targetSession: Session = session.defaultSession,
): Promise<string | null> {
  const entry = normalizeBaseUrl(entryUrl);
  if (!entry) {
    return null;
  }

  const configUrl = new URL('/.well-known/openid-configuration', entry).href;
  const routeMatch = resolveRouteForUrl(configUrl);
  if (!routeMatch) {
    return null;
  }

  const rewrittenUrl = rewriteUrlBase(
    routeMatch.url.href,
    routeMatch.route.canonicalBaseUrl,
    routeMatch.route.accessBaseUrl,
  );
  if (!rewrittenUrl) {
    return null;
  }

  const payload = await requestJsonViaLocalSpRoute(targetSession, rewrittenUrl, routeMatch.url);
  const issuer = typeof payload?.issuer === 'string' && payload.issuer.trim()
    ? normalizeUrl(payload.issuer.trim())
    : null;

  return (issuer ?? entry).href.replace(/\/$/, '');
}

function installForSession(targetSession: Session): void {
  if (installedSessions.has(targetSession)) {
    return;
  }

  try {
    const installed = targetSession.protocol.interceptStreamProtocol('https', (request, callback) => {
      void handleHttpsRequest(targetSession, request, callback);
    });
    if (installed) {
      installedSessions.add(targetSession);
    } else {
      console.warn('[Desktop] Local SP session route was not installed for an Electron session.');
    }
  } catch (error) {
    console.warn('[Desktop] Failed to install Local SP session route:', error);
  }
}

async function handleHttpsRequest(
  targetSession: Session,
  request: ProtocolRequest,
  callback: (response: NodeJS.ReadableStream | ProtocolResponse) => void,
): Promise<void> {
  const routeMatch = resolveRouteForUrl(request.url);
  if (!routeMatch) {
    callback(await forwardPassThroughRequest(targetSession, request));
    return;
  }

  const rewrittenUrl = rewriteUrlBase(
    routeMatch.url.href,
    routeMatch.route.canonicalBaseUrl,
    routeMatch.route.accessBaseUrl,
  );
  if (!rewrittenUrl) {
    callback(await forwardPassThroughRequest(targetSession, request));
    return;
  }

  callback(await forwardLocalSpRequest(targetSession, request, routeMatch.route, rewrittenUrl));
}

function forwardLocalSpRequest(
  targetSession: Session,
  request: ProtocolRequest,
  route: LocalSpSessionRoute,
  rewrittenUrl: string,
): Promise<ProtocolResponse> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (response: ProtocolResponse): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(response);
    };

    const clientRequest = net.request({
      url: rewrittenUrl,
      method: request.method,
      headers: createForwardHeaders(request),
      session: targetSession,
      redirect: 'manual',
      useSessionCookies: true,
      credentials: 'include',
      bypassCustomProtocolHandlers: true,
    });

    clientRequest.on('redirect', (statusCode, _method, redirectUrl, responseHeaders) => {
      finish({
        statusCode,
        headers: createRedirectResponseHeaders(responseHeaders, redirectUrl, route),
        data: Buffer.alloc(0),
      });
    });

    clientRequest.on('response', (response) => {
      finish({
        statusCode: response.statusCode,
        headers: createResponseHeaders(response.headers, route),
        data: response as unknown as NodeJS.ReadableStream,
      });
    });

    clientRequest.on('error', (error) => {
      if (settled) {
        return;
      }
      console.warn('[Desktop] Local SP session route request failed:', error);
      finish({ error: -2 });
    });

    void writeUploadData(targetSession, clientRequest, request.uploadData)
      .then(() => clientRequest.end())
      .catch((error) => {
        console.warn('[Desktop] Failed to forward Local SP upload data:', error);
        clientRequest.abort();
        finish({ error: -2 });
      });
  });
}

function forwardPassThroughRequest(
  targetSession: Session,
  request: ProtocolRequest,
): Promise<ProtocolResponse> {
  return forwardHttpsRequest(targetSession, request, request.url, (headers) => headers);
}

function forwardHttpsRequest(
  targetSession: Session,
  request: ProtocolRequest,
  targetUrl: string,
  createHeaders: (headers: Record<string, string | string[]>) => Record<string, string | string[]>,
): Promise<ProtocolResponse> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (response: ProtocolResponse): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(response);
    };

    const clientRequest = net.request({
      url: targetUrl,
      method: request.method,
      headers: createHeaders(createForwardHeaders(request)),
      session: targetSession,
      redirect: 'manual',
      useSessionCookies: true,
      credentials: 'include',
      bypassCustomProtocolHandlers: true,
    });

    clientRequest.on('redirect', (statusCode, _method, redirectUrl, responseHeaders) => {
      finish({
        statusCode,
        headers: { ...responseHeaders, location: responseHeaders.location ?? [redirectUrl] },
        data: Buffer.alloc(0),
      });
    });

    clientRequest.on('response', (response) => {
      finish({
        statusCode: response.statusCode,
        headers: response.headers,
        data: response as unknown as NodeJS.ReadableStream,
      });
    });

    clientRequest.on('error', (error) => {
      if (settled) {
        return;
      }
      console.warn('[Desktop] HTTPS pass-through request failed:', error);
      finish({ error: -2 });
    });

    void writeUploadData(targetSession, clientRequest, request.uploadData)
      .then(() => clientRequest.end())
      .catch((error) => {
        console.warn('[Desktop] Failed to forward HTTPS upload data:', error);
        clientRequest.abort();
        finish({ error: -2 });
      });
  });
}

function createRedirectResponseHeaders(
  headers: Record<string, string[]>,
  redirectUrl: string,
  route: LocalSpSessionRoute,
): Record<string, string | string[]> {
  const next: Record<string, string | string[]> = { ...headers };
  if (!hasHeader(next, 'location')) {
    next.location = redirectUrl;
  }
  return createResponseHeaders(next, route);
}

function createForwardHeaders(request: ProtocolRequest): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};
  const original = normalizeUrl(request.url);
  for (const [key, value] of Object.entries(request.headers)) {
    if (isRestrictedForwardHeader(key)) {
      continue;
    }
    headers[key] = value;
  }

  if (original) {
    Object.assign(headers, createCanonicalForwardHeaders(original));
  }
  return headers;
}

function createCanonicalForwardHeaders(original: URL): Record<string, string> {
  const headers: Record<string, string> = {
    'x-forwarded-host': original.host,
    'x-forwarded-proto': original.protocol.replace(':', ''),
  };

  if (original.port) {
    headers['x-forwarded-port'] = original.port;
  }

  return headers;
}

function createResponseHeaders(
  headers: Record<string, string | string[]>,
  route: LocalSpSessionRoute,
): Record<string, string | string[]> {
  const next: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'location') {
      next[key] = rewriteHeaderLocation(value, route);
      continue;
    }
    next[key] = value;
  }
  return next;
}

function hasHeader(headers: Record<string, string | string[]>, key: string): boolean {
  const normalized = key.toLowerCase();
  return Object.keys(headers).some((entry) => entry.toLowerCase() === normalized);
}

function rewriteHeaderLocation(value: string | string[], route: LocalSpSessionRoute): string | string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteUrlBase(entry, route.accessBaseUrl, route.canonicalBaseUrl) ?? entry);
  }

  return rewriteUrlBase(value, route.accessBaseUrl, route.canonicalBaseUrl) ?? value;
}

function requestJsonViaLocalSpRoute(
  targetSession: Session,
  rewrittenUrl: string,
  canonicalUrl: URL,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve, reject) => {
    const clientRequest = net.request({
      url: rewrittenUrl,
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...createCanonicalForwardHeaders(canonicalUrl),
      },
      session: targetSession,
      redirect: 'manual',
      useSessionCookies: true,
      credentials: 'include',
      bypassCustomProtocolHandlers: true,
    });

    clientRequest.on('response', (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on('end', () => {
        const statusCode = response.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`Local SP discovery failed: HTTP ${statusCode}`));
          return;
        }

        try {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve(text.trim() ? JSON.parse(text) as Record<string, unknown> : null);
        } catch (error) {
          reject(error);
        }
      });
      response.on('error', reject);
    });

    clientRequest.on('error', reject);
    clientRequest.end();
  });
}

async function writeUploadData(
  targetSession: Session,
  clientRequest: ClientRequest,
  uploadData: Electron.UploadData[] | undefined,
): Promise<void> {
  if (!uploadData?.length) {
    return;
  }

  for (const entry of uploadData) {
    if (entry.bytes?.length) {
      clientRequest.write(entry.bytes);
      continue;
    }
    if (entry.file) {
      clientRequest.write(await readFile(entry.file));
      continue;
    }
    if (entry.blobUUID) {
      clientRequest.write(await targetSession.getBlobData(entry.blobUUID));
    }
  }
}

function collectBytesUploadData(uploadData: Electron.UploadData[] | undefined): Buffer | null {
  const chunks = uploadData
    ?.map((entry) => entry.bytes)
    .filter((bytes): bytes is Buffer => Boolean(bytes?.length));
  if (!chunks?.length) {
    return null;
  }
  return Buffer.concat(chunks);
}

function resolveRouteForUrl(requestUrl: string): { url: URL; route: LocalSpSessionRoute } | null {
  const url = normalizeUrl(requestUrl);
  if (!url) {
    return null;
  }

  const route = activeRoutes.get(url.origin);
  return route ? { url, route } : null;
}

function isRestrictedForwardHeader(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized === 'host'
    || normalized === 'content-length'
    || normalized === 'connection'
    || normalized === 'keep-alive'
    || normalized === 'transfer-encoding'
    || normalized === 'upgrade'
    || normalized === 'te'
    || normalized === 'trailer';
}

function resolveLocalSpSessionRoute(input: {
  canonicalBaseUrl: string | null | undefined;
  accessBaseUrl: string | null | undefined;
}): LocalSpSessionRoute | null {
  const canonical = normalizeBaseUrl(input.canonicalBaseUrl);
  const access = normalizeBaseUrl(input.accessBaseUrl);
  if (!canonical || !access) {
    return null;
  }

  if (canonical.protocol !== 'https:' || !isLoopbackAccess(access)) {
    return null;
  }

  if (canonical.origin === access.origin) {
    return null;
  }

  return {
    canonicalBaseUrl: canonical.href,
    accessBaseUrl: access.href,
  };
}

function rewriteUrlBase(requestUrl: string, fromBaseUrl: string, toBaseUrl: string): string | null {
  const request = normalizeUrl(requestUrl);
  const from = normalizeBaseUrl(fromBaseUrl);
  const to = normalizeBaseUrl(toBaseUrl);
  if (!request || !from || !to || request.origin !== from.origin) {
    return null;
  }

  const rewritten = new URL(request.pathname.replace(/^\/+/, ''), to);
  rewritten.search = request.search;
  rewritten.hash = request.hash;
  return rewritten.href;
}

function normalizeBaseUrl(value: string | null | undefined): URL | null {
  const url = normalizeUrl(value);
  if (!url) {
    return null;
  }

  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function normalizeUrl(value: string | null | undefined): URL | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

function isLoopbackAccess(url: URL): boolean {
  return url.protocol === 'http:' && (
    url.hostname === 'localhost'
    || url.hostname === '127.0.0.1'
    || url.hostname === '[::1]'
  );
}
