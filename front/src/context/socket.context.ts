import { createContext, useContext } from 'react';
import type { Socket } from 'socket.io-client';

export interface SocketContextValue {
  /** null mientras no hay sesión: el gateway exige un JWT en el handshake. */
  socket: Socket | null;
  isConnected: boolean;
  /**
   * Se une al room de una conversación para recibir sus mensajes completos.
   * Devuelve el cleanup que abandona el room.
   */
  subscribeToChat: (chatId: string) => () => void;
}

export const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export const useSocket = (): SocketContextValue => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket tiene que usarse adentro de <SocketProvider>.');
  return context;
};
