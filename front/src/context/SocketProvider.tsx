import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SocketContext, type SocketContextValue } from '@/context/socket.context';
import { useAuth } from '@/context/auth.context';
import { API_BASE_URL, getAccessToken, setAccessToken } from '@/config/api';
import { refreshSession } from '@/services/auth.service';

/**
 * Conexión al gateway `/ws/chats` (US-11). Vive mientras haya sesión: el handshake
 * manda el access token y el back desconecta a cualquiera sin JWT válido.
 */
export default function SocketProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // El helper de subscribe lee de acá para no cambiar de identidad en cada reconexión.
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;

    /**
     * `auth` como función y no como objeto: socket.io la vuelve a llamar en cada intento
     * de reconexión, así el token que viaja es siempre el último que dejó el interceptor
     * de axios y no el que había al montar.
     */
    const instance = io(`${API_BASE_URL}/ws/chats`, {
      withCredentials: true,
      auth: (cb) => cb({ token: getAccessToken() }),
    });

    socketRef.current = instance;
    setSocket(instance);

    /**
     * El access token dura 15 minutos. Si la pestaña queda quieta y vence, el gateway
     * responde `auth:error` y corta; renovarlo y reconectar a mano es lo que evita que el
     * panel se quede mudo (el server cortó, así que socket.io no reintenta solo).
     *
     * El intervalo mínimo entre renovaciones no es cosmético: el gateway valida el token
     * DESPUÉS de aceptar la conexión, así que un token que no sirve produce
     * `connect` → `auth:error` → reconexión, y sin este freno eso es un bucle cerrado
     * martillando /auth/refresh. Con 30s el vencimiento normal (cada 15 min) se resuelve
     * igual y un token que el gateway rechaza siempre deja de ser un spin.
     */
    const MIN_REFRESH_INTERVAL_MS = 30_000;
    let lastRefreshAt = 0;

    const handleConnect = () => setIsConnected(true);

    const handleDisconnect = () => setIsConnected(false);

    const handleAuthError = () => {
      const now = Date.now();
      if (now - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) return;
      lastRefreshAt = now;

      // refreshSession tiene single-flight: no compite con el refresh que pueda estar
      // haciendo el interceptor de axios en paralelo, y un doble refresh cerraría la sesión.
      refreshSession()
        .then(({ accessToken }) => {
          setAccessToken(accessToken);
          instance.connect();
        })
        .catch(() => undefined); // Sin sesión no hay nada que reintentar; el 401 del REST la cierra.
    };

    instance.on('connect', handleConnect);
    instance.on('disconnect', handleDisconnect);
    instance.on('auth:error', handleAuthError);

    return () => {
      instance.off('connect', handleConnect);
      instance.off('disconnect', handleDisconnect);
      instance.off('auth:error', handleAuthError);
      instance.disconnect();

      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    };
  }, [status]);

  const subscribeToChat = useCallback((chatId: string) => {
    const instance = socketRef.current;
    if (!instance) return () => undefined;

    instance.emit('chat:subscribe', { chatId });

    return () => {
      instance.emit('chat:unsubscribe', { chatId });
    };
  }, []);

  const value = useMemo<SocketContextValue>(
    () => ({ socket, isConnected, subscribeToChat }),
    [socket, isConnected, subscribeToChat],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
