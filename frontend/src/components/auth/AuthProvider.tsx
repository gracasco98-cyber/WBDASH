"use client";
import {
  createContext, useContext, useEffect, useState, useCallback,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { getMe, logout as apiLogout, type AuthUser } from "@/lib/auth";

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthContextValue {
  user:    AuthUser | null;
  loading: boolean;
  logout:  () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user:    null,
  loading: true,
  logout:  async () => {},
  refresh: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router   = useRouter();
  const pathname = usePathname();

  const isPublic = pathname === "/login";

  const refresh = useCallback(async () => {
    if (isPublic) { setLoading(false); return; }

    try {
      const { data, error } = await getMe();
      if (error || !data?.user) {
        setUser(null);
        router.replace(`/login?from=${encodeURIComponent(pathname)}`);
      } else {
        setUser(data.user);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [isPublic, pathname, router]);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    router.replace("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
