import type { Request } from "express";

const FALLBACK_PUBLIC_ORIGIN = "https://voxdrop.live";

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getPublicOrigin(): string {
  const raw = (process.env.PUBLIC_URL || "").trim();
  if (!raw) return FALLBACK_PUBLIC_ORIGIN;

  try {
    // Ensure we always return an origin (no path/query) for consistent link building.
    return new URL(raw).origin;
  } catch {
    // If PUBLIC_URL is malformed, still avoid trailing slashes.
    return stripTrailingSlashes(raw);
  }
}

export function getPublicBaseUrl(req: Pick<Request, "protocol" | "get">): string {
  const env = (process.env.PUBLIC_URL || "").trim();
  if (env) return getPublicOrigin();

  const host = req.get("host");
  if (host) {
    return stripTrailingSlashes(`${req.protocol}://${host}`);
  }

  return FALLBACK_PUBLIC_ORIGIN;
}

