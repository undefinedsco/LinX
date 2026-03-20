"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useSession } from "@inrupt/solid-ui-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  solidProfileTable,
  type SolidProfileRow,
  type SolidProfileUpdate
} from "@linx/models";
import { Copy, MapPin, Camera } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useSolidDatabase } from "@/providers/solid-database-provider";

// Gender options
const genderOptions = [
  { value: "", label: "未设置", icon: "?" },
  { value: "male", label: "男", icon: "♂" },
  { value: "female", label: "女", icon: "♀" },
  { value: "non-binary", label: "非二元", icon: "⚧" },
  { value: "prefer_not", label: "保密", icon: "?" }
];

// Editable fields config - use actual schema field names
const editableFields: Array<{
  key: ProfileFieldKey;
  label: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  { key: "name", label: "姓名", placeholder: "填写姓名" },
  { key: "nick", label: "昵称", placeholder: "填写昵称" },
  { key: "email", label: "邮箱", placeholder: "填写邮箱地址" },
  { key: "phone", label: "电话", placeholder: "填写电话号码" },
  { key: "note", label: "个性签名", placeholder: "记录个性签名", multiline: true }
];

type ProfileFieldKey = keyof SolidProfileUpdate;

const avatarPreviewCache = new Map<string, string>();

// Helper to read profile field
const readProfileField = (record: SolidProfileRow | null, field: ProfileFieldKey): string => {
  if (!record) return "";
  const value = (record as Record<string, unknown>)[field];
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
};

// Editable Field Component - Warm Guardian Style
type EditableFieldProps = {
  label: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  saving: boolean;
  onSave: (nextValue: string) => Promise<void>;
};

const EditableField = ({ label, value, placeholder, multiline, saving, onSave }: EditableFieldProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleSubmit = async () => {
    setLocalError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "保存失败，请重试。");
    }
  };

  return (
    <div className="border-b border-border/30 py-4 last:border-none">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        {!editing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-3 text-xs text-primary hover:bg-primary/10 rounded-lg"
            onClick={() => {
              setEditing(true);
              setDraft(value);
              setLocalError(null);
            }}
          >
            编辑
          </Button>
        )}
      </div>
      {editing ? (
        <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          {multiline ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder={placeholder}
              className="rounded-xl border-border/40 bg-muted/30 focus:bg-background transition-colors"
            />
          ) : (
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              className="rounded-xl border-border/40 bg-muted/30 focus:bg-background transition-colors"
            />
          )}
          {localError && <p className="text-xs text-destructive">{localError}</p>}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={saving}
              onClick={() => void handleSubmit()}
              className="rounded-xl"
            >
              {saving ? "保存中…" : "保存"}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              disabled={saving}
              className="rounded-xl"
              onClick={() => {
                setDraft(value);
                setLocalError(null);
                setEditing(false);
              }}
            >
              取消
            </Button>
          </div>
        </div>
      ) : (
        <p
          className={cn(
            "mt-2 rounded-xl border border-border/30 bg-muted/30 px-4 py-2.5 text-sm transition-colors",
            value.trim().length > 0 ? "text-foreground" : "text-muted-foreground/60"
          )}
        >
          {value.trim().length > 0 ? value : placeholder}
        </p>
      )}
    </div>
  );
};

