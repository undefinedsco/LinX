"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@inrupt/solid-ui-react";
import { useQuery } from "@tanstack/react-query";
import {
  solidProfileTable,
  type SolidProfileRow,
  type SolidProfileUpdate,
} from "@undefineds.co/models";
import { Copy, RefreshCw, CheckCircle2, AlertCircle, Loader2, HardDrive } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSolidDatabase } from "@/providers/solid-database-provider";
import { useLoginStore } from "@linx/stores/login";

// ── Helpers ──────────────────────────────────────────────────────────

type ProfileFieldKey = Extract<keyof SolidProfileUpdate, string>;

const genderOptions: Record<string, { label: string; icon: string; className: string }> = {
  male:       { label: "男", icon: "♂", className: "text-blue-500 font-bold" },
  female:     { label: "女", icon: "♀", className: "text-pink-500 font-bold" },
  "non-binary": { label: "非二元", icon: "⚧", className: "text-purple-500 font-bold" },
};

const readField = (record: SolidProfileRow | null, field: ProfileFieldKey): string => {
  if (!record) return "";
  const value = (record as Record<string, unknown>)[field];
  if (typeof value === "string") return value;
  return "";
};

function getShortId(webId: string): string {
  try {
    const url = new URL(webId);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length > 0 && parts[0] !== "profile") return parts[0];
    return url.hostname;
  } catch {
    return webId;
  }
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  return `${Math.floor(diff / 86_400_000)}天前`;
}

const avatarPreviewCache = new Map<string, string>();

// ── InfoRow ──────────────────────────────────────────────────────────

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-start py-3.5 px-4",
        !last && "border-b border-border/30",
      )}
    >
      <span className="w-16 shrink-0 text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "flex-1 min-w-0 text-sm break-all",
          value ? "text-foreground" : "text-muted-foreground/40",
        )}
      >
        {value || "未填写"}
      </span>
    </div>
  );
}

function SpaceBadge({ label }: { label: string }) {
  const isLocal = label.toLowerCase() === "local";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        isLocal
          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isLocal ? "bg-emerald-500" : "bg-sky-500",
        )}
      />
      {label}
    </span>
  );
}

function LocalSpaceMarker() {
  return (
    <span
      data-profile-local-marker
      className="absolute bottom-1.5 right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-[7px] border border-white/80 bg-emerald-500 text-white shadow-sm dark:border-zinc-900/80"
    >
      <HardDrive className="h-3 w-3" aria-hidden="true" />
    </span>
  );
}

function formatProviderHost(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function isLocalSpace(providerLabel?: string, providerUrl?: string): boolean {
  const label = providerLabel?.trim().toLowerCase();
  if (label === "local" || label === "本地空间") return true;
  if (!providerUrl) return false;

  try {
    const hostname = new URL(providerUrl).hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".local") ||
      (hostname.startsWith("node-") && hostname.endsWith(".undefineds.co"))
    );
  } catch {
    return false;
  }
}

// ── Main Component ───────────────────────────────────────────────────

