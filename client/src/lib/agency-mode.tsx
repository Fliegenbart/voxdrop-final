import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";

const STORAGE_KEY = "voxdrop-agency-mode";

interface AgencyModeContextValue {
  isAgencyMode: boolean;
  setAgencyMode: (value: boolean) => void;
}

const AgencyModeContext = createContext<AgencyModeContextValue | null>(null);

function getInitialAgencyMode(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "true";
}

export function AgencyModeProvider({ children }: { children: ReactNode }) {
  const [isAgencyMode, setIsAgencyMode] = useState<boolean>(getInitialAgencyMode);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, String(isAgencyMode));
  }, [isAgencyMode]);

  const value = useMemo(() => ({
    isAgencyMode,
    setAgencyMode: setIsAgencyMode,
  }), [isAgencyMode]);

  return (
    <AgencyModeContext.Provider value={value}>
      {children}
    </AgencyModeContext.Provider>
  );
}

export function useAgencyMode() {
  const context = useContext(AgencyModeContext);
  if (!context) {
    throw new Error("useAgencyMode must be used within an AgencyModeProvider");
  }
  return context;
}
