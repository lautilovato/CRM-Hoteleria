import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthContext } from '@/context/auth.context';
import { setAccessToken } from '@/config/api';
import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession,
} from '@/services/auth.service';
import type { AuthContextValue, AuthStatus, AuthUser, LoginCredentials } from '@/config/types';

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('checking');

  /**
   * Al recargar la página el token en memoria se pierde, pero la cookie httpOnly del
   * refresh sigue viva: se intenta restaurar la sesión una sola vez al montar.
   * El single-flight que protege contra el doble montaje de StrictMode está en
   * `refreshSession`, no acá.
   */
  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const { accessToken } = await refreshSession();
        setAccessToken(accessToken);

        // /auth/refresh devuelve solo el token, sin el usuario: hace falta el segundo viaje.
        const currentUser = await getCurrentUser();
        if (cancelled) return;

        setUser(currentUser);
        setStatus('authenticated');
      } catch {
        // Sin cookie válida simplemente no hay sesión que restaurar; no es un error.
        if (cancelled) return;

        setAccessToken(null);
        setUser(null);
        setStatus('anonymous');
      }
    };

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials: LoginCredentials): Promise<AuthUser> => {
    // Sin try/catch: el error sube al formulario, que es quien sabe cómo mostrarlo.
    const session = await loginRequest(credentials);

    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus('authenticated');

    return session.user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    // Si el back no responde, la sesión local se cierra igual: dejar al usuario
    // adentro porque falló la red sería peor.
    await logoutRequest().catch(() => undefined);

    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, isAuthenticated: status === 'authenticated', login, logout }),
    [user, status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
