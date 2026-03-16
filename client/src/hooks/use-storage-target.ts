import { useEffect, useState } from "react";

export type StorageScope = "user" | "workspace";

export interface StorageTarget {
  scope: StorageScope;
  workspaceId?: string;
  projectId?: string | null;
}

const STORAGE_PREFIX = "voxdrop.storageTarget.";

const readStoredTarget = (key: string): StorageTarget | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StorageTarget;
    if (!parsed || (parsed.scope !== "user" && parsed.scope !== "workspace")) return null;
    return parsed;
  } catch {
    return null;
  }
};

export function useStorageTarget(key: string, initial?: StorageTarget) {
  const [target, setTarget] = useState<StorageTarget>(() => {
    const stored = readStoredTarget(key);
    return stored || initial || { scope: "user" };
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(target));
    } catch {
      // ignore storage failures
    }
  }, [key, target]);

  return { target, setTarget };
}

