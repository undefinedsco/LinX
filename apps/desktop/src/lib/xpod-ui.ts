import type { XpodStatus } from './xpod-manager';

export function getXpodDashboardUrl(status: Pick<XpodStatus, 'localUrl' | 'baseUrl'>): string | null {
  const baseUrl = status.localUrl ?? status.baseUrl;
  if (!baseUrl) {
    return null;
  }

  return new URL('dashboard/', ensureTrailingSlash(baseUrl)).toString();
}

export function formatXpodStatusDetail(status: XpodStatus): string {
  const lines = [
    `状态: ${status.status ?? (status.running ? 'running' : 'stopped')}`,
    `运行中: ${status.running ? '是' : '否'}`,
  ];

  if (status.providerId) {
    lines.push(`Provider: ${status.providerId}`);
  }
  if (status.pid) {
    lines.push(`PID: ${status.pid}`);
  }
  if (status.port) {
    lines.push(`端口: ${status.port}`);
  }
  if (status.localUrl) {
    lines.push(`本地地址: ${status.localUrl}`);
  }
  if (status.baseUrl && status.baseUrl !== status.localUrl) {
    lines.push(`公开地址: ${status.baseUrl}`);
  }

  return lines.join('\n');
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}
