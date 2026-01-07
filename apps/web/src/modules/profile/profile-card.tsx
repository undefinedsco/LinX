"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { SolidDatabase } from "drizzle-solid";
import {
  solidProfileTable,
  type SolidProfileRow,
  type SolidProfileUpdate
} from "@linx/models";
import { Copy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const genderOptions = [
  { value: "", label: "未设置" },
  { value: "male", label: "男" },
  { value: "female", label: "女" },
  { value: "non-binary", label: "非二元" },
  { value: "prefer_not", label: "保密" }
];

const editableFields: Array<{
  key: ProfileFieldKey;
  label: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  { key: "displayName", label: "姓名", placeholder: "填写姓名" },
  { key: "nickname", label: "昵称", placeholder: "填写昵称" },
  { key: "note", label: "个性签名", placeholder: "记录个性签名", multiline: true }
];

const footerButtons = [
  { label: "发消息", icon: "💬" },
  { label: "语音聊天", icon: "📞" },
  { label: "视频聊天", icon: "🎥" }
];

type ProfileFieldKey = keyof SolidProfileUpdate;

type ProfileCardProps = {
  profile: SolidProfileRow | null;
  webId: string;
  database: SolidDatabase;
  fetchFn: typeof fetch;
  onProfileUpdated: (record: SolidProfileRow) => void;
};

const avatarPreviewCache = new Map<string, string>();

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
    <div className="border-b border-border/40 py-4 last:border-none">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        {!editing ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-primary"
            onClick={() => {
              setEditing(true);
              setDraft(value);
              setLocalError(null);
            }}
          >
            编辑
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-3 space-y-3">
          {multiline ? (
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
              placeholder={placeholder}
            />
          ) : (
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={placeholder}
            />
          )}
          {localError ? <p className="text-xs text-destructive">{localError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={saving} onClick={() => void handleSubmit()}>
              {saving ? "保存中…" : "保存"}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              disabled={saving}
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
            "mt-3 rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-sm",
            value.trim().length > 0 ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {value.trim().length > 0 ? value : placeholder}
        </p>
      )}
    </div>
  );
};

const readProfileField = (record: SolidProfileRow | null, field: ProfileFieldKey): string => {
  if (!record) return "";
  const value = (record as Record<string, unknown>)[field];
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
};

