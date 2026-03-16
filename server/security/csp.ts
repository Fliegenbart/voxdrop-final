type BuildCspOptions = {
  isProd: boolean;
  publicOrigin: string;
  extraConnectSrc?: string;
  allowUnsafeEval: boolean;
};

const normalizeExtraSources = (raw: string | undefined): string[] => {
  if (!raw) return [];
  return raw
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !item.includes(";"));
};

export const isUnsafeEvalEnabled = (isProd: boolean): boolean => {
  if (!isProd) return true;
  return ["1", "true", "yes", "on"].includes(String(process.env.CSP_ALLOW_UNSAFE_EVAL || "").toLowerCase());
};

export const buildContentSecurityPolicy = (options: BuildCspOptions): string => {
  const extraSources = normalizeExtraSources(options.extraConnectSrc);

  const scriptSrc = options.isProd
    ? (options.allowUnsafeEval ? "script-src 'self' 'unsafe-eval'" : "script-src 'self'")
    : "script-src 'self' 'unsafe-eval' 'unsafe-inline'";

  const connectSources = options.isProd
    ? ["'self'", options.publicOrigin, `${options.publicOrigin}/mwg-internal/`, "https:", "wss:", ...extraSources]
    : ["'self'", options.publicOrigin, `${options.publicOrigin}/mwg-internal/`, "http:", "https:", "ws:", "wss:", ...extraSources];

  const csp = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src ${connectSources.join(" ")}`,
    "font-src 'self' data:",
  ];

  return `${csp.join("; ")};`;
};

