import type { XpodStatus } from './xpod-manager';

export type TrayTone = 'running' | 'starting' | 'stopped' | 'error';

export interface TrayPresentation {
  tone: TrayTone;
  tooltip: string;
  statusLabel: string;
}

export function getTrayPresentation(status: XpodStatus): TrayPresentation {
  const tone = resolveTone(status);
  const portText = status.port ? ` · ${status.port}` : '';

  switch (tone) {
    case 'running':
      return {
        tone,
        tooltip: `LinX · Pod 运行中${portText}`,
        statusLabel: `Pod 运行中${portText}`,
      };
    case 'starting':
      return {
        tone,
        tooltip: `LinX · Pod 启动中${portText}`,
        statusLabel: `Pod 启动中${portText}`,
      };
    case 'error':
      return {
        tone,
        tooltip: 'LinX · Pod 异常',
        statusLabel: 'Pod 异常',
      };
    default:
      return {
        tone,
        tooltip: 'LinX · Pod 已停止',
        statusLabel: 'Pod 已停止',
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
