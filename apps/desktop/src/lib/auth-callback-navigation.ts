import { isDesktopAuthCallbackUrl } from './auth-protocol';

interface PreventableNavigationEvent {
  preventDefault(): void;
}

interface AuthCallbackNavigationTarget {
  on(
    event: 'will-navigate' | 'will-redirect',
    listener: (event: PreventableNavigationEvent, url: string) => void,
  ): unknown;
}

export function installAuthCallbackNavigationInterceptor(
  target: AuthCallbackNavigationTarget,
  onCallbackUrl: (url: string) => void,
): void {
  let consumed = false;

  const handleNavigation = (event: PreventableNavigationEvent, url: string): void => {
    if (!isDesktopAuthCallbackUrl(url)) {
      return;
    }

    event.preventDefault();
    if (consumed) {
      return;
    }

    consumed = true;
    onCallbackUrl(url);
  };

  target.on('will-navigate', handleNavigation);
  target.on('will-redirect', handleNavigation);
}
