import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { toast } from "@/hooks/use-toast"

interface User {
  id: string
  name: string
  email: string
  role?: string  // ADMIN | USER
  phone?: string
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, phone: string, password: string, dateOfBirth: string) => Promise<{ message: string; expiresAt?: string }>
  logout: () => Promise<void>
  isLoading: boolean
  resendVerification: (email: string) => Promise<{ message: string; expiresAt?: string; retryAfterSeconds?: number }>
  forgotPassword: (email: string) => Promise<{ message: string; retryAfterSeconds?: number }>
  resetPassword: (email: string, token: string, password: string) => Promise<{ message: string }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Revalidate session from server; clear user on 401 or non-OK
  const revalidate = useCallback(async () => {
    try {
      const apiBase = process.env.REACT_APP_API_BASE !== undefined ? process.env.REACT_APP_API_BASE : 'http://localhost:8080';
      const res = await fetch(`${apiBase}/api/auth/me`, { credentials: 'include' });
    if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        // 401 or any non-OK → treat as signed out
        if (user) {
          toast({ title: 'Session expired', description: 'Please log in again.' })
      try { window.dispatchEvent(new CustomEvent('auth-expired')) } catch {}
        }
        setUser(null);
      }
    } catch {
      // Network issues: do not flip user eagerly, but avoid claiming logged-in if never loaded
      if (user === null) setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [user])

  // Initial load
  useEffect(() => {
    revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Revalidate on focus/visibility/online and periodically
  useEffect(() => {
    const onFocus = () => revalidate();
    const onVis = () => { if (!document.hidden) revalidate(); };
    const onOnline = () => revalidate();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    const intervalId = window.setInterval(revalidate, 5 * 60 * 1000); // every 5 minutes
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      window.clearInterval(intervalId);
    };
  }, [revalidate])

  // Centralized helper: prefer backend-provided message
  const getErrorMessage = async (res: Response): Promise<string> => {
    if (res.status === 401) {
      if (user) {
        toast({ title: 'Session expired', description: 'Please log in again.' })
        try { window.dispatchEvent(new CustomEvent('auth-expired')) } catch {}
      }
      setUser(null)
    }
    try {
      const data: any = await res.json()
      if (typeof data?.message === 'string' && data.message) return data.message
      if (typeof data?.error === 'string' && data.error) return data.error
      const flatForm = data?.error?.formErrors
      if (Array.isArray(flatForm) && flatForm.length) return flatForm.join(' ')
      const fieldErrors = data?.error?.fieldErrors
      if (fieldErrors && typeof fieldErrors === 'object') {
        const messages = Object.values(fieldErrors).flat().filter(Boolean)
        if (messages.length) return messages.join(' ')
      }
    } catch {
      // ignore JSON parse errors
    }
    return res.status === 401 ? 'Unauthorized' : res.statusText || 'Request failed'
  }

  const login = async (email: string, password: string) => {
    const apiBase = process.env.REACT_APP_API_BASE !== undefined ? process.env.REACT_APP_API_BASE : 'http://localhost:8080';
    const res = await fetch(`${apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) throw new Error(await getErrorMessage(res));
    const data = await res.json();
    setUser(data.user);
  }

  const signup = async (name: string, email: string, phone: string, password: string, dateOfBirth: string) => {
    const apiBase = process.env.REACT_APP_API_BASE !== undefined ? process.env.REACT_APP_API_BASE : 'http://localhost:8080';
    const res = await fetch(`${apiBase}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, email, phone, password, dateOfBirth })
    });
    if (!res.ok) throw new Error(await getErrorMessage(res));
    const data = await res.json();
    // No user set yet; waiting for verification
    return data;
  }

  const resendVerification = async (email: string): Promise<{ message: string; expiresAt?: string; retryAfterSeconds?: number }> => {
    const apiBase = process.env.REACT_APP_API_BASE !== undefined ? process.env.REACT_APP_API_BASE : 'http://localhost:8080';
    const res = await fetch(`${apiBase}/api/auth/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email })
    });
    if (!res.ok) {
      // 429 or 400 returns generic message; surface best effort
      const data = await res.json().catch(()=>({message:'Please try again shortly.'}));
      return data;
    }
    const data = await res.json();
    return data;
  }

  const forgotPassword = async (email: string): Promise<{ message: string; retryAfterSeconds?: number }> => {
    const apiBase = process.env.REACT_APP_API_BASE !== undefined ? process.env.REACT_APP_API_BASE : 'http://localhost:8080';
    const res = await fetch(`${apiBase}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => ({ message: 'Please try again shortly.' }));
    if (!res.ok && res.status !== 429) throw new Error(data.message || data.error || 'Request failed');
    return data;
  }

  const resetPassword = async (email: string, token: string, password: string): Promise<{ message: string }> => {
    const apiBase = process.env.REACT_APP_API_BASE !== undefined ? process.env.REACT_APP_API_BASE : 'http://localhost:8080';
    const res = await fetch(`${apiBase}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, password })
    });
    if (!res.ok) throw new Error(await getErrorMessage(res));
    return await res.json();
  }

  const logout = async () => {
    setUser(null);
    const apiBase = process.env.REACT_APP_API_BASE !== undefined ? process.env.REACT_APP_API_BASE : 'http://localhost:8080';
    try {
      await fetch(`${apiBase}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      // ignore network errors; user is cleared locally
    }
  }

  return <AuthContext.Provider value={{ user, login, signup, logout, isLoading, resendVerification, forgotPassword, resetPassword }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
