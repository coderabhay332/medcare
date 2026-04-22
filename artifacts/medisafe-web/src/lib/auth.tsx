import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, type AuthTokens } from "./api";

interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; age?: number; conditions?: string[]; allergies?: string[] }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("medisafe_token");
    const storedUser = localStorage.getItem("medisafe_user");
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        localStorage.removeItem("medisafe_token");
        localStorage.removeItem("medisafe_user");
      }
    }
    setIsLoading(false);
  }, []);

  const persist = useCallback((data: AuthTokens) => {
    // API returns { token, patient } — map to local { token, user }
    const userObj = data.patient;
    localStorage.setItem("medisafe_token", data.token);
    localStorage.setItem("medisafe_user", JSON.stringify(userObj));
    setToken(data.token);
    setUser(userObj);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.auth.login({ email, password });
    persist(data);
  }, [persist]);

  const register = useCallback(async (body: { name: string; email: string; password: string; age?: number; conditions?: string[]; allergies?: string[] }) => {
    const data = await api.auth.register(body);
    persist(data);
  }, [persist]);

  const logout = useCallback(() => {
    localStorage.removeItem("medisafe_token");
    localStorage.removeItem("medisafe_user");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
