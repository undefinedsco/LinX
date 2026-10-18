import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatErrorForUser } from "@/lib/user-facing-errors";
import { useSession } from "@/providers/solid-session-context";
import { useSolidDatabase } from "@/providers/solid-database-provider";
import { readProfile } from "./collections";
import { profileInitial, useAuthenticatedAvatar } from "./avatar";
import { accountHandle } from "./domain/account-handle";
import { profileDisplayName, readProfileValues } from "./domain/profile-fields";
import type { SpaceAttentionAction } from "./domain/space-status";
import { useSpaceStatus } from "./useSpaceStatus";

export interface SelfProfileCardProps {
  /** S3c 编辑个人资料 */
  onEditProfile?: () => void
  /** Settings › 空间与服务 */
  onOpenSettings?: () => void
  /** Settings › 本机服务, for "本机空间没有启动" */
  onOpenLocalService?: () => void
  /** Model connections, for "AI 还没连接" */
  onConnectAi?: () => void
  onSwitchAccount?: () => void
  onSignOut?: () => void
  className?: string
}

/**
 * WeChat-style personal card (S3): who you are, your account, where your data
 * lives and your signature. A healthy space adds nothing; a problem adds one
 * line with at most one action (S3b). Details live in Settings.
 */
export function SelfProfileCard({
  onEditProfile,
  onOpenSettings,
  onOpenLocalService,
  onConnectAi,
  onSwitchAccount,
  onSignOut,
  className,
}: SelfProfileCardProps = {}) {
  const { session } = useSession();
  const { db } = useSolidDatabase();
  const webId = session.info.webId || "";
  const space = useSpaceStatus();

  const {
    data: profile,
    isFetching,
    isLoading,
    isError,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["profile", webId],
    queryFn: async () => {
      if (!db || !webId) return null;
      return await readProfile(db, webId);
    },
    enabled: !!db && !!webId,
  });

  const values = useMemo(() => readProfileValues(profile as Record<string, unknown> | null | undefined), [profile]);
  const primaryName = profileDisplayName(values);
  const handle = accountHandle(webId);
  const {
    previewUrl: avatarPreviewUrl,
    failed: avatarFetchError,
    markFailed: markAvatarFailed,
  } = useAuthenticatedAvatar(values.avatar, session.fetch);

  const actionHandlers: Record<SpaceAttentionAction, (() => void) | undefined> = {
    "open-space-settings": onOpenSettings,
    "open-local-service": onOpenLocalService ?? onOpenSettings,
    "connect-ai": onConnectAi,
  };

  // A profile read failure takes priority: it is about this card itself.
  const attentionLine = isError && !isFetching
    ? {
        message: formatErrorForUser(queryError, "资料没有读到。请检查当前账号和空间后重试。"),
        actionLabel: "重试",
        onAction: () => void refetch(),
      }
    : space.attention
      ? {
          message: space.attention.message,
          actionLabel: space.attention.action?.label,
          onAction: space.attention.action ? actionHandlers[space.attention.action.id] : undefined,
        }
      : null;

  if (!webId && isLoading) {
    return (
      <div className="w-[300px] rounded-xl bg-card border border-border p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="我的卡片"
      className={cn("w-[300px] overflow-hidden rounded-xl border border-border bg-card", className)}
    >
      <div className="flex gap-3.5 px-4 pb-[18px] pt-5">
        <Avatar className="h-14 w-14 shrink-0 rounded-lg">
          {avatarPreviewUrl && !avatarFetchError ? (
            <AvatarImage src={avatarPreviewUrl} alt={primaryName} className="object-cover" onError={markAvatarFailed} />
          ) : null}
          <AvatarFallback className="!rounded-lg bg-accent text-[22px] font-semibold text-foreground">
            {profileInitial(primaryName)}
          </AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
          <h3 className="truncate text-[17px] font-semibold text-foreground">{primaryName}</h3>
          {handle ? <p className="truncate text-[13px] text-muted-foreground">{handle}</p> : null}
          <p className="text-[13px] text-muted-foreground">空间：{space.spaceLabel}</p>
          {values.note ? <p className="mt-1 line-clamp-2 text-[13px] text-foreground">{values.note}</p> : null}
        </div>
      </div>

      {attentionLine ? (
        <div role="status" className="flex items-center gap-2 border-t border-border bg-secondary px-4 py-2.5 text-[13px] text-foreground">
          <span className="min-w-0 flex-1">{attentionLine.message}</span>
          {attentionLine.actionLabel && attentionLine.onAction ? (
            <button
              type="button"
              className="shrink-0 font-semibold text-primary hover:underline"
              onClick={attentionLine.onAction}
            >
              {attentionLine.actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      <nav aria-label="账号菜单">
        <MenuRow label="编辑个人资料" onClick={onEditProfile} />
        <MenuRow label="设置" onClick={onOpenSettings} />
        <MenuRow label="切换账号" onClick={onSwitchAccount} />
        <MenuRow label="退出登录" onClick={onSignOut} />
      </nav>
    </div>
  );
}

function MenuRow({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex h-10 w-full items-center border-t border-border px-4 text-left text-sm text-foreground hover:bg-layout-list-hover disabled:opacity-50"
    >
      {label}
    </button>
  );
}
