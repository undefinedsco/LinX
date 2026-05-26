import type { XpodStatus } from './xpod-manager';

export type TrayTone = 'running' | 'starting' | 'stopped' | 'error';

export interface TrayPresentation {
  tone: TrayTone;
  title: string;
  tooltip: string;
  statusLabel: string;
}

export function getTrayPresentation(status: XpodStatus): TrayPresentation {
  const tone = resolveTone(status);
  const portText = status.port ? ` · ${status.port}` : '';
  const titleSuffix = resolveTitleSuffix(tone);

  switch (tone) {
    case 'running':
      return {
        tone,
        title: `xpod ${titleSuffix}`,
        tooltip: `xpod · 运行${portText}`,
        statusLabel: `xpod 运行${portText}`,
      };
    case 'starting':
      return {
        tone,
        title: `xpod ${titleSuffix}`,
        tooltip: `xpod · 启动${portText}`,
        statusLabel: `xpod 启动${portText}`,
      };
    case 'error':
      return {
        tone,
        title: `xpod ${titleSuffix}`,
        tooltip: 'xpod · 异常',
        statusLabel: 'xpod 异常',
      };
    default:
      return {
        tone,
        title: `xpod ${titleSuffix}`,
        tooltip: 'xpod · 停止',
        statusLabel: 'xpod 停止',
      };
  }
}

function resolveTone(status: XpodStatus): TrayTone {
  if (status.status === 'error') {
    return 'error';
  }
  if (status.running) {
    return 'running';
  }
  if (status.status === 'starting') {
    return 'starting';
  }
  return 'stopped';
}

function resolveTitleSuffix(tone: TrayTone): string {
  switch (tone) {
    case 'running':
      return '●';
    case 'starting':
      return '◐';
    case 'error':
      return '!';
    default:
      return '○';
  }
}
