import type { SolidProfileRow } from "./profile.schema.js";
import { profileRepository, type SolidProfileIdentity } from "./profile.repository.js";
export {
  pickSolidProfileDisplayName,
  profileRepository,
  type SolidProfileIdentity,
} from "./profile.repository.js";

type NodeRequire = (id: string) => unknown;

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
  await applySolidProfileComunicaPatches();

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

export async function applySolidProfileComunicaPatches(requireModule?: NodeRequire): Promise<boolean> {
  const resolvedRequire = requireModule ?? await createNodeRequire();
  if (!resolvedRequire) {
    return false;
  }

  return [
    "@comunica/actor-query-result-serialize-sparql-json",
    "@comunica/actor-query-result-serialize-stats",
    "@comunica/query-sparql-solid/node_modules/@comunica/actor-query-result-serialize-sparql-json",
    "@comunica/query-sparql-solid/node_modules/@comunica/actor-query-result-serialize-stats",
  ].map((moduleName) => patchActionObserverHttp(resolvedRequire, moduleName)).some(Boolean);
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

async function createNodeRequire(): Promise<NodeRequire | null> {
  if (typeof process === 'undefined') {
    return null;
  }

  try {
    const moduleLib = await import("node:module");
    if (typeof moduleLib.createRequire !== 'function') {
      return null;
    }
    return moduleLib.createRequire(import.meta.url) as NodeRequire;
  } catch {
    return null;
  }
}

function patchActionObserverHttp(requireModule: NodeRequire, moduleName: string): boolean {
  try {
    const module = requireModule(moduleName) as {
      ActionObserverHttp?: {
        prototype?: {
          onRun?: (actor: unknown, action: unknown, output: unknown) => unknown;
          __linxObservedActorsPatchApplied?: boolean;
        };
      };
    };
    const prototype = module.ActionObserverHttp?.prototype;
    const originalOnRun = prototype?.onRun;
    if (!prototype || typeof originalOnRun !== 'function') {
      return false;
    }
    if (prototype.__linxObservedActorsPatchApplied) {
      return true;
    }

    prototype.onRun = function patchedActionObserverOnRun(
      this: { observedActors?: unknown },
      actor: unknown,
      action: unknown,
      output: unknown,
    ) {
      if (!Array.isArray(this.observedActors)) {
        this.observedActors = [];
      }
      return originalOnRun.call(this, actor, action, output);
    };
    prototype.__linxObservedActorsPatchApplied = true;
    return true;
  } catch {
    return false;
  }
}
