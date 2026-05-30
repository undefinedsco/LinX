import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'node:child_process';

const XPOD_PACKAGE_NAME = '@undefineds.co/xpod';
const DEFAULT_MIN_BUN_VERSION = '1.3.0';
const DEFAULT_MIN_NODE_VERSION = '22.0.0';

export interface XpodLaunchResolutionOptions {
  appIsPackaged: boolean;
  desktopDir: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  resourcesPath?: string;
  existsSync?: (filePath: string) => boolean;
}

export interface XpodManagedRuntimeOptions extends XpodLaunchResolutionOptions {
  xpodRuntimeDir: string;
  defaultXpodVersion?: string;
  onProgress?: (progress: XpodLaunchProgress) => void;
  commandExistsSync?: (filePath: string) => boolean;
  mkdirSync?: (dirPath: string, options?: { recursive?: boolean }) => void;
  writeFileSync?: (filePath: string, content: string, encoding: BufferEncoding) => void;
  spawnSync?: typeof spawnSync;
  which?: (command: string, env: NodeJS.ProcessEnv) => string | null;
}

type CommandResolutionOptions = Pick<XpodLaunchResolutionOptions, 'env' | 'existsSync'> & {
  commandExistsSync?: (filePath: string) => boolean;
  spawnSync?: typeof spawnSync;
  which?: (command: string, env: NodeJS.ProcessEnv) => string | null;
};

export type XpodLaunchProgressPhase =
  | 'source'
  | 'version'
  | 'check-bun'
  | 'install-bun'
  | 'check-node'
  | 'install-npm'
  | 'runtime-ready'
  | 'embedded';

export interface XpodLaunchProgress {
  phase: XpodLaunchProgressPhase;
  label: string;
  detail?: string | null;
}

export interface XpodLaunchTarget {
  kind:
    | 'dev-source'
    | 'dev-dist'
    | 'managed-bun-package'
    | 'managed-node-package'
    | 'single-file'
    | 'package-bin';
  rootDir: string;
  entryPath: string;
  runtimeBinary?: string;
  runtimeVersion?: string;
}

export function resolveXpodLaunchTarget(options: XpodLaunchResolutionOptions): XpodLaunchTarget {
  const sourceTarget = resolveXpodSourceTarget(options);
  if (sourceTarget) {
    return sourceTarget;
  }

  return resolveEmbeddedOrInstalledPackageTarget(options);
}

