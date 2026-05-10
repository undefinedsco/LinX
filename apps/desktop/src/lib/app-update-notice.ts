import type { AppUpdateStatus } from './app-updater';

export interface AppUpdateNotice {
  title: string;
  body: string;
}

export function shouldNotifyAppUpdate(
  lastNotifiedVersion: string | null,
  updateStatus: AppUpdateStatus,
): boolean {
  return Boolean(
    updateStatus.available
      && updateStatus.latestVersion
      && updateStatus.latestVersion !== lastNotifiedVersion,
  );
}

export function createAppUpdateNotice(updateStatus: AppUpdateStatus): AppUpdateNotice | null {
  if (!updateStatus.available || !updateStatus.latestVersion) {
    return null;
  }

  return {
    title: 'LinX 有新版本可用',
    body: `当前 ${updateStatus.currentVersion}，最新 ${updateStatus.latestVersion}`,
  };
}
