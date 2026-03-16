import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface User {
  id: number;
  email: string;
  role: string;
  subscription: string;
  organization?: string;
  mfaEnabled: boolean;
  createdAt: string;
}

interface Usage {
  transcriptions: number;
  videos: number;
  limits: {
    transcriptions: number;
    videos: number;
  };
}

type UpgradeModalType = "transcriptions" | "videos" | "podcast" | "simplify";

interface AuthContextType {
  user: User | null;
  usage: Usage | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, mfaCode?: string) => Promise<{ success: boolean; mfaRequired?: boolean; emailNotVerified?: boolean; email?: string; error?: string }>;
  register: (
    email: string,
    password: string,
    organization?: string,
    consentGiven?: boolean,
    consentVersion?: string
  ) => Promise<{ success: boolean; requiresVerification?: boolean; error?: string; details?: string[] }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  // Upgrade modal
  showUpgradeModal: boolean;
  upgradeModalType: UpgradeModalType;
  openUpgradeModal: (type?: UpgradeModalType) => void;
  closeUpgradeModal: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Upgrade modal state
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalType, setUpgradeModalType] = useState<UpgradeModalType>('transcriptions');

  const openUpgradeModal = useCallback((type: UpgradeModalType = 'transcriptions') => {
    setUpgradeModalType(type);
    setShowUpgradeModal(true);
  }, []);

  const closeUpgradeModal = useCallback(() => {
    setShowUpgradeModal(false);
  }, []);

  const refreshSession = async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      });
      return response.ok;
    } catch (error) {
      console.error('Failed to refresh session:', error);
      return false;
    }
  };

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setUsage(data.usage);
        return true;
      } else if (response.status === 401) {
        const refreshed = await refreshSession();
        if (refreshed) {
          return await fetchUser();
        }
        setUser(null);
        setUsage(null);
        return false;
      } else {
        setUser(null);
        setUsage(null);
        return false;
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      return false;
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      await fetchUser();
      setIsLoading(false);
    };

    initAuth();
  }, []);

  // Keep session fresh for long-lived sessions
  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => {
      refreshSession();
    }, 10 * 60 * 1000); // every 10 minutes

    return () => clearInterval(interval);
  }, [user]);

  const login = async (email: string, password: string, mfaCode?: string): Promise<{ success: boolean; mfaRequired?: boolean; emailNotVerified?: boolean; email?: string; error?: string }> => {
    try {
      // Corporate proxies sometimes break CORS preflight for JSON (application/json) by redirecting OPTIONS
      // requests to an inspection gateway domain. Using form-encoded avoids the preflight in most browsers.
      const body = new URLSearchParams();
      body.set('email', email);
      body.set('password', password);
      if (mfaCode) body.set('mfaCode', mfaCode);

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        if (data.mfaRequired) {
          return { success: false, mfaRequired: true };
        }

        await fetchUser();
        return { success: true };
      } else {
        // Check if email not verified
        if (data.emailNotVerified) {
          return { success: false, emailNotVerified: true, email: data.email, error: data.error };
        }
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Verbindungsfehler' };
    }
  };

  const register = async (
    email: string,
    password: string,
    organization?: string,
    consentGiven: boolean = false,
    consentVersion: string = "1.0"
  ): Promise<{ success: boolean; requiresVerification?: boolean; error?: string; details?: string[] }> => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password, organization, consentGiven, consentVersion }),
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        // Check if email verification is required
        if (data.requiresVerification) {
          return { success: true, requiresVerification: true };
        }

        return { success: true };
      } else {
        return { success: false, error: data.error, details: data.details };
      }
    } catch (error) {
      console.error('Register error:', error);
      return { success: false, error: 'Verbindungsfehler' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setUsage(null);
    }
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        usage,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser,
        showUpgradeModal,
        upgradeModalType,
        openUpgradeModal,
        closeUpgradeModal
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
