import type { SolidProfileRow } from "./profile.schema.js";
import { pickSolidProfileDisplayName, profileRepository, type SolidProfileIdentity } from "./profile.repository.js";
import { FOAF, VCARD } from "./namespaces.js";
import { extractProfileUsernameFromWebId } from "./client/index.js";
import { Parser as N3Parser } from "n3";
import { applySolidComunicaPatches } from "./comunica-patches.js";
export {
  pickSolidProfileDisplayName,
  profileRepository,
  type SolidProfileIdentity,
} from "./profile.repository.js";

type RdfQuad = {
  subject: { value?: string };
  predicate: { value?: string };
  object: { value?: string; termType?: string };
};
type N3ParserConstructor = new (options?: { baseIRI?: string }) => {
  parse(source: string): RdfQuad[];
};

export interface SolidProfileSessionLike {
  info?: {
    webId?: string;
  };
  fetch?: typeof fetch;
}

export interface SolidProfileReader<TTable = unknown> {
  findByIri(table: TTable, iri: string): Promise<unknown | null>;
}

export async function createSolidProfileDatabase(session: unknown): Promise<SolidProfileReader> {
  applySolidProfileComunicaPatches();

  const [{ drizzle }, { solidProfileTable }] = await Promise.all([
    import("@undefineds.co/drizzle-solid"),
    import("./profile.schema.js"),
  ]);

  return drizzle(session as never, {
    logger: false,
    disableInteropDiscovery: true,
    schema: { solidProfileTable },
  }) as SolidProfileReader;
}

export function applySolidProfileComunicaPatches(): boolean {
  return applySolidComunicaPatches();
}

export async function resolveSolidProfile(
  db: SolidProfileReader,
  webId: string,
): Promise<SolidProfileRow | null> {
  return await profileRepository.findByWebId(db, webId);
}

export async function resolveSolidProfileWithTable<TTable>(
  db: SolidProfileReader<TTable>,
  webId: string,
  table: TTable,
): Promise<SolidProfileRow | null> {
  if (!webId.trim()) {
    return null;
  }
  return await db.findByIri(table, webId) as SolidProfileRow | null;
}

export async function resolveSolidProfileDisplayName(
  db: SolidProfileReader,
  webId: string,
): Promise<string | null> {
  return await profileRepository.resolveDisplayName(db, webId);
}

export async function resolveSolidProfileIdentityWithReader(
  db: SolidProfileReader,
  webId: string,
): Promise<SolidProfileIdentity | null> {
  return await profileRepository.resolveIdentity(db, webId);
}