// Main Component
export function SelfProfileCard() {
  const { session } = useSession();
  const { db } = useSolidDatabase();
  const queryClient = useQueryClient();
  const webId = session.info.webId || "";
  const authFetch = session.fetch;

  // State
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<ProfileFieldKey | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [editingGender, setEditingGender] = useState(false);
  const [genderDraft, setGenderDraft] = useState("");
  const [editingRegion, setEditingRegion] = useState(false);
  const [regionDraft, setRegionDraft] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarFetchError, setAvatarFetchError] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Query Profile
  const { data: profile } = useQuery({
    queryKey: ["profile", webId],
    queryFn: async () => {
      if (!db || !webId) return null;
      const record = await (db as any).findByIri(solidProfileTable, webId);
      return record as SolidProfileRow | null;
    },
    enabled: !!db && !!webId,
  });

  // Computed values
  const primaryName = useMemo(() => {
    const name = readProfileField(profile ?? null, "name").trim();
    if (name) return name;
    const nick = readProfileField(profile ?? null, "nick").trim();
    if (nick) return nick;
    return "LinX 用户";
  }, [profile]);

  const avatarSrc = useMemo(() => {
    return readProfileField(profile ?? null, "avatar").trim();
  }, [profile]);

  const genderValue = useMemo(() => readProfileField(profile ?? null, "gender"), [profile]);

  const genderInfo = useMemo(() => {
    const entry = genderOptions.find((opt) => opt.value === genderValue);
    return entry || genderOptions[0];
  }, [genderValue]);

  const displayId = useMemo(() => {
    try {
      const url = new URL(webId);
      return url.hostname;
    } catch {
      return webId;
    }
  }, [webId]);

  // Load avatar with auth
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
          headers: { Accept: "image/*" }
        });

        if (!response.ok) throw new Error(`Avatar fetch failed: ${response.status}`);

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        avatarPreviewCache.set(avatarSrc, objectUrl);
        if (!cancelled) setAvatarPreviewUrl(objectUrl);
      } catch (err) {
        console.warn("Avatar preview fetch failed", err);
        if (!cancelled) {
          setAvatarPreviewUrl(null);
          setAvatarFetchError(true);
        }
      }
    };

    void loadAvatar();
    return () => { cancelled = true; };
  }, [avatarSrc, authFetch]);

  // Save field handler
  const handleSaveField = async (key: ProfileFieldKey, value: string) => {
    if (!profile || !db) return;
    const previousValue = readProfileField(profile, key);
    if (previousValue === value) return;

    setSavingKey(key);
    setError(null);
    try {
      await (db as any)
        .update(solidProfileTable)
        .set({ [key]: value } as any)
        .where({ "@id": webId } as any)
        .execute();

      queryClient.setQueryData(["profile", webId], {
        ...profile,
        [key]: value
      });
    } catch (err) {
      console.error("Updating profile failed", err);
      const message = err instanceof Error ? err.message : "保存失败，请稍后重试。";
      setError(message);
      throw new Error(message);
    } finally {
      setSavingKey(null);
    }
  };

  // Avatar upload
  const resolveAvatarContainer = (): string | null => {
    const avatarUrl = readProfileField(profile ?? null, "avatar");
    if (avatarUrl) {
      try {
        const url = new URL(avatarUrl);
        const segments = url.pathname.split("/");
        segments.pop();
        return `${url.origin}${segments.join("/")}/`;
      } catch { /* fallback below */ }
    }

    try {
      const webIdUrl = new URL(webId);
      const parts = webIdUrl.pathname.split("/").filter(Boolean);
      const userSegment = parts[0];
      if (userSegment) return `${webIdUrl.origin}/${userSegment}/public/avatars/`;
      return `${webIdUrl.origin}/public/avatars/`;
    } catch {
      return null;
    }
  };

  const handleAvatarChange = () => {
    if (savingAvatar) return;
    avatarInputRef.current?.click();
  };

  const handleAvatarFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!profile || savingAvatar || !authFetch) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const container = resolveAvatarContainer();
    if (!container) {
      setError("无法确定头像存储路径。");
      return;
    }

    const extension = file.name.includes(".")
      ? file.name.slice(file.name.lastIndexOf("."))
      : ".png";
    const safeExtension = extension.replace(/[^.a-zA-Z0-9]/g, "");
    const fileName = `linx-avatar-${Date.now()}${safeExtension || ".png"}`;
    const targetUrl = `${container}${fileName}`;

    const localPreviewUrl = URL.createObjectURL(file);
    avatarPreviewCache.set(targetUrl, localPreviewUrl);
    setAvatarPreviewUrl(localPreviewUrl);
    setAvatarFetchError(false);

    setSavingAvatar(true);
    setError(null);
    try {
      const uploadResponse = await authFetch(targetUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "If-None-Match": "*"
        },
        body: file
      });

      if (!uploadResponse.ok) {
        URL.revokeObjectURL(localPreviewUrl);
        avatarPreviewCache.delete(targetUrl);
        throw new Error(`头像上传失败 (${uploadResponse.status})`);
      }

      await handleSaveField("avatar", targetUrl);
    } catch (err) {
      console.error("Avatar upload failed", err);
      setError(err instanceof Error ? err.message : "头像上传失败，请稍后重试。");
      URL.revokeObjectURL(localPreviewUrl);
      avatarPreviewCache.delete(targetUrl);
    } finally {
      if (event.target) event.target.value = "";
      setSavingAvatar(false);
    }
  };

  // Gender edit
  const commitGender = async (value: string) => {
    const current = readProfileField(profile ?? null, "gender");
    if (current === value) {
      setEditingGender(false);
      return;
    }
    await handleSaveField("gender", value);
    setEditingGender(false);
  };

  // Region edit
  const commitRegion = async (value: string) => {
    if (!profile) return;
    const trimmed = value.trim();
    const current = readProfileField(profile, "region").trim();
    if (trimmed === current) {
      setEditingRegion(false);
      return;
    }
    await handleSaveField("region", trimmed);
    setEditingRegion(false);
  };

  // Copy WebID
  const handleCopyWebId = async () => {
    try {
      await navigator.clipboard.writeText(webId);
      setCopyFeedback("已复制");
    } catch {
      setCopyFeedback("复制失败");
    } finally {
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  // Loading state
  if (!profile) {
    return (
      <div className="relative w-[360px] rounded-3xl bg-card/95 border border-border/30 shadow-[0_20px_60px_-12px_rgba(124,58,237,0.2)] p-8 text-center">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-24 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent blur-2xl pointer-events-none" />
        <p className="text-sm text-muted-foreground">正在加载个人资料…</p>
      </div>
    );
  }

  return (
    <div className="relative w-[360px] rounded-3xl bg-card/95 border border-border/30 shadow-[0_20px_60px_-12px_rgba(124,58,237,0.2)] overflow-hidden">
      {/* Top glow effect */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-28 bg-gradient-to-b from-primary/20 via-primary/5 to-transparent blur-2xl pointer-events-none" />

      {/* Error message */}
      {error && (
        <div className="mx-5 mt-5 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Header / Avatar Area */}
      <div className="relative flex items-start gap-4 p-5 pb-4">
        {/* Avatar with glow and upload */}
        <div className="relative group">
          <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl scale-110 opacity-50 group-hover:opacity-70 transition-opacity duration-300" />
          <Avatar className="relative w-20 h-20 rounded-2xl border-2 border-primary/20 shadow-lg">
            {avatarPreviewUrl && !avatarFetchError ? (
              <AvatarImage src={avatarPreviewUrl} alt={primaryName} />
            ) : avatarSrc && !avatarFetchError ? (
              <AvatarImage src={avatarSrc} alt={primaryName} onError={() => setAvatarFetchError(true)} />
            ) : (
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary text-2xl font-semibold">
                {primaryName.charAt(0).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
          {/* Upload overlay */}
          <button
            type="button"
            onClick={handleAvatarChange}
            disabled={savingAvatar}
            className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
          >
            <Camera className="w-6 h-6 text-white" />
          </button>
        </div>

        <div className="flex-1 min-w-0 pt-1">
          {/* Name + Gender */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold truncate">{primaryName}</h3>
            {editingGender ? (
              <select
                autoFocus
                value={genderDraft}
                onChange={(e) => {
                  setGenderDraft(e.target.value);
                  void commitGender(e.target.value);
                }}
                onBlur={() => void commitGender(genderDraft)}
                className="h-7 rounded-lg border border-border/40 bg-muted/50 px-2 text-xs"
              >
                {genderOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <button
                onClick={() => {
                  setGenderDraft(genderValue);
                  setEditingGender(true);
                }}
                className={cn(
                  "text-sm px-2 py-0.5 rounded-lg hover:bg-muted/50 transition-colors",
                  genderValue === "male" && "text-blue-400",
                  genderValue === "female" && "text-pink-400",
                  !genderValue && "text-muted-foreground"
                )}
              >
                {genderInfo.icon}
              </button>
            )}
          </div>

          {/* Host */}
          <p className="text-xs text-muted-foreground/70 truncate font-mono mb-2">
            {displayId}
          </p>

          {/* Region */}
          {editingRegion ? (
            <div className="flex gap-2">
              <Input
                autoFocus
                value={regionDraft}
                onChange={(e) => setRegionDraft(e.target.value)}
                onBlur={() => void commitRegion(regionDraft)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRegion(regionDraft);
                  if (e.key === "Escape") setEditingRegion(false);
                }}
                placeholder="填写地区"
                className="h-7 text-xs rounded-lg"
              />
            </div>
          ) : (
            <button
              onClick={() => {
                setRegionDraft(readProfileField(profile, "region"));
                setEditingRegion(true);
              }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <MapPin className="w-3 h-3" />
              <span>{readProfileField(profile, "region") || "设置地区"}</span>
            </button>
          )}
        </div>
      </div>

      {/* WebID */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>WebID</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-muted/50 rounded-lg"
            onClick={() => void handleCopyWebId()}
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="relative">
          <p className="text-xs font-mono bg-muted/40 p-2.5 rounded-xl break-all border border-border/20 pr-8">
            {webId}
          </p>
          {copyFeedback && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary animate-in fade-in duration-200">
              {copyFeedback}
            </span>
          )}
        </div>
      </div>

      <Separator className="bg-border/30" />

      {/* Editable Fields */}
      <div className="px-5">
        {editableFields.map((field) => (
          <EditableField
            key={field.key}
            label={field.label}
            value={readProfileField(profile, field.key)}
            placeholder={field.placeholder}
            multiline={field.multiline}
            saving={savingKey === field.key}
            onSave={(value) => handleSaveField(field.key, value)}
          />
        ))}
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        accept="image/*"
        ref={avatarInputRef}
        className="hidden"
        onChange={(e) => void handleAvatarFileSelected(e)}
      />
    </div>
  );
}
