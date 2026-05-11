import * as fs from 'fs';
import * as path from 'path';

export interface RendererTargetOptions {
  appIsPackaged: boolean;
  desktopDir: string;
  cwd?: string;
  resourcesPath?: string;
  env?: NodeJS.ProcessEnv;
  existsSync?: (filePath: string) => boolean;
}

export type RendererTarget =
  | { kind: 'url'; target: string }
  | { kind: 'file'; target: string };

export function resolveRendererTarget(options: RendererTargetOptions): RendererTarget {
  const env = options.env ?? process.env;

  if (env.LINX_DESKTOP_WEB_URL) {
    return {
      kind: 'url',
      target: env.LINX_DESKTOP_WEB_URL,
    };
  }

  if (env.VITE_DEV_SERVER_URL) {
    return {
      kind: 'url',
      target: env.VITE_DEV_SERVER_URL,
    };
  }

  const fileTarget = resolveRendererFileTarget(options);
  if (fileTarget) {
    return {
      kind: 'file',
      target: fileTarget,
    };
  }

  const checkedCandidates = getRendererFileCandidates(options).join(', ');
  if (!options.appIsPackaged) {
    throw new Error(
      `Unable to locate desktop web build. Checked: ${checkedCandidates}. ` +
      'Run `yarn workspace @linx/desktop build` first, or set LINX_DESKTOP_WEB_URL explicitly.'
    );
  }

  throw new Error(`Unable to locate packaged web entry. Checked: ${checkedCandidates}`);
}

export function resolveRendererFileTarget(options: RendererTargetOptions): string | null {
  const existsSync = options.existsSync ?? fs.existsSync;
  return getRendererFileCandidates(options).find(candidate => existsSync(candidate)) ?? null;
}

function getRendererFileCandidates(options: RendererTargetOptions): string[] {
  const desktopDir = path.resolve(options.desktopDir);
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const candidates: string[] = [];

  if (options.resourcesPath) {
    candidates.push(path.join(options.resourcesPath, 'web', 'index.html'));
  }

  candidates.push(
    path.resolve(desktopDir, '../../web/dist-desktop/index.html'),
    path.resolve(desktopDir, '../../../web/dist-desktop/index.html'),
    path.resolve(desktopDir, '../../../../apps/web/dist-desktop/index.html'),
    path.resolve(cwd, '../web/dist-desktop/index.html'),
    path.resolve(cwd, '../../apps/web/dist-desktop/index.html'),
    path.resolve(cwd, 'apps/web/dist-desktop/index.html'),
    path.resolve(desktopDir, '../../web/dist/index.html'),
    path.resolve(desktopDir, '../../../web/dist/index.html'),
    path.resolve(desktopDir, '../../../../apps/web/dist/index.html'),
    path.resolve(cwd, '../web/dist/index.html'),
    path.resolve(cwd, '../../apps/web/dist/index.html'),
    path.resolve(cwd, 'apps/web/dist/index.html')
  );

  return Array.from(new Set(candidates));
}