export async function resolveSolidProfileIdentityFromWebIdDocument(
  session: SolidProfileSessionLike,
  options: { webId?: string } = {},
): Promise<SolidProfileIdentity | null> {
  const webId = options.webId ?? session.info?.webId;
  if (!webId?.trim() || typeof session.fetch !== 'function') {
    return null;
  }

  const profileDocumentUrl = stripHash(webId);
  const response = await session.fetch(profileDocumentUrl, {
    headers: {
      Accept: 'text/turtle, application/ld+json;q=0.9, text/n3;q=0.8, */*;q=0.1',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch WebID profile: ${response.status} ${response.statusText}`.trim());
  }

  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();
  if (!body.trim()) {
    return buildSolidProfileIdentity(webId, null);
  }

  const profile = await parseSolidProfileDocument(body, {
    contentType,
    profileDocumentUrl,
    webId,
  });
  return buildSolidProfileIdentity(webId, profile);
}

export async function resolveSolidProfileIdentity(
  session: SolidProfileSessionLike,
  options: { webId?: string } = {},
): Promise<SolidProfileIdentity | null> {
  const webId = options.webId ?? session.info?.webId;
  if (!webId?.trim()) {
    return null;
  }

  const db = await createSolidProfileDatabase(session);
  return resolveSolidProfileIdentityWithReader(db, webId);
}

export async function parseSolidProfileDocument(
  source: string,
  options: {
    contentType?: string;
    profileDocumentUrl: string;
    webId: string;
  },
): Promise<SolidProfileRow | null> {
  const contentType = options.contentType?.toLowerCase() ?? '';
  if (contentType.includes('application/ld+json') || source.trimStart().startsWith('{')) {
    return parseJsonLdProfileDocument(source, options.webId);
  }
  return await parseTurtleProfileDocument(source, options);
}

async function parseTurtleProfileDocument(
  source: string,
  options: {
    profileDocumentUrl: string;
    webId: string;
  },
): Promise<SolidProfileRow | null> {
  const Parser = N3Parser as N3ParserConstructor;
  const parser = new Parser({ baseIRI: options.profileDocumentUrl });
  const quads = parser.parse(source);
  return pickProfileFromQuads(quads, options.webId);
}

function parseJsonLdProfileDocument(source: string, webId: string): SolidProfileRow | null {
  try {
    const parsed = JSON.parse(source) as unknown;
    const nodes = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed['@graph'])
        ? parsed['@graph']
        : [parsed];
    const webIdNode = nodes.find((node) => isRecord(node) && node['@id'] === webId);
    const node = isRecord(webIdNode) ? webIdNode : nodes.find(isRecord);
    if (!node) {
      return null;
    }
    return normalizeProfileRow({
      id: webId,
      name: pickJsonLdString(node, VCARD.fn),
      nick: pickJsonLdString(node, FOAF.nick),
      avatar: pickJsonLdString(node, VCARD.hasPhoto),
      note: pickJsonLdString(node, VCARD.note),
      email: pickJsonLdString(node, VCARD.hasEmail),
      phone: pickJsonLdString(node, VCARD.hasTelephone),
      region: pickJsonLdString(node, VCARD.region),
      gender: pickJsonLdString(node, VCARD.hasGender),
    });
  } catch {
    return null;
  }
}

function pickProfileFromQuads(quads: RdfQuad[], webId: string): SolidProfileRow | null {
  const profile: Partial<SolidProfileRow> = { id: webId };
  for (const quad of quads) {
    if (quad.subject.value !== webId) {
      continue;
    }
    const predicate = quad.predicate.value;
    const value = quad.object.value;
    if (!predicate || !value) {
      continue;
    }
    if (predicate === VCARD.fn) profile.name = value;
    else if (predicate === FOAF.nick) profile.nick = value;
    else if (predicate === VCARD.hasPhoto) profile.avatar = value;
    else if (predicate === VCARD.note) profile.note = value;
    else if (predicate === VCARD.hasEmail) profile.email = value;
    else if (predicate === VCARD.hasTelephone) profile.phone = value;
    else if (predicate === VCARD.region) profile.region = value;
    else if (predicate === VCARD.hasGender) profile.gender = value;
  }
  return normalizeProfileRow(profile);
}

function buildSolidProfileIdentity(webId: string, profile: SolidProfileRow | null): SolidProfileIdentity {
  return {
    webId,
    profile,
    displayName: pickSolidProfileDisplayName(profile),
    username: extractProfileUsernameFromWebId(webId),
  };
}

function normalizeProfileRow(profile: Partial<SolidProfileRow>): SolidProfileRow | null {
  const normalized = Object.fromEntries(
    Object.entries(profile).filter(([, value]) => typeof value === 'string' && value.trim()),
  ) as Partial<SolidProfileRow>;
  return Object.keys(normalized).length > 1
    ? normalized as SolidProfileRow
    : null;
}

function pickJsonLdString(node: Record<string, unknown>, iri: string): string | undefined {
  return normalizeJsonLdValue(node[iri]);
}

function normalizeJsonLdValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeJsonLdValue).find(Boolean);
  }
  if (isRecord(value)) {
    return normalizeJsonLdValue(value['@value'] ?? value['@id']);
  }
  return undefined;
}

function stripHash(value: string): string {
  const index = value.indexOf('#');
  return index >= 0 ? value.slice(0, index) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
