import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@inrupt/solid-ui-react';
import { drizzle } from '@undefineds.co/drizzle-solid';
import {
  solidProfileTable,
  type SolidProfileRow
} from '@linx/models';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ProfileCard } from '../modules/profile/profile-card';

const DEFAULT_NATIVE_REDIRECT = 'linx://auth/callback';

const parseIssuerList = (): string[] => {
  const raw = process.env.NEXT_PUBLIC_SOLID_IDP_ISSUERS ?? '';
  const issuers = raw
    .split(',')
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (issuers.length > 0) return issuers;
  return ['https://lgnxxsoohipf.sealosgzg.site'];
};

const resolveSiteUrl = (): string | null => {
  const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envSiteUrl && envSiteUrl.trim().length > 0) {
    return envSiteUrl.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    if (protocol === 'http:' || protocol === 'https:') {
      return window.location.origin.replace(/\/$/, '');
    }
  }
  return null;
};

const IDP_OPTIONS = parseIssuerList();

const ensureRedirectAllowed = (redirectUrl: string) => {
  try {
    const parsed = new URL(redirectUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return redirectUrl;
    }
    if (parsed.protocol === 'linx:') {
      return redirectUrl;
    }
    throw new Error(`Unsupported redirect protocol: ${parsed.protocol}`);
  } catch (error) {
    throw new Error(`Invalid redirect URL: ${redirectUrl}. ${String(error)}`);
  }
};

const resolveRedirectUrl = (): string => {
  const siteUrl = resolveSiteUrl();
  if (siteUrl) {
    return `${siteUrl}/auth/callback`;
  }
  return DEFAULT_NATIVE_REDIRECT;
};

