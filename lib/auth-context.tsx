"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { getOrCreateDeviceKey } from "@/lib/device-key";
import { getOrCreateUser } from "@/app/actions/user";

interface AuthContextType {
  userId: string | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  userId: null,
  isLoading: true,
});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function initUser() {
      try {
        const deviceKey = getOrCreateDeviceKey();
        const user = await getOrCreateUser(deviceKey);
        setUserId(user.id);
      } catch (error) {
        console.error("Failed to initialize user:", error);
      } finally {
        setIsLoading(false);
      }
    }

    initUser();
  }, []);

  return (
    <AuthContext.Provider value={{ userId, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
