export type RuntimeToolCategory = 'search' | 'read' | 'write' | 'execute' | 'other'

const RUNTIME_TOOL_CATEGORY_PATTERNS: ReadonlyArray<readonly [RuntimeToolCategory, RegExp]> = [
  ['search', /(search|grep|find|lookup|query)/],
  ['read', /(read|open|list|inspect|view)/],
  ['write', /(write|edit|patch|delete|remove|move)/],
  ['execute', /(exec|shell|bash|terminal|command)/],
]

export function classifyRuntimeTool(name: string): RuntimeToolCategory {
  const normalized = name.toLowerCase()
  return RUNTIME_TOOL_CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? 'other'
}
