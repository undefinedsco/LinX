/**
 * Pod Read/Write tools — LLM-facing tools for Pod filesystem access.
 *
 * These tools provide the LLM with the same familiar read/write interface
 * as local files, but routed through the authenticated Pod HTTP API.
 *
 * The LLM should prefer these over local read/write when the path starts
 * with a Pod root (e.g., /alice/). For local files, use read/write.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { getDefaultPodDataSession } from '../pod-data-session.js';

// ── Parameter Schemas ──────────────────────────────────────────────────────

const PodReadParams = Type.Object({
  path: Type.String({ description: 'Pod resource path (e.g., /alice/settings/credentials.ttl)' }),
});

const PodWriteParams = Type.Object({
  path: Type.String({ description: 'Pod resource path (e.g., /alice/settings/credentials.ttl)' }),
  content: Type.String({ description: 'Content to write' }),
  contentType: Type.Optional(Type.String({ description: 'Content-Type header. Default: text/turtle for .ttl, text/markdown for .md, application/json for .json' })),
});

type PodReadParams = typeof PodReadParams.infer;
type PodWriteParams = typeof PodWriteParams.infer;

// ── Content-Type inference ──────────────────────────────────────────────────

function inferContentType(path: string): string {
  if (path.endsWith('.ttl')) return 'text/turtle';
  if (path.endsWith('.md')) return 'text/markdown';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.html')) return 'text/html';
  return 'text/plain';
}

// ── Tool Definitions ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const podReadTool: any = {
  name: 'pod_read',
  label: 'Pod Read',
  description: [
    'Read a file from the user\'s Pod. Use this for any path under the Pod root (e.g., /alice/...).',
    'For local files, use the regular read tool instead.',
  ].join('\n'),
  parameters: PodReadParams,
  async execute(_callId: string, params: PodReadParams) {
    const path = params.path.trim();
    if (!path) return { content: [{ type: 'text' as const, text: 'Error: path is required' }], isError: true };

    const pod = await getDefaultPodDataSession();
    if (!pod) return { content: [{ type: 'text' as const, text: 'Error: not connected to Pod' }], isError: true };

    try {
      const res = await pod.fetch(path);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { content: [{ type: 'text' as const, text: `Pod read failed: HTTP ${res.status} — ${body.slice(0, 500)}` }], isError: true };
      }
      const text = await res.text();
      return { content: [{ type: 'text' as const, text }] };
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Pod read error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
    }
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const podWriteTool: any = {
  name: 'pod_write',
  label: 'Pod Write',
  description: [
    'Write content to a file in the user\'s Pod. Use this for any path under the Pod root (e.g., /alice/...).',
    'Content-Type is inferred from the file extension (.ttl → text/turtle, .md → text/markdown, .json → application/json).',
    'For local files, use the regular write tool instead.',
  ].join('\n'),
  parameters: PodWriteParams,
  async execute(_callId: string, params: PodWriteParams) {
    const path = params.path.trim();
    if (!path) return { content: [{ type: 'text' as const, text: 'Error: path is required' }], isError: true };

    const pod = await getDefaultPodDataSession();
    if (!pod) return { content: [{ type: 'text' as const, text: 'Error: not connected to Pod' }], isError: true };

    const ct = params.contentType?.trim() || inferContentType(path);

    try {
      const res = await pod.fetch(path, {
        method: 'PUT',
        headers: { 'Content-Type': ct },
        body: params.content,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { content: [{ type: 'text' as const, text: `Pod write failed: HTTP ${res.status} — ${body.slice(0, 500)}` }], isError: true };
      }
      return { content: [{ type: 'text' as const, text: `Written: ${path}` }] };
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Pod write error: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
    }
  },
};

// ── Pi Extension ────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
  pi.registerTool(podReadTool);
  pi.registerTool(podWriteTool);
}
