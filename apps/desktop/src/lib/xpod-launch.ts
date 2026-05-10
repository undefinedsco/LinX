import * as fs from 'fs';
import * as path from 'path';

export interface XpodLaunchResolutionOptions {
  appIsPackaged: boolean;
  desktopDir: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  resourcesPath?: string;
  existsSync?: (filePath: string) => boolean;
}

export interface XpodLaunchTarget {
  kind: 'dev-source' | 'dev-dist' | 'single-file' | 'package-bin';
  rootDir: string;
  entryPath: string;
}

export function resolveXpodLaunchTarget(options: XpodLaunchResolutionOptions): XpodLaunchTarget {
  const existsSync = options.existsSync ?? fs.existsSync;
  const sourceRoot = resolveXpodSourceRoot(options);
  if (!options.appIsPackaged && sourceRoot) {
    if (shouldPreferSourceRuntime(sourceRoot)) {
      return {
        kind: 'dev-source',
        rootDir: sourceRoot,
        entryPath: path.join(sourceRoot, 'src', 'main.ts'),
      };
    }

    const distEntry = path.join(sourceRoot, 'dist', 'main.js');
    if (existsSync(distEntry)) {
      return {
        kind: 'dev-dist',
        rootDir: sourceRoot,
        entryPath: distEntry,
      };
    }

    return {
      kind: 'dev-source',
      rootDir: sourceRoot,
      entryPath: path.join(sourceRoot, 'src', 'main.ts'),
    };
  }

  const rootDir = resolveXpodPackageRoot(options);

  const singleFileCandidates = [
    path.join(rootDir, 'dist', 'xpod-single.cjs'),
    path.join(rootDir, 'dist', 'xpod.single.cjs'),
  ];

  const singleFile = singleFileCandidates.find(candidate => existsSync(candidate));
  if (singleFile) {
    return {
      kind: 'single-file',
      rootDir,
      entryPath: singleFile,
    };
  }

  const packageBin = path.join(rootDir, 'bin', 'xpod.js');
  if (existsSync(packageBin)) {
    return {
      kind: 'package-bin',
      rootDir,
      entryPath: packageBin,
    };
  }

  throw new Error(`Unable to locate xpod executable under ${rootDir}`);
}

function resolveXpodSourceRoot(options: XpodLaunchResolutionOptions): string | null {
  const existsSync = options.existsSync ?? fs.existsSync;
  const env = options.env ?? process.env;

  if (env.LINX_XPOD_ROOT) {
    const explicitRoot = path.resolve(env.LINX_XPOD_ROOT);
    if (
      existsSync(path.join(explicitRoot, 'package.json'))
      && existsSync(path.join(explicitRoot, 'src', 'main.ts'))
    ) {
      return explicitRoot;
    }
  }

  if (env.LINX_XPOD_DEV_SOURCE === '0') {
    return null;
  }

  const candidates: string[] = [];

  const desktopDir = path.resolve(options.desktopDir);
  const cwd = path.resolve(options.cwd ?? process.cwd());

  candidates.push(
    path.resolve(cwd, '../xpod-cli'),
    path.resolve(cwd, '../../xpod-cli'),
    path.resolve(cwd, '../../../xpod-cli'),
    path.resolve(cwd, '.external/xpod-cli'),
    path.resolve(desktopDir, '../../../../xpod-cli'),
    path.resolve(desktopDir, '../../../../../xpod-cli'),
    path.resolve(cwd, '../xpod'),
    path.resolve(cwd, '../../xpod'),
    path.resolve(cwd, '../../../xpod'),
    path.resolve(desktopDir, '../../../../xpod'),
    path.resolve(desktopDir, '../../../../../xpod'),
  );

  const rootDir = candidates.find(candidate => (
    existsSync(path.join(candidate, 'package.json'))
    && existsSync(path.join(candidate, 'src', 'main.ts'))
  ));

  return rootDir ?? null;
}

function resolveXpodPackageRoot(options: XpodLaunchResolutionOptions): string {
  const existsSync = options.existsSync ?? fs.existsSync;
  const env = options.env ?? process.env;
  const candidates: string[] = [];

  if (env.LINX_XPOD_ROOT) {
    candidates.push(path.resolve(env.LINX_XPOD_ROOT));
  }

  try {
    candidates.push(path.dirname(require.resolve('@undefineds.co/xpod/package.json')));
  } catch {
    // Fall back to path probing below.
  }

  if (options.appIsPackaged && options.resourcesPath) {
    candidates.push(path.join(options.resourcesPath, 'xpod'));
  }

  const desktopDir = path.resolve(options.desktopDir);
  const cwd = path.resolve(options.cwd ?? process.cwd());

  candidates.push(
    path.resolve(desktopDir, '../../../node_modules/@undefineds.co/xpod'),
    path.resolve(desktopDir, '../../../../node_modules/@undefineds.co/xpod'),
    path.resolve(cwd, 'node_modules/@undefineds.co/xpod'),
    path.resolve(cwd, '../node_modules/@undefineds.co/xpod'),
    path.resolve(cwd, '../../node_modules/@undefineds.co/xpod')
  );

  const rootDir = candidates.find(candidate => existsSync(path.join(candidate, 'package.json')));
  if (rootDir) {
    return rootDir;
  }

  throw new Error(`Unable to locate xpod package. Checked: ${candidates.join(', ')}`);
}

function shouldPreferSourceRuntime(sourceRoot: string): boolean {
  return path.basename(sourceRoot) === 'xpod-cli';
}