export default function WelcomePage() {
  const [selectedIssuer, setSelectedIssuer] = useState(() => IDP_OPTIONS[0]);
  const redirectUrl = resolveRedirectUrl();
  const [profile, setProfile] = useState<SolidProfileRow | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStoredSession, setHasStoredSession] = useState(false);
  const [restoringSession, setRestoringSession] = useState(false);
  const { session, login, logout, sessionRequestInProgress } = useSession();
  const isLoggedIn = session.info.isLoggedIn;
  const webId = session.info.webId;
  const sessionId = session.info.sessionId ?? 'inline';
  const database = useMemo(() => {
    if (!isLoggedIn) {
      return null;
    }
    try {
      return drizzle(session);
    } catch (error) {
      console.error('Failed to initialize Solid database', error);
      return null;
    }
  }, [isLoggedIn, sessionId, session.fetch]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storageKey = `solidClientAuthenticationUser:${SOLID_SESSION_ID}`;
    const storedValue = window.localStorage.getItem(storageKey);
    setHasStoredSession(Boolean(storedValue));
  }, [isLoggedIn, sessionRequestInProgress]);

  const canLoadProfile = isLoggedIn && !!webId && !sessionRequestInProgress;
  const lastLoadKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!canLoadProfile || !webId) {
      if (!isLoggedIn) {
        lastLoadKeyRef.current = null;
        setProfile(null);
      }
      return;
    }

    const loadKey = `${sessionId}:${webId}`;
    if (lastLoadKeyRef.current === loadKey) {
      return;
    }
    lastLoadKeyRef.current = loadKey;

    if (!database) {
      return;
    }

    let cancelled = false;
    const loadProfile = async () => {
      setLoadingProfile(true);
      setError(null);
      try {
        const record = await database.findFirst(solidProfileTable, { '@id': webId });
        if (!cancelled) {
          setProfile(record ?? null);
          if (!record) {
            setError('Unable to load profile. Check permissions and try again.');
          }
        }
      } catch (err) {
        console.error('Fetching Solid profile failed', err);
        if (!cancelled) {
          setError('Unable to load profile. Check permissions and try again.');
          setProfile(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [canLoadProfile, sessionId, webId, database, isLoggedIn]);

  const handleLogin = async () => {
    if (!selectedIssuer) {
      setError('Missing Solid issuer configuration.');
      return;
    }

    if (!redirectUrl) {
      setError('Unable to determine redirect URL for this platform.');
      return;
    }

    if (sessionRequestInProgress) {
      setError('正在校验本地 Solid 会话，请稍候。');
      return;
    }

    if (session.info.isLoggedIn) {
      return;
    }

    setError(null);

    let validatedRedirect: string;
    try {
      validatedRedirect = ensureRedirectAllowed(redirectUrl);
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : '登录配置无效，请联系管理员。'
      );
      return;
    }

    try {
      const issuerForLogin = selectedIssuer.trim().replace(/\/+$/, '');
      await login({
        oidcIssuer: issuerForLogin,
        redirectUrl: validatedRedirect,
        clientName: 'Linq Hello World'
      });
    } catch (loginError) {
      console.error('Solid login failed', loginError);
      setError('登录 Solid 失败，请稍后重试。');
    }
  };

  const handleRestoreSession = async () => {
    if (restoringSession) return;
    setError(null);
    setRestoringSession(true);
    try {
      if (typeof window !== 'undefined') {
        await session.handleIncomingRedirect({
          url: window.location.href,
          restorePreviousSession: true
        });
      }
    } catch (restoreError) {
      console.error('Solid session restore failed', restoreError);
      setError('恢复 Solid 会话失败，请重新登录。');
      setHasStoredSession(false);
    } finally {
      setRestoringSession(false);
    }
  };

  const handleLogout = async () => {
    setError(null);
    try {
      await logout();
    } catch (logoutError) {
      console.error('Solid logout failed', logoutError);
      setError('退出登录失败，请稍后重试。');
      return;
    }
    setSelectedIssuer(IDP_OPTIONS[0]);
    setProfile(null);
    setHasStoredSession(false);
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center px-4 py-10">
      <Card className="w-full max-w-[420px] border-border/60 bg-card/80 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-semibold text-foreground">Linq Hello World</CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            Privacy-first productivity, powered by your Solid Pod.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : null}

          {!isLoggedIn ? (
            <div className="space-y-5">
              {sessionRequestInProgress ? (
                <p className="text-sm text-primary">正在检查之前的 Solid 会话…</p>
              ) : null}

              {!sessionRequestInProgress && hasStoredSession ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={restoringSession}
                  onClick={() => void handleRestoreSession()}
                >
                  {restoringSession ? '正在恢复 Solid 会话…' : '恢复上次 Solid 会话'}
                </Button>
              ) : null}

              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  请选择要使用的 Solid 身份供应商，登录后即可在 Web、桌面和移动端访问你的数据。
                </p>
                <div className="space-y-2">
                  <Label htmlFor="solid-issuer">Solid Issuer</Label>
                  <select
                    id="solid-issuer"
                    value={selectedIssuer}
                    onChange={(event) => setSelectedIssuer(event.target.value)}
                    className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {IDP_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => void handleLogin()}
                disabled={sessionRequestInProgress || restoringSession}
              >
                {sessionRequestInProgress
                  ? '会话检查中…'
                  : restoringSession
                    ? '恢复进行中…'
                    : '使用 Solid 登录'}
              </Button>

              <p className="text-xs text-muted-foreground">
                默认发行地址来自 <code>NEXT_PUBLIC_SOLID_IDP_ISSUERS</code>，站点 URL 来自
                <code className="mx-1">NEXT_PUBLIC_SITE_URL</code> 或当前浏览器域名；当无法识别 Web 域名时会回退到
                <code className="mx-1">linx://auth/callback</code> 供桌面/移动壳使用。
              </p>
            </div>
          ) : webId ? (
            <div className="space-y-6">
              {database ? (
                <ProfileCard
                  profile={profile}
                  webId={webId}
                  database={database}
                  fetchFn={session.fetch ?? fetch}
                  onProfileUpdated={setProfile}
                />
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                  正在初始化 Solid 连接…
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {loadingProfile ? (
                  <span className="text-primary">Refreshing profile…</span>
                ) : (
                  <span className="text-accent">You are ready across web, desktop, and mobile.</span>
                )}
              </div>
              <Button variant="outline" className="w-full" onClick={() => void handleLogout()}>
                Sign out
              </Button>
            </div>
          ) : (
            <p className="text-sm text-destructive">无法识别当前 Solid WebID。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
