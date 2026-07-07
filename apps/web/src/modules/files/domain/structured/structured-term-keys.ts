export function localName(value: string) {
  const hashIndex = value.lastIndexOf('#')
  if (hashIndex >= 0 && hashIndex < value.length - 1) return value.slice(hashIndex + 1)
  const slashIndex = value.lastIndexOf('/')
  if (slashIndex >= 0 && slashIndex < value.length - 1) return value.slice(slashIndex + 1)
  const colonIndex = value.lastIndexOf(':')
  if (colonIndex >= 0 && colonIndex < value.length - 1) return value.slice(colonIndex + 1)
  return value
}

export function canonicalPredicateKey(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const predicateMatch = trimmed.match(/^predicate\s+(.+)$/i)
  const raw = (predicateMatch?.[1] ?? trimmed).trim()
  const lastHash = raw.lastIndexOf('#')
  if (lastHash >= 0) return `#${raw.slice(lastHash + 1)}`
  return raw
}

function namespaceAliasLookupKeys(value: string, namespaces?: ReadonlyMap<string, string>) {
  if (!namespaces?.size) return []
  const raw = value.trim().replace(/^predicate\s+/i, '').trim()
  const keys: string[] = []
  const curieMatch = raw.match(/^([A-Za-z][\w.-]*):(.+)$/)
  if (curieMatch && !raw.includes('://')) {
    const namespace = namespaces.get(curieMatch[1])
    if (namespace) keys.push(`${namespace}${curieMatch[2]}`)
  }
  for (const [prefix, namespace] of namespaces) {
    if (namespace && raw.startsWith(namespace)) keys.push(`${prefix}:${raw.slice(namespace.length)}`)
  }
  return keys
}

export function termLookupKeys(uri: string, namespaces?: ReadonlyMap<string, string>) {
  const canonical = canonicalPredicateKey(uri)
  const local = localName(uri)
  return Array.from(new Set([
    uri,
    canonical,
    canonical.startsWith('#') ? canonical.slice(1) : `#${canonical}`,
    local,
    local ? `#${local}` : '',
    ...namespaceAliasLookupKeys(uri, namespaces),
    ...namespaceAliasLookupKeys(canonical, namespaces),
  ].filter(Boolean)))
}