export function SelfProfileCard() {
  const { session } = useSession();
  const { db } = useSolidDatabase();
  const storedAccount = useLoginStore((state) => state.storedAccount);
  const webId = session.info.webId || "";
  const authFetch = session.fetch;

  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarFetchError, setAvatarFetchError] = useState(false);

  // ── Profile query ──────────────────────────────────────────────────

  const {
    data: profile,
    dataUpdatedAt,
    isFetching,
    isLoading,
    isError,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["profile", webId],
    queryFn: async () => {
      if (!db || !webId) return null;
      const record = await (db as any).findByIri(solidProfileTable, webId);
      return record as SolidProfileRow | null;
    },
    enabled: !!db && !!webId,
  });

  // ── Computed ───────────────────────────────────────────────────────

  const primaryName = useMemo(() => {
    const name = readField(profile ?? null, "name").trim();
    if (name) return name;
    const nick = readField(profile ?? null, "nick").trim();
    if (nick) return nick;
    return "LinX 用户";
  }, [profile]);

  const avatarSrc = useMemo(() => readField(profile ?? null, "avatar").trim(), [profile]);
  const genderValue = useMemo(() => readField(profile ?? null, "gender"), [profile]);
  const genderInfo = genderOptions[genderValue] ?? null;
  const shortId = useMemo(() => getShortId(webId), [webId]);
  const nick = useMemo(() => readField(profile ?? null, "nick").trim(), [profile]);
  const email = useMemo(() => readField(profile ?? null, "email").trim(), [profile]);
  const phone = useMemo(() => readField(profile ?? null, "phone").trim(), [profile]);
  const region = useMemo(() => readField(profile ?? null, "region").trim(), [profile]);
  const note = useMemo(() => readField(profile ?? null, "note").trim(), [profile]);
  const providerLabel = storedAccount?.providerLabel ?? storedAccount?.issuerLabel ?? "";
  const providerUrl = storedAccount?.providerUrl ?? storedAccount?.issuerUrl;
  const providerHost = formatProviderHost(providerUrl);
  const isLocalProvider = isLocalSpace(providerLabel, providerUrl);

  // ── Avatar with auth fetch ─────────────────────────────────────────

  useEffect(() => {
    if (!avatarSrc || !authFetch) {
      setAvatarPreviewUrl(null);
      setAvatarFetchError(false);
      return;
    }

    const cached = avatarPreviewCache.get(avatarSrc);
    if (cached) {
      setAvatarPreviewUrl(cached);
      setAvatarFetchError(false);
      return;
    }

    let cancelled = false;
    const loadAvatar = async () => {
      try {
        setAvatarFetchError(false);
        const response = await authFetch(avatarSrc, {
          method: "GET",
          headers: { Accept: "image/*" },
        });
        if (!response.ok) throw new Error(`${response.status}`);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        avatarPreviewCache.set(avatarSrc, objectUrl);
        if (!cancelled) {
          setAvatarPreviewUrl(objectUrl);
          setAvatarFetchError(false);
        }
      } catch {
        if (!cancelled) setAvatarFetchError(true);
      }
    };

    void loadAvatar();
    return () => { cancelled = true; };
  }, [avatarSrc, authFetch]);

  // ── Actions ────────────────────────────────────────────────────────

  const handleCopyId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(webId);
      setCopyFeedback("已复制");
    } catch {
      setCopyFeedback("复制失败");
    } finally {
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  }, [webId]);

  const handleManualSync = useCallback(() => {
    void refetch();
  }, [refetch]);

  // ── Sync status text ───────────────────────────────────────────────

  const syncStatusNode = useMemo(() => {
    if (isFetching) {
      return (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>正在同步...</span>
        </>
      );
    }
    if (isError) {
      return (
        <>
          <AlertCircle className="w-3 h-3 text-destructive/60" />
          <span className="text-destructive/60">
            {queryError instanceof Error ? queryError.message : "同步失败"}
          </span>
          <Button
            variant="link"
            className="h-auto p-0 text-xs text-primary/70 hover:text-primary"
            onClick={handleManualSync}
          >
            重试
          </Button>
        </>
      );
    }
    if (dataUpdatedAt) {
      return (
        <>
          <CheckCircle2 className="w-3 h-3 text-green-500/60" />
          <span>已同步 · {formatRelativeTime(dataUpdatedAt)}</span>
        </>
      );
    }
    return null;
  }, [isFetching, isError, queryError, dataUpdatedAt, handleManualSync]);

  // ── Loading ────────────────────────────────────────────────────────

  if (!webId && isLoading) {
    return (
      <div className="w-[360px] rounded-xl bg-card border border-border/40 shadow-sm p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="w-[360px] rounded-xl bg-card border border-border/40 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-5 px-6 pt-6 pb-5">
        <Avatar className="w-20 h-20 rounded-2xl border border-border/50 shadow-sm shrink-0">
          {avatarPreviewUrl && !avatarFetchError ? (
            <AvatarImage src={avatarPreviewUrl} alt={primaryName} className="object-cover" />
          ) : avatarSrc && !avatarFetchError ? (
            <AvatarImage src={avatarSrc} alt={primaryName} className="object-cover" onError={() => setAvatarFetchError(true)} />
          ) : (
            <AvatarFallback className="text-2xl bg-primary/5 text-primary font-bold">
              {primaryName.charAt(0).toUpperCase()}
            </AvatarFallback>
          )}
          {isLocalProvider ? <LocalSpaceMarker /> : null}
        </Avatar>

        <div className="flex-1 min-w-0 py-0.5 space-y-1.5">
          {/* Name + Gender */}
          <div className="flex items-center gap-1.5">
            <h3 className="text-xl font-bold text-foreground truncate">{primaryName}</h3>
            {genderInfo && (
              <span className={cn("text-sm ml-0.5", genderInfo.className)}>{genderInfo.icon}</span>
            )}
          </div>

          {/* ID row */}
          <div className="text-sm text-muted-foreground flex items-center gap-1.5">
            <span className="shrink-0 opacity-60">LinX 号:</span>
            <span className="font-mono font-medium truncate" title={webId}>{shortId}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 rounded-md hover:bg-muted-foreground/10 text-muted-foreground/50 hover:text-foreground"
              onClick={() => void handleCopyId()}
            >
              <Copy className="w-3 h-3" />
            </Button>
            {copyFeedback && (
              <span className="text-xs text-primary animate-in fade-in duration-200">{copyFeedback}</span>
            )}
            <div className="flex items-center gap-1 pl-1 border-l border-border/40">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-5 w-5 rounded-md hover:bg-muted-foreground/10",
                  isError ? "text-destructive/70 hover:text-destructive" : "text-primary/70 hover:text-primary",
                )}
                onClick={handleManualSync}
                disabled={isFetching}
              >
                <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
              </Button>
            </div>
          </div>

          {/* Sync status */}
          {syncStatusNode && (
            <div className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
              {syncStatusNode}
            </div>
          )}

          {providerLabel ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <SpaceBadge label={providerLabel} />
              {providerHost ? (
                <span className="min-w-0 truncate" title={providerHost}>
                  {providerHost}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Info rows */}
      <div className="bg-card rounded-xl border-t border-border/40 overflow-hidden">
        <InfoRow label="昵称" value={nick} />
        <InfoRow label="邮箱" value={email} />
        <InfoRow label="电话" value={phone} />
        <InfoRow label="地区" value={region} />
        <InfoRow label="签名" value={note} last />
      </div>
    </div>
  );
}