export async function resolveManagedXpodLaunchTarget(
  options: XpodManagedRuntimeOptions,
): Promise<XpodLaunchTarget> {
  const sourceTarget = resolveXpodSourceTarget(options);
  if (sourceTarget) {
    reportProgress(options, {
      phase: 'source',
      label: '使用本地 xpod 源码',
      detail: sourceTarget.rootDir,
    });
    return sourceTarget;
  }

  const runtimeVersion = resolveXpodRuntimeVersion(options);
  reportProgress(options, {
    phase: 'version',
    label: '准备 xpod runtime',
    detail: `${XPOD_PACKAGE_NAME}@${runtimeVersion}`,
  });
  const managedErrors: Error[] = [];

  reportProgress(options, {
    phase: 'check-bun',
    label: '检查 Bun 运行环境',
    detail: `需要 Bun >= ${resolveMinBunVersion(options.env ?? process.env)}`,
  });
  const bunCandidate = detectBunRuntime(options);
  if (bunCandidate) {
    reportProgress(options, {
      phase: 'check-bun',
      label: `检测到 Bun ${bunCandidate.version}`,
      detail: bunCandidate.binary,
    });
    try {
      return ensureManagedPackageTarget({
        ...options,
        kind: 'managed-bun-package',
        packageManager: 'bun',
        runtimeBinary: bunCandidate.binary,
        runtimeVersion,
      });
    } catch (error) {
      managedErrors.push(asError(error));
      reportProgress(options, {
        phase: 'check-node',
        label: 'Bun xpod runtime 不可用',
        detail: asError(error).message,
      });
    }
  }

  reportProgress(options, {
    phase: 'check-node',
    label: '检查 Node/npm 运行环境',
    detail: `Bun 不可用，回退到 Node >= ${resolveMinNodeVersion(options.env ?? process.env)}`,
  });
  const nodeCandidate = detectNodeRuntime(options);
  if (nodeCandidate) {
    reportProgress(options, {
      phase: 'check-node',
      label: `检测到 Node ${nodeCandidate.nodeVersion}`,
      detail: nodeCandidate.nodeBinary,
    });
    try {
      return ensureManagedPackageTarget({
        ...options,
        kind: 'managed-node-package',
        packageManager: 'npm',
        runtimeBinary: nodeCandidate.nodeBinary,
        runtimeVersion,
      });
    } catch (error) {
      managedErrors.push(asError(error));
      reportProgress(options, {
        phase: 'embedded',
        label: 'Node/npm xpod runtime 不可用',
        detail: asError(error).message,
      });
    }
  }

  reportProgress(options, {
    phase: 'embedded',
    label: '使用内置 xpod runtime',
    detail: managedErrors.length > 0
      ? '按需 runtime 不可用，回退到随包内置 runtime'
      : '未检测到可用 Bun 或 Node/npm',
  });
  try {
    return resolveEmbeddedOrInstalledPackageTarget(options);
  } catch (error) {
    if (managedErrors.length === 0) {
      throw error;
    }
    throw new Error([
      'Unable to prepare xpod runtime.',
      ...managedErrors.map((item) => item.message),
      asError(error).message,
    ].join('\n'));
  }
}

export function resolveXpodRuntimeVersion(
  options: Pick<XpodLaunchResolutionOptions, 'cwd' | 'env' | 'desktopDir'> & { defaultXpodVersion?: string },
): string {
  const env = options.env ?? process.env;
  const explicitVersion = env.LINX_XPOD_VERSION?.trim();
  if (explicitVersion) {
    return explicitVersion;
  }

  if ('defaultXpodVersion' in options && isExactSemver(String(options.defaultXpodVersion ?? ''))) {
    return String(options.defaultXpodVersion);
  }

  const candidates = [
    path.resolve(options.cwd ?? process.cwd(), 'package.json'),
    path.resolve(options.cwd ?? process.cwd(), '../../package.json'),
    path.resolve(options.desktopDir, '../../../../package.json'),
    path.resolve(options.desktopDir, '../../package.json'),
  ];

  for (const candidate of candidates) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(candidate, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
      const version = packageJson.dependencies?.[XPOD_PACKAGE_NAME]
        ?? packageJson.optionalDependencies?.[XPOD_PACKAGE_NAME]
        ?? packageJson.devDependencies?.[XPOD_PACKAGE_NAME];
      if (version && isExactSemver(version)) {
        return version;
      }
    } catch {
      // Try the next package.json candidate.
    }
  }

  throw new Error('Unable to determine exact @undefineds.co/xpod version for managed runtime.');
}

