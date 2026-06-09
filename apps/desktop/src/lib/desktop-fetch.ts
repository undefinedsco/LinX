type FetchInput = Parameters<typeof globalThis.fetch>[0];
type FetchInit = Parameters<typeof globalThis.fetch>[1];
type FetchResult = ReturnType<typeof globalThis.fetch>;

type ElectronNetLike = {
  fetch?: typeof globalThis.fetch;
};

type ElectronLike = {
  net?: ElectronNetLike;
};

function resolveElectronNetFetch(): typeof globalThis.fetch | null {
  try {
    // Keep this dynamic so node:test stubs can omit electron.net and still use
    // global.fetch. In Electron main, net.fetch avoids Node's undici socket path.
    const electron = require('electron') as ElectronLike;
    if (typeof electron.net?.fetch === 'function') {
      return electron.net.fetch.bind(electron.net) as typeof globalThis.fetch;
    }
  } catch {
    // Not running inside Electron.
  }

  return null;
}

export function desktopFetch(input: FetchInput, init?: FetchInit): FetchResult {
  const electronFetch = resolveElectronNetFetch();
  if (electronFetch) {
    return electronFetch(input, init);
  }

  return globalThis.fetch(input, init);
}
