export const INTERNAL_SERVICE_HEADER = "x-internal-service-token";

export const getInternalServiceToken = (): string => {
  return String(process.env.INTERNAL_SERVICE_TOKEN || "").trim();
};

export const buildInternalServiceHeaders = <T extends Record<string, any>>(headers: T = {} as T): T => {
  const token = getInternalServiceToken();
  if (!token) return headers;
  return {
    ...headers,
    [INTERNAL_SERVICE_HEADER]: token,
  };
};

