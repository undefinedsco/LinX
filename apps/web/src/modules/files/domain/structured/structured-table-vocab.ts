import { filesVocabRegistryUri, resolveFilesPodRootUri } from '../resource/files-rdf-contract'

export type VocabRegistryRegistration = {
  instance: string | null
  instanceContainer: string | null
}

export type VocabRegistryDiscovery = {
  public: readonly VocabRegistryRegistration[]
  private: readonly VocabRegistryRegistration[]
}

export type VocabRegistryResourceName = 'terms.ttl' | 'shapes.ttl' | 'namespaces.ttl'

export function localPredicateLabel(predicate: string) {
  const hashIndex = predicate.lastIndexOf('#')
  if (hashIndex >= 0 && hashIndex < predicate.length - 1) return predicate.slice(hashIndex + 1)
  const slashIndex = predicate.lastIndexOf('/')
  if (slashIndex >= 0 && slashIndex < predicate.length - 1) return predicate.slice(slashIndex + 1)
  const colonIndex = predicate.lastIndexOf(':')
  if (colonIndex >= 0 && colonIndex < predicate.length - 1) return predicate.slice(colonIndex + 1)
  return predicate
}

export function resolveLocalVocabTermUri(
  documentUri: string,
  label: string,
  currentPodRootUri?: string | null,
  targetVocabUri?: string | null,
) {
  const slug = label
    .trim()
    .replace(/^[#./]+/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'term'
  if (targetVocabUri) return `${targetVocabUri}#${slug}`
  const podRoot = resolveFilesPodRootUri(documentUri, { currentPodRootUri })
  return `${filesVocabRegistryUri(podRoot, 'terms')}#${slug}`
}

export function resolvePodVocabResourceUri(
  documentUri: string,
  resourceName: VocabRegistryResourceName,
  currentPodRootUri?: string | null,
) {
  const registryKind = resourceName.replace(/\.ttl$/, '') as 'terms' | 'shapes' | 'namespaces'
  return filesVocabRegistryUri(resolveFilesPodRootUri(documentUri, { currentPodRootUri }), registryKind)
}

export function isTermsResourceUri(uri: string) {
  try {
    return new URL(uri).pathname.endsWith('/terms.ttl')
  } catch {
    return uri.endsWith('/terms.ttl') || uri.endsWith('terms.ttl')
  }
}

export function termsUriFromVocabRegistryRegistration(registration: VocabRegistryRegistration) {
  const instance = registration.instance?.trim()
  if (instance && isTermsResourceUri(instance)) return instance

  const instanceContainer = registration.instanceContainer?.trim()
  if (!instanceContainer) return null
  try {
    return new URL('terms.ttl', instanceContainer.endsWith('/') ? instanceContainer : `${instanceContainer}/`).toString()
  } catch {
    return `${instanceContainer.replace(/\/$/, '')}/terms.ttl`
  }
}

export function resolveDiscoveredVocabTermsUri(discovery: VocabRegistryDiscovery | null | undefined) {
  const registrations = [...(discovery?.private ?? []), ...(discovery?.public ?? [])]
  for (const registration of registrations) {
    const termsUri = termsUriFromVocabRegistryRegistration(registration)
    if (termsUri) return termsUri
  }
  return null
}

export function resolveSiblingVocabResourceUri(termsUri: string, resourceName: VocabRegistryResourceName) {
  if (resourceName === 'terms.ttl') return termsUri
  try {
    const url = new URL(termsUri)
    url.pathname = url.pathname.replace(/terms\.ttl$/, resourceName)
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return termsUri.replace(/terms\.ttl$/, resourceName)
  }
}
