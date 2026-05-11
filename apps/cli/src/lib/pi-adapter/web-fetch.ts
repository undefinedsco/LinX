/**
 * Web Fetch & Web Search tools via Jina.ai
 *
 * These tools need a Jina API key. They do NOT read/write Pod themselves.
 * Instead they accept an apiKey parameter. The LLM is responsible for:
 *   1. Reading /alice/settings/credentials.ttl for <#jina> xpod:apiKey "..."
 *   2. Passing it as the apiKey parameter
 *   3. If absent, asking the user and writing it to the same path
 *
 * This follows the standard credential convention:
 *   Path:  /alice/settings/credentials.ttl
 *   Entry: <#credential-id> xpod:apiKey "value" .
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

// ── Constants ───────────────────────────────────────────────────────────────

const JINA_READER_BASE = 'https://r.jina.ai';
const JINA_SEARCH_BASE = 'https://s.jina.ai';
const FETCH_TIMEOUT_MS = 30_000;

// ── Parameter Schemas ──────────────────────────────────────────────────────

const WebFetchParams = Type.Object({
  url: Type.String({ description: 'Fully-formed URL to fetch (e.g., https://example.com/page)' }),
  apiKey: Type.Optional(Type.String({ description: 'Jina API key from Pod credentials (<#jina> xpod:apiKey). If missing, ask user to get one at https://jina.ai and save to credentials.' })),
});

const WebSearchParams = Type.Object({
  query: Type.String({ description: 'Search query' }),
  apiKey: Type.Optional(Type.String({ description: 'Jina API key from Pod credentials (<#jina> xpod:apiKey). If missing, ask user to get one at https://jina.ai and save to credentials.' })),
});

type WebFetchParams = typeof WebFetchParams.infer;
type WebSearchParams = typeof WebSearchParams.infer;

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveKey(explicit?: string): string | null {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.JINA_API_KEY?.trim()) return process.env.JINA_API_KEY.trim();
  return null;
}

function missingKeyMessage(): string {
  return [
    'No Jina API key provided.',
    '',
    '1. Read /alice/settings/credentials.ttl and look for <#jina>.',
    '2. If found, pass its xpod:apiKey value as the apiKey parameter.',
    '3. If not, ask the user to get a free key at https://jina.ai,',
    '   then save it:  <#jina> xpod:apiKey "jina_xxx" .',
    '4. Retry with the key.',
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
    const r = await fetch(`${JINA_READER_BASE}/${url}`, {
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
    const r = await fetch(`${JINA_SEARCH_BASE}/?q=${encodeURIComponent(query)}`, {
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
    'Requires apiKey from Pod credentials (<#jina> xpod:apiKey).',
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
    const apiKey = resolveKey(params.apiKey);
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
    'Requires apiKey from Pod credentials (<#jina> xpod:apiKey).',
    'Use to find pages, then web_fetch for full content.',
  ].join('\n'),
  parameters: WebSearchParams,
  async execute(_callId: string, params: WebSearchParams, signal?: AbortSignal, onUpdate?: (u: unknown) => void) {
    const query = params.query.trim();
    if (!query) return { content: [{ type: 'text' as const, text: 'Error: query is required' }], isError: true };
    const apiKey = resolveKey(params.apiKey);
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
