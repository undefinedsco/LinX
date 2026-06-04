import type { XpodStatus } from './xpod-manager';

export function getXpodDashboardUrl(status: Pick<XpodStatus, 'localUrl' | 'baseUrl'>): string | null {
  const baseUrl = status.localUrl ?? status.baseUrl;
  if (!baseUrl) {
    return null;
  }

  return new URL('dashboard/', ensureTrailingSlash(baseUrl)).toString();
}

export function formatXpodStatusDetail(status: XpodStatus): string {
  const statusText = status.running
    ? '运行中'
    : status.status === 'starting'
      ? '启动中'
      : '已停止';
  const lines = [
    `状态: ${statusText}`,
    `本机入口: ${status.localUrl || status.baseUrl ? '已准备' : '未准备'}`,
  ];

  lines.push(`外网入口: ${status.baseUrl && status.baseUrl !== status.localUrl ? '已配置' : '未配置'}`);

  return lines.join('\n');
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}
