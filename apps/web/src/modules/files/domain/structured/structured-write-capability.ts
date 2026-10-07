import { isFilesReservedResourceUri } from '../resource/files-rdf-contract'

export interface StructuredWriteCapabilityResource {
  uri: string
  mimeType?: string | null
}

export function supportsStructuredWriteProposals(resource: StructuredWriteCapabilityResource) {
  const normalizedMimeType = resource.mimeType?.split(';')[0]?.trim().toLowerCase() ?? ''
  let pathname: string
  try {
    pathname = new URL(resource.uri).pathname.toLowerCase()
  } catch {
    pathname = resource.uri.toLowerCase()
  }

  const isTurtle = normalizedMimeType === 'text/turtle' || pathname.endsWith('.ttl')
  const isPublicResource = pathname.includes('/public/')
  return isTurtle && !isPublicResource && !isFilesReservedResourceUri(resource.uri)
}
