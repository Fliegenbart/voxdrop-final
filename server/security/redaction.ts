const SENSITIVE_KEY_RE = /(token|authorization|cookie|password|secret|api[_-]?key|session|jwt)/i;
const MAX_STRING_LOG_LEN = 256;

const redactString = (value: string): string => {
  if (value.length <= MAX_STRING_LOG_LEN) return value;
  return `${value.slice(0, MAX_STRING_LOG_LEN)}…`;
};

const redactValue = (value: unknown, seen: WeakSet<object>): unknown => {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return redactString(value);
  }

  if (typeof value !== "object") {
    return value;
  }

  if (seen.has(value as object)) {
    return "[circular]";
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = redactValue(val, seen);
  }
  return output;
};

export const redactForLog = (value: unknown): unknown => {
  try {
    return redactValue(value, new WeakSet<object>());
  } catch {
    return "[redaction_error]";
  }
};