export function ProfileCard({ profile, webId, fetchFn, database, onProfileUpdated }: ProfileCardProps) {
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

  const primaryName = useMemo(() => {
    const display = readProfileField(profile, "displayName").trim();
    if (display) {
      return display;
    }
    const nickname = readProfileField(profile, "nickname").trim();
    if (nickname) {
      return nickname;
    }
    return "";
  }, [profile]);

  const avatarSrc = useMemo(() => {
    const value = readProfileField(profile, "avatarUrl").trim();
    return value;
  }, [profile]);

  useEffect(() => {
    if (!avatarSrc) {
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
    let objectUrl: string | null = null;

    const loadAvatar = async () => {
      try {
        setAvatarFetchError(false);
        const response = await fetchFn(avatarSrc, {
          method: "GET",
          headers: {
            Accept: "image/*"
          }
        });

        if (!response.ok) {
          throw new Error(`Avatar fetch failed: ${response.status}`);
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        avatarPreviewCache.set(avatarSrc, objectUrl);
        if (!cancelled) {
          setAvatarPreviewUrl(objectUrl);
        }
      } catch (error) {
        console.warn("Avatar preview fetch failed", error);
        if (!cancelled) {
          setAvatarPreviewUrl(null);
          setAvatarFetchError(true);
        }
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
      }
    };

    void loadAvatar();

    return () => {
      cancelled = true;
    };
  }, [avatarSrc, fetchFn]);

  const genderValue = useMemo(() => readProfileField(profile, "gender"), [profile]);

  const genderLabel = useMemo(() => {
    if (!genderValue) return "未设置";
    const entry = genderOptions.find((option) => option.value === genderValue);
    return entry?.label ?? genderValue;
  }, [genderValue]);

  const genderIcon = useMemo(() => {
    if (!genderValue) return null;
    switch (genderValue) {
      case "male":
        return "♂️";
      case "female":
        return "♀️";
      case "non-binary":
        return "⚧️";
      case "prefer_not":
        return "❔";
      default:
        return "⚧️";
    }
  }, [genderValue]);

  const displayId = useMemo(() => {
    try {
      const url = new URL(webId);
      const segments = url.pathname.split("/").filter(Boolean);
      return segments[0] ?? url.hostname;
    } catch {
      return webId;
    }
  }, [webId]);

  const handleSaveField = async (key: ProfileFieldKey, value: string) => {
    if (!profile) return;
    const previousValue = readProfileField(profile, key);
    if (previousValue === value) return;
    setSavingKey(key);
    setError(null);
    try {
      await database
        .update(solidProfileTable)
        .set({ [key]: value })
        .where({ "@id": webId });

      const updatedRecord = {
        ...profile,
        [key]: value
      } as SolidProfileRow;
      onProfileUpdated(updatedRecord);
    } catch (err) {
      console.error("Updating profile failed", err);
      const message =
        err instanceof Error ? err.message : "保存失败，请稍后重试。";
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setSavingKey(null);
    }
  };

  const getFieldValue = (key: ProfileFieldKey): string => {
    return readProfileField(profile, key);
  };

  const resolveAvatarContainer = (): string | null => {
    const avatarUrl = readProfileField(profile, "avatarUrl");
    if (avatarUrl) {
      try {
        const url = new URL(avatarUrl);
        const segments = url.pathname.split("/");
        segments.pop();
        return `${url.origin}${segments.join("/")}/`;
      } catch {
        // fallback below
      }
    }

    try {
      const webIdUrl = new URL(webId);
      const parts = webIdUrl.pathname.split("/").filter(Boolean);
      const userSegment = parts[0];
      if (userSegment) {
        return `${webIdUrl.origin}/${userSegment}/public/avatars/`;
      }
      return `${webIdUrl.origin}/public/avatars/`;
    } catch {
      return null;
    }
  };

  const handleAvatarChange = () => {
    if (savingAvatar) return;
    avatarInputRef.current?.click();
  };

  const handleAvatarFileSelected = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    if (!profile || savingAvatar) return;
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
    const fileName = `linx-avatar-${Date.now()}${
      safeExtension.length > 0 ? safeExtension : ".png"
    }`;
    const targetUrl = `${container}${fileName}`;
    const previousPreview = avatarPreviewCache.get(targetUrl);
    if (previousPreview) {
      URL.revokeObjectURL(previousPreview);
    }
    const localPreviewUrl = URL.createObjectURL(file);
    avatarPreviewCache.set(targetUrl, localPreviewUrl);
    setAvatarPreviewUrl(localPreviewUrl);
    setAvatarFetchError(false);

    setSavingAvatar(true);
    setError(null);
    try {
      const uploadResponse = await fetchFn(targetUrl, {
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
        throw new Error(
          `头像上传失败 (${uploadResponse.status} ${uploadResponse.statusText})`
        );
      }

      await handleSaveField("avatarUrl", targetUrl);
    } catch (err) {
      console.error("Avatar upload failed", err);
      setError(
        err instanceof Error ? err.message : "头像上传失败，请稍后重试。"
      );
      URL.revokeObjectURL(localPreviewUrl);
      avatarPreviewCache.delete(targetUrl);
    } finally {
      if (event.target) {
        event.target.value = "";
      }
      setSavingAvatar(false);
    }
  };

  const startGenderEdit = () => {
    const value = readProfileField(profile, "gender");
    setGenderDraft(value);
    setEditingGender(true);
  };

  const commitGender = async (value: string) => {
    const current = readProfileField(profile, "gender");
    if (current === value) {
      setEditingGender(false);
      return;
    }
    await handleSaveField("gender", value);
    setEditingGender(false);
  };

  const startRegionEdit = () => {
    const value = readProfileField(profile, "region");
    setRegionDraft(value);
    setEditingRegion(true);
  };

  const commitRegion = async (value: string) => {
    const trimmed = value.trim();
    const current = readProfileField(profile, "region").trim();
    if (trimmed === current) {
      setEditingRegion(false);
      return;
    }
    await handleSaveField("region", trimmed);
    setEditingRegion(false);
  };

  const cancelRegionEdit = () => {
    setEditingRegion(false);
    setRegionDraft(readProfileField(profile, "region"));
  };

  const handleCopyWebId = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(webId);
      } else {
        const temp = document.createElement("textarea");
        temp.value = webId;
        temp.style.position = "fixed";
        temp.style.opacity = "0";
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
      }
      setCopyFeedback("已复制");
    } catch (err) {
      console.error("Copy webId failed", err);
      setCopyFeedback("复制失败");
    } finally {
      window.setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  if (!profile) {
    return (
      <article className="rounded-2xl border border-border/60 bg-background/40 px-6 py-10 text-center text-sm text-muted-foreground">
        正在加载 Solid Profile…
      </article>
    );
  }

  return (
    <article className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-background/40 p-4 shadow-inner md:flex-row md:items-start">
        <div className="flex flex-col items-center gap-3">
          <Avatar className="h-24 w-24 rounded-2xl border border-border/60 shadow-lg">
            {avatarPreviewUrl && !avatarFetchError ? (
              <AvatarImage src={avatarPreviewUrl} alt={primaryName || "Profile avatar"} />
            ) : avatarSrc && !avatarFetchError ? (
              <AvatarImage
                src={avatarSrc}
                alt={primaryName || "Profile avatar"}
                onError={() => {
                  setAvatarFetchError(true);
                }}
              />
            ) : (
              <AvatarFallback>{primaryName ? primaryName.charAt(0).toUpperCase() : "L"}</AvatarFallback>
            )}
          </Avatar>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleAvatarChange}
            disabled={savingAvatar}
          >
            {savingAvatar ? "上传中…" : "上传头像"}
          </Button>
        </div>

        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-foreground">
            <span className="text-xl font-semibold">{primaryName || "未命名联系人"}</span>
            {editingGender ? (
              <select
                autoFocus
                value={genderDraft}
                onChange={(event) => {
                  const next = event.target.value;
                  setGenderDraft(next);
                  void commitGender(next);
                }}
                onBlur={() => {
                  void commitGender(genderDraft);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setEditingGender(false);
                    setGenderDraft(readProfileField(profile, "gender"));
                  }
                }}
                className="h-9 rounded-md border border-input bg-background/70 px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {genderOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3 text-sm text-muted-foreground hover:text-foreground"
                onClick={() => startGenderEdit()}
                title={`性别：${genderLabel}`}
              >
                <span className="mr-1 text-lg" role="img" aria-label={`性别：${genderLabel}`}>
                  {genderIcon ?? "⚧️"}
                </span>
                {genderLabel}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-muted-foreground/80">ID：</span>
            <span className="truncate text-foreground">{displayId}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary hover:text-primary"
              onClick={() => void handleCopyWebId()}
              aria-label="复制 WebID"
            >
              <Copy size={16} />
            </Button>
            {copyFeedback ? (
              <span className="text-xs text-accent">{copyFeedback}</span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {editingRegion ? (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Input
                  autoFocus
                  value={regionDraft}
                  onChange={(event) => setRegionDraft(event.target.value)}
                  onBlur={() => {
                    void commitRegion(regionDraft);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void commitRegion(regionDraft);
                    }
                    if (event.key === "Escape") {
                      cancelRegionEdit();
                    }
                  }}
                  placeholder="填写地区"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void commitRegion(regionDraft)}>
                    保存
                  </Button>
                  <Button size="sm" variant="ghost" type="button" onClick={cancelRegionEdit}>
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => startRegionEdit()}
                title={`地区：${readProfileField(profile, "region") || "未设置"}`}
              >
                <span role="img" aria-hidden="true">
                  📍
                </span>
                <span>{readProfileField(profile, "region") || "未设置"}</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background/40 px-4">
        {editableFields.map((field) => (
          <EditableField
            key={field.key}
            label={field.label}
            value={getFieldValue(field.key)}
            placeholder={field.placeholder}
            multiline={field.multiline}
            saving={savingKey === field.key}
            onSave={(value) => handleSaveField(field.key, value)}
          />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {footerButtons.map((button) => (
          <button
            key={button.label}
            type="button"
            className="group flex h-full flex-col items-center gap-1 rounded-2xl border border-border/60 bg-background/40 px-4 py-5 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-primary"
            disabled
          >
            <span className="text-xl">{button.icon}</span>
            <span>{button.label}</span>
            <span className="text-xs text-muted-foreground/70 group-hover:text-primary/80">即将推出</span>
          </button>
        ))}
      </div>

      <input
        type="file"
        accept="image/*"
        ref={avatarInputRef}
        className="hidden"
        onChange={(event) => void handleAvatarFileSelected(event)}
      />
    </article>
  );
}












