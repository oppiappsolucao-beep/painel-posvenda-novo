import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { AuthUser, getMe, login as apiLogin, logout as apiLogout, verify2fa as apiVerify2fa, LoginResult, isLoginPending2fa } from "../lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string, role?: "financeiro") => Promise<LoginResult>;
  verify2fa: (challengeId: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: "operacao" | "financeiro") => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const syncSession = () => {
      getMe()
        .then(setUser)
        .catch(() => setUser(null));
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncSession();
    };
    window.addEventListener("focus", syncSession);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", syncSession);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const login = async (username: string, password: string, role?: "financeiro") => {
    const result = await apiLogin(username, password, role);
    if (!isLoginPending2fa(result)) {
      setUser(result);
    }
    return result;
  };

  const verify2fa = async (challengeId: string, code: string) => {
    const userData = await apiVerify2fa(challengeId, code);
    setUser(userData);
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  const hasRole = (role: "operacao" | "financeiro") => {
    if (!user) return false;
    if (user.roles.includes(role)) return true;
    const email = user.username.trim().toLowerCase();
    return role === "financeiro" && email === "controle@skoobpet.com.br";
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, verify2fa, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
