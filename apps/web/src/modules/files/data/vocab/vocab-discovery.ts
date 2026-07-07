const SOLID_NS = 'http://www.w3.org/ns/solid/terms#'
const PIM_NS = 'http://www.w3.org/ns/pim/space#'
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'

export type SolidTypeIndexRegistrationSource = 'public' | 'private'

export interface SolidTypeIndexRegistration {
  source: SolidTypeIndexRegistrationSource
  registrationUri: string
  forClass: string
  instance: string | null
  instanceContainer: string | null
}

export interface SolidTypeIndexDiscoveryResult {
  publicTypeIndexUri: string | null
  privateTypeIndexUri: string | null
  public: SolidTypeIndexRegistration[]
  private: SolidTypeIndexRegistration[]
}

export interface SolidTypeIndexDiscoveryInput {
  webId: string
  forClass: string
  profileTurtle: string
  publicTypeIndexTurtle?: string | null
  preferencesTurtle?: string | null
  privateTypeIndexTurtle?: string | null
  localVocabUri?: string | null
}

export interface SolidTypeIndexDiscoveryFromWebIdInput {
  webId: string
  forClass: string
  readResourceText: (uri: string) => Promise<string | null>
  localVocabUri?: string | null
}

export function createSolidTypeIndexResourceTextReader(authFetch: typeof fetch) {
  return async (uri: string): Promise<string | null> => {
    const response = await authFetch(uri, {
      method: 'GET',
      headers: {
        Accept: 'text/turtle, text/*;q=0.9, application/ld+json;q=0.8, */*;q=0.1',
      },
    })
    if (response.status === 404 || response.status === 410) return null
    if (!response.ok) {
      throw new Error(`Failed to read Solid Type Index resource: HTTP ${response.status}`)
    }
    return response.text()
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function predicatePattern(prefix: 'solid' | 'pim', localName: string) {
  const namespace = prefix === 'solid' ? SOLID_NS : PIM_NS
  return `(?:${prefix}:${localName}|<${escapeRegExp(`${namespace}${localName}`)}>)`
}

function resolveIri(value: string, baseUri: string | null): string {
  if (!baseUri) return value
  try {
    return new URL(value, baseUri).toString()
  } catch {
    return value.startsWith('#') ? `${baseUri.replace(/#.*$/, '')}${value}` : value
  }
}

function readFirstIri(source: string, prefix: 'solid' | 'pim', localName: string, baseUri: string | null = null) {
  const value = source.match(new RegExp(`${predicatePattern(prefix, localName)}\\s+<([^>]+)>`))?.[1] ?? null
  return value ? resolveIri(value, baseUri) : null
}

function stripFragment(uri: string): string {
  const hashIndex = uri.indexOf('#')
  return hashIndex >= 0 ? uri.slice(0, hashIndex) : uri
}

function parseTypeIndexRegistrations(input: {
  source: SolidTypeIndexRegistrationSource
  typeIndexUri: string | null
  typeIndexTurtle?: string | null
  forClass: string
}): SolidTypeIndexRegistration[] {
  if (!input.typeIndexUri || !input.typeIndexTurtle) return []
  const registrationPattern = new RegExp(
    `<([^>]+)>\\s+a\\s+(?:solid:TypeRegistration|<${escapeRegExp(`${SOLID_NS}TypeRegistration`)}>)\\s*;([\\s\\S]*?)\\s+\\.`,
    'g',
  )
  const expandedTypePattern = new RegExp(
    `<([^>]+)>\\s+(?:a|<${escapeRegExp(`${RDF_NS}type`)}>)\\s+(?:solid:TypeRegistration|<${escapeRegExp(`${SOLID_NS}TypeRegistration`)}>)\\s*[.;]`,
    'g',
  )
  const rows: SolidTypeIndexRegistration[] = []
  const seenRegistrationUris = new Set<string>()
  const appendRegistration = (registrationRef: string, block: string) => {
    const forClass = readFirstIri(block, 'solid', 'forClass', input.typeIndexUri)
    if (forClass !== input.forClass) return
    const registrationUri = resolveIri(registrationRef, input.typeIndexUri as string)
    if (seenRegistrationUris.has(registrationUri)) return
    seenRegistrationUris.add(registrationUri)
    rows.push({
      source: input.source,
      registrationUri,
      forClass,
      instance: readFirstIri(block, 'solid', 'instance', input.typeIndexUri),
      instanceContainer: readFirstIri(block, 'solid', 'instanceContainer', input.typeIndexUri),
    })
  }

  for (const match of input.typeIndexTurtle.matchAll(registrationPattern)) {
    const registrationRef = match[1] ?? ''
    const block = match[2] ?? ''
    appendRegistration(registrationRef, block)
  }

  for (const match of input.typeIndexTurtle.matchAll(expandedTypePattern)) {
    const registrationRef = match[1] ?? ''
    const subjectToken = `<${registrationRef}>`
    const expandedBlock = input.typeIndexTurtle
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith(subjectToken))
      .map((line) => line.slice(subjectToken.length).trim())
      .join('\n')
    appendRegistration(registrationRef, expandedBlock)
  }
  return rows
}

export function discoverSolidTypeIndexRegistrations(input: SolidTypeIndexDiscoveryInput): SolidTypeIndexDiscoveryResult {
  const profileUri = stripFragment(input.webId)
  const publicTypeIndexUri = readFirstIri(input.profileTurtle, 'solid', 'publicTypeIndex', profileUri)
  const preferencesFileUri = readFirstIri(input.profileTurtle, 'pim', 'preferencesFile', profileUri)
  const privateTypeIndexUri = preferencesFileUri && input.preferencesTurtle
    ? readFirstIri(input.preferencesTurtle, 'solid', 'privateTypeIndex', preferencesFileUri)
    : null

  return {
    publicTypeIndexUri,
    privateTypeIndexUri,
    public: parseTypeIndexRegistrations({
      source: 'public',
      typeIndexUri: publicTypeIndexUri,
      typeIndexTurtle: input.publicTypeIndexTurtle,
      forClass: input.forClass,
    }),
    private: parseTypeIndexRegistrations({
      source: 'private',
      typeIndexUri: privateTypeIndexUri,
      typeIndexTurtle: input.privateTypeIndexTurtle,
      forClass: input.forClass,
    }),
  }
}

async function readOptionalResourceText(
  readResourceText: (uri: string) => Promise<string | null>,
  uri: string | null,
): Promise<string | null> {
  if (!uri) return null
  try {
    return await readResourceText(uri)
  } catch {
    return null
  }
}

export async function discoverSolidTypeIndexRegistrationsFromWebId(
  input: SolidTypeIndexDiscoveryFromWebIdInput,
): Promise<SolidTypeIndexDiscoveryResult> {
  const profileUri = stripFragment(input.webId)
  const profileTurtle = await readOptionalResourceText(input.readResourceText, profileUri)
  if (!profileTurtle) {
    return {
      publicTypeIndexUri: null,
      privateTypeIndexUri: null,
      public: [],
      private: [],
    }
  }

  const publicTypeIndexUri = readFirstIri(profileTurtle, 'solid', 'publicTypeIndex', profileUri)
  const preferencesFileUri = readFirstIri(profileTurtle, 'pim', 'preferencesFile', profileUri)
  const [publicTypeIndexTurtle, preferencesTurtle] = await Promise.all([
    readOptionalResourceText(input.readResourceText, publicTypeIndexUri),
    readOptionalResourceText(input.readResourceText, preferencesFileUri),
  ])
  const privateTypeIndexUri = preferencesTurtle
    ? readFirstIri(preferencesTurtle, 'solid', 'privateTypeIndex', preferencesFileUri)
    : null
  const privateTypeIndexTurtle = await readOptionalResourceText(input.readResourceText, privateTypeIndexUri)

  return discoverSolidTypeIndexRegistrations({
    webId: input.webId,
    forClass: input.forClass,
    profileTurtle,
    publicTypeIndexTurtle,
    preferencesTurtle,
    privateTypeIndexTurtle,
    localVocabUri: input.localVocabUri,
  })
}
