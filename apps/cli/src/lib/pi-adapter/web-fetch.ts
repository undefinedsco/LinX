/**
 * Web Fetch & Web Search tools via Jina.ai
 *
 * These tools need a Jina API key. The tool runtime resolves that key from the
 * user's Pod-backed shared credential model. The LLM must not read or write
 * credential Turtle directly.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { getDefaultPodDataSession, type PodDataSession } from '../pod-data-session.js';
import {
  aiProviderResource,
  credentialResource,
  drizzle,
  selectAIConfigCredential,
  solidResources,
  type SolidDatabase,
} from '../models.js';

// ── Constants ───────────────────────────────────────────────────────────────

const JINA_READER_BASE = 'https://r.jina.ai';
const JINA_SEARCH_BASE = 'https://s.jina.ai';
const FETCH_TIMEOUT_MS = 30_000;
const JINA_PROVIDER_ID = 'jina';

// ── Parameter Schemas ──────────────────────────────────────────────────────

const WebFetchParams = Type.Object({
  url: Type.String({ description: 'Fully-formed URL to fetch (e.g., https://example.com/page)' }),
});

const WebSearchParams = Type.Object({
  query: Type.String({ description: 'Search query' }),
});

type WebFetchParams = typeof WebFetchParams.infer;
type WebSearchParams = typeof WebSearchParams.infer;

// ── Credential runtime ──────────────────────────────────────────────────────

interface JinaCredentialRuntime {
  getPodDataSession: () => Promise<PodDataSession | null>;
  createDb: (session: PodDataSession) => SolidDatabase;
  fetch: typeof fetch;
}

const defaultCredentialRuntime: JinaCredentialRuntime = {
  getPodDataSession: getDefaultPodDataSession,
  createDb(session) {
    return drizzle(session.solidSession, {
      logger: false,
      disableInteropDiscovery: true,
      podUrl: session.podUrl,
      resourcePreparation: 'off' as never,
      schema: solidResources,
    }) as unknown as SolidDatabase;
  },
  fetch,
};

let activeCredentialRuntime: JinaCredentialRuntime = defaultCredentialRuntime;

export function setJinaCredentialRuntime(runtime: Partial<JinaCredentialRuntime> | null): void {
  activeCredentialRuntime = runtime
    ? { ...defaultCredentialRuntime, ...runtime }
    : defaultCredentialRuntime;
}

export async function resolveJinaApiKey(runtime: JinaCredentialRuntime = activeCredentialRuntime): Promise<string | null> {
  const session = await runtime.getPodDataSession();
  if (!session) return null;

  const db = runtime.createDb(session) as any;
  const [credentialRows, providerRow] = await Promise.all([
    db.select().from(credentialResource).execute() as Promise<Array<Record<string, unknown>>>,
    typeof db.findById === 'function'
      ? db.findById(aiProviderResource, JINA_PROVIDER_ID) as Promise<Record<string, unknown> | null>
      : Promise.resolve(null),
  ]);

  const selected = selectAIConfigCredential(
    JINA_PROVIDER_ID,
    credentialRows,
    providerRow ? [providerRow] : [],
  );
  return selected?.apiKey ?? null;
}

function missingKeyMessage(): string {
  return [
    'No active Jina API key found in LinX Pod credentials.',
    '',
    'Configure a Pod credential for provider `jina`, then retry.',
    'The tool resolves credentials through @undefineds.co/models; tool calls should omit secret values.',
  ].join('\n');
}

function formatResults(results: Array<{ title: string; url: string; description: string }>): string {
  if (results.length === 0) return 'No results found.';
  return results.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}`).join('\n\n');
}

// ── Core Fetch / Search ────────────────────────────────────────────────────

async function jinaFetch(url: string, apiKey: string, signal?: AbortSignal): Promise<{ ok: true; markdown: string } | { ok: false; error: string }> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), FETCH_TIMEOUT_MS);
    if (signal) signal.addEventListener('abort', () => c.abort(), { once: true });
    const r = await activeCredentialRuntime.fetch(`${JINA_READER_BASE}/${url}`, {
      headers: { Accept: 'text/markdown', Authorization: `Bearer ${apiKey}` },
      signal: c.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      const b = await r.text().catch(() => '');
      return { ok: false, error: `HTTP ${r.status}: ${b.slice(0, 200)}` };
    }
    return { ok: true, markdown: await r.text() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function jinaSearch(query: string, apiKey: string, signal?: AbortSignal): Promise<{ ok: true; results: Array<{ title: string; url: string; description: string }> } | { ok: false; error: string }> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), FETCH_TIMEOUT_MS);
    if (signal) signal.addEventListener('abort', () => c.abort(), { once: true });
    const r = await activeCredentialRuntime.fetch(`${JINA_SEARCH_BASE}/?q=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: c.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      const b = await r.text().catch(() => '');
      return { ok: false, error: `HTTP ${r.status}: ${b.slice(0, 200)}` };
    }
    const d = await r.json() as { data?: Array<{ title?: string; url?: string; description?: string }> };
    return { ok: true, results: (d.data ?? []).map((r) => ({ title: r.title ?? 'Untitled', url: r.url ?? '', description: r.description ?? '' })) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Tool Definitions ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const webFetchTool: any = {
  name: 'web_fetch',
  label: 'Web Fetch',
  description: [
    'Fetch a web page as clean Markdown via Jina Reader.',
    'Uses the active Jina credential from the user Pod.',
    'Use for documentation, API references, blog posts, search results.',
    'Not for GitHub (use gh CLI) or local files (use read).',
  ].join('\n'),
  parameters: WebFetchParams,
  async execute(_callId: string, params: WebFetchParams, signal?: AbortSignal, onUpdate?: (u: unknown) => void) {
    const url = params.url.trim();
    if (!url) return { content: [{ type: 'text' as const, text: 'Error: url is required' }], isError: true };
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { content: [{ type: 'text' as const, text: 'Error: URL must start with http:// or https://' }], isError: true };
    }
    const apiKey = await resolveJinaApiKey();
    if (!apiKey) return { content: [{ type: 'text' as const, text: missingKeyMessage() }], isError: true };

    onUpdate?.({ content: [{ type: 'text' as const, text: `Fetching ${url}...` }] });
    const r = await jinaFetch(url, apiKey, signal);
    if (!r.ok) return { content: [{ type: 'text' as const, text: `Failed: ${(r as { error: string }).error}` }], isError: true };
    return { content: [{ type: 'text' as const, text: `Fetched ${url}:\n\n${r.markdown}` }] };
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const webSearchTool: any = {
  name: 'web_search',
  label: 'Web Search',
  description: [
    'Search the web via Jina Search. Returns titles, URLs, descriptions.',
    'Uses the active Jina credential from the user Pod.',
    'Use to find pages, then web_fetch for full content.',
  ].join('\n'),
  parameters: WebSearchParams,
  async execute(_callId: string, params: WebSearchParams, signal?: AbortSignal, onUpdate?: (u: unknown) => void) {
    const query = params.query.trim();
    if (!query) return { content: [{ type: 'text' as const, text: 'Error: query is required' }], isError: true };
    const apiKey = await resolveJinaApiKey();
    if (!apiKey) return { content: [{ type: 'text' as const, text: missingKeyMessage() }], isError: true };

    onUpdate?.({ content: [{ type: 'text' as const, text: `Searching "${query}"...` }] });
    const r = await jinaSearch(query, apiKey, signal);
    if (!r.ok) return { content: [{ type: 'text' as const, text: `Search failed: ${(r as { error: string }).error}` }], isError: true };
    return { content: [{ type: 'text' as const, text: `Results for "${query}":\n\n${formatResults(r.results)}` }] };
  },
};

// ── Pi Extension ────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  pi.registerTool(webFetchTool);
  pi.registerTool(webSearchTool);
}