function resolveXpodSourceTarget(options: XpodLaunchResolutionOptions): XpodLaunchTarget | null {
  const existsSync = options.existsSync ?? fs.existsSync;
  const sourceRoot = resolveXpodSourceRoot(options);
  if (options.appIsPackaged || !sourceRoot) {
    return null;
  }

  assertXpodLoginRuntimeCapabilities(sourceRoot, existsSync);

  if (shouldPreferSourceRuntime(sourceRoot)) {
    const runtimeBinary = detectBunRuntime(options)?.binary ?? resolveBunRuntimeBinary(options);
    return {
      kind: 'dev-source',
      rootDir: sourceRoot,
      entryPath: path.join(sourceRoot, 'src', 'main.ts'),
      ...(runtimeBinary ? { runtimeBinary } : {}),
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

  const runtimeBinary = detectBunRuntime(options)?.binary ?? resolveBunRuntimeBinary(options);
  return {
    kind: 'dev-source',
    rootDir: sourceRoot,
    entryPath: path.join(sourceRoot, 'src', 'main.ts'),
    ...(runtimeBinary ? { runtimeBinary } : {}),
  };
}

function resolveEmbeddedOrInstalledPackageTarget(options: XpodLaunchResolutionOptions): XpodLaunchTarget {
  const existsSync = options.existsSync ?? fs.existsSync;
  const rootDir = resolveXpodPackageRoot(options);

  const singleFileCandidates = [
    path.join(rootDir, 'dist', 'xpod-single.cjs'),
    path.join(rootDir, 'dist', 'xpod.single.cjs'),
  ];

  const singleFile = singleFileCandidates.find(candidate => existsSync(candidate));
  if (singleFile) {
    assertXpodLoginRuntimeCapabilities(rootDir, existsSync);
    return {
      kind: 'single-file',
      rootDir,
      entryPath: singleFile,
    };
  }

  const packageBin = path.join(rootDir, 'bin', 'xpod.js');
  if (existsSync(packageBin)) {
    assertXpodLoginRuntimeCapabilities(rootDir, existsSync);
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
    candidates.push(path.dirname(require.resolve(`${XPOD_PACKAGE_NAME}/package.json`)));
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

function detectBunRuntime(options: CommandResolutionOptions): { binary: string; version: string } | null {
  const env = options.env ?? process.env;
  const minVersion = resolveMinBunVersion(env);
  for (const binary of resolveBunRuntimeBinaryCandidates(options)) {
    const version = readCommandVersion(binary, ['--version'], options);
    if (version && compareSemver(version, minVersion) >= 0) {
      return { binary, version };
    }
  }

  return null;
}

export function resolveBunRuntimeBinary(options: CommandResolutionOptions): string | null {
  return resolveBunRuntimeBinaryCandidates(options)[0] ?? null;
}

function resolveBunRuntimeBinaryCandidates(options: CommandResolutionOptions): string[] {
  const env = options.env ?? process.env;
  const explicit = env.LINX_BUN_BINARY ?? env.LINX_XPOD_BUN_BINARY;
  if (explicit) {
    const explicitBinary = resolveCommand(explicit, options);
    return explicitBinary ? [explicitBinary] : [];
  }

  return Array.from(new Set([
    resolveCommand('bun', options),
    ...getKnownBunBinaryCandidates(env),
  ].filter((candidate): candidate is string => Boolean(candidate))))
    .filter((candidate) => (options.commandExistsSync ?? options.existsSync ?? fs.existsSync)(candidate));
}

function detectNodeRuntime(options: XpodManagedRuntimeOptions): { nodeBinary: string; nodeVersion: string; npmBinary: string } | null {
  const env = options.env ?? process.env;
  const nodeBinary = resolveCommand(env.XPOD_NODE_BINARY ?? env.LINX_NODE_BINARY ?? 'node', options);
  if (!nodeBinary) {
    return null;
  }

  const npmBinary = resolveCommand(env.LINX_NPM_BINARY ?? 'npm', options);
  if (!npmBinary) {
    return null;
  }

  const version = readCommandVersion(nodeBinary, ['--version'], options);
  const minVersion = resolveMinNodeVersion(env);
  if (!version || compareSemver(version, minVersion) < 0) {
    return null;
  }

  return { nodeBinary, nodeVersion: version, npmBinary };
}

function ensureManagedPackageTarget(options: XpodManagedRuntimeOptions & {
  kind: 'managed-bun-package' | 'managed-node-package';
  packageManager: 'bun' | 'npm';
  runtimeBinary: string;
  runtimeVersion: string;
}): XpodLaunchTarget {
  const existsSync = options.existsSync ?? fs.existsSync;
  const mkdirSync = options.mkdirSync ?? fs.mkdirSync;
  const writeFileSync = options.writeFileSync ?? fs.writeFileSync;
  const rootDir = path.join(options.xpodRuntimeDir, options.runtimeVersion, options.packageManager);
  const entryPath = path.join(rootDir, 'node_modules', '@undefineds.co', 'xpod', 'bin', 'xpod.js');

  if (!existsSync(entryPath)) {
    reportProgress(options, {
      phase: options.packageManager === 'bun' ? 'install-bun' : 'install-npm',
      label: '下载 xpod runtime',
      detail: `${XPOD_PACKAGE_NAME}@${options.runtimeVersion}`,
    });
    mkdirSync(rootDir, { recursive: true });
    writeFileSync(
      path.join(rootDir, 'package.json'),
      `${JSON.stringify({
        private: true,
        name: '@linx/xpod-runtime-cache',
        dependencies: {
          [XPOD_PACKAGE_NAME]: options.runtimeVersion,
        },
      }, null, 2)}\n`,
      'utf-8',
    );

    installManagedPackage(rootDir, options);
  }

  if (!existsSync(entryPath)) {
    throw new Error(`Managed xpod install did not create ${entryPath}`);
  }

  assertXpodLoginRuntimeCapabilities(
    path.join(rootDir, 'node_modules', '@undefineds.co', 'xpod'),
    existsSync,
  );

  reportProgress(options, {
    phase: 'runtime-ready',
    label: 'xpod runtime 已就绪',
    detail: `${options.packageManager} · ${options.runtimeVersion}`,
  });

  return {
    kind: options.kind,
    rootDir,
    entryPath,
    runtimeBinary: options.runtimeBinary,
    runtimeVersion: options.runtimeVersion,
  };
}

function installManagedPackage(
  rootDir: string,
  options: XpodManagedRuntimeOptions & {
    packageManager: 'bun' | 'npm';
    runtimeBinary: string;
    runtimeVersion: string;
  },
): void {
  const spawn = options.spawnSync ?? spawnSync;
  const env = {
    ...process.env,
    ...(options.env ?? {}),
  };

  const result = options.packageManager === 'bun'
    ? spawn(
        options.runtimeBinary,
        [
          'install',
          '--production',
          '--omit=optional',
          '--no-progress',
        ],
        {
          cwd: rootDir,
          env,
          encoding: 'utf-8',
        },
      )
    : spawn(
        resolveCommand((options.env ?? process.env).LINX_NPM_BINARY ?? 'npm', options) ?? 'npm',
        [
          'install',
          '--omit=dev',
          '--omit=optional',
          '--no-audit',
          '--no-fund',
        ],
        {
          cwd: rootDir,
          env,
          encoding: 'utf-8',
        },
      );

  if (result.status !== 0) {
    const output = [result.stderr, result.stdout]
      .filter(Boolean)
      .join('\n')
      .trim();
    throw new Error(`Unable to install ${XPOD_PACKAGE_NAME}@${options.runtimeVersion} with ${options.packageManager}.${output ? `\n${output}` : ''}`);
  }
}

function reportProgress(options: XpodManagedRuntimeOptions, progress: XpodLaunchProgress): void {
  options.onProgress?.(progress);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function resolveMinBunVersion(env: NodeJS.ProcessEnv): string {
  return env.LINX_MIN_BUN_VERSION?.trim() || DEFAULT_MIN_BUN_VERSION;
}

function resolveMinNodeVersion(env: NodeJS.ProcessEnv): string {
  return env.LINX_MIN_NODE_VERSION?.trim() || DEFAULT_MIN_NODE_VERSION;
}

function resolveCommand(command: string, options: CommandResolutionOptions): string | null {
  if (path.isAbsolute(command)) {
    const existsSync = options.commandExistsSync ?? options.existsSync ?? fs.existsSync;
    return existsSync(command) ? command : null;
  }

  if (options.which) {
    return options.which(command, options.env ?? process.env);
  }

  return findOnPath(command, options.env ?? process.env, options.commandExistsSync ?? fs.existsSync);
}

function getKnownBunBinaryCandidates(env: NodeJS.ProcessEnv): string[] {
  const candidates: string[] = [];
  const home = env.HOME;
  const bunInstall = env.BUN_INSTALL;
  const nvmDir = env.NVM_DIR ?? (home ? path.join(home, '.nvm') : undefined);

  if (env.NVM_BIN) {
    candidates.push(path.join(env.NVM_BIN, 'bun'));
  }

  if (nvmDir) {
    candidates.push(...getNvmBunBinaryCandidates(nvmDir));
  }

  if (bunInstall) {
    candidates.push(path.join(bunInstall, 'bin', 'bun'));
  }

  if (home) {
    candidates.push(path.join(home, '.bun', 'bin', 'bun'));
  }

  candidates.push('/opt/homebrew/bin/bun', '/usr/local/bin/bun');

  return Array.from(new Set(candidates));
}

function getNvmBunBinaryCandidates(nvmDir: string): string[] {
  const nodeVersionsDir = path.join(nvmDir, 'versions', 'node');
  let entries: string[];
  try {
    entries = fs.readdirSync(nodeVersionsDir);
  } catch {
    return [];
  }

  return entries
    .filter((entry) => /^v?\d+\.\d+\.\d+/.test(entry))
    .sort((left, right) => compareSemver(right.replace(/^v/, ''), left.replace(/^v/, '')))
    .map((entry) => path.join(nodeVersionsDir, entry, 'bin', 'bun'));
}

function findOnPath(
  command: string,
  env: NodeJS.ProcessEnv,
  existsSync: (filePath: string) => boolean,
): string | null {
  const pathValue = env.PATH ?? process.env.PATH ?? '';
  const extensions = process.platform === 'win32'
    ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];

  for (const entry of pathValue.split(path.delimiter)) {
    if (!entry) {
      continue;
    }

    for (const extension of extensions) {
      const candidate = path.join(entry, `${command}${extension}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function readCommandVersion(
  command: string,
  args: string[],
  options: CommandResolutionOptions,
): string | null {
  const spawn = options.spawnSync ?? spawnSync;
  const result = spawn(command, args, {
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    return null;
  }

  const raw = String(result.stdout || result.stderr || '').trim().replace(/^v/i, '');
  const match = raw.match(/\d+\.\d+\.\d+/);
  return match?.[0] ?? null;
}

function isExactSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
}

function compareSemver(left: string, right: string): number {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }

  return 0;
}

function parseSemver(version: string): [number, number, number] {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return [0, 0, 0];
  }

  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
}

function shouldPreferSourceRuntime(sourceRoot: string): boolean {
  return path.basename(sourceRoot) === 'xpod';
}

function assertXpodLoginRuntimeCapabilities(
  rootDir: string,
  existsSync: (filePath: string) => boolean,
): void {
  const hasScopedPickWebIdHandler =
    existsSync(path.join(rootDir, 'src', 'identity', 'oidc', 'ScopedPickWebIdHandler.ts'))
    || existsSync(path.join(rootDir, 'dist', 'identity', 'oidc', 'ScopedPickWebIdHandler.js'));
  const hasScopedPickerConfig = existsSync(path.join(rootDir, 'config', 'xpod.base.json'));

  if (hasScopedPickWebIdHandler && hasScopedPickerConfig) {
    return;
  }

  throw new Error([
    `xpod runtime at ${rootDir} does not include scoped WebID selection.`,
    'Local login would be able to expose Cloud Pods from the same IdP account.',
    'Use a current xpod checkout via LINX_XPOD_ROOT or install an @undefineds.co/xpod version that contains ScopedPickWebIdHandler.',
  ].join('\n'));
}
