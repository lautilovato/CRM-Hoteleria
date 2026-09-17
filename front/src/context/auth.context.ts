import { createContext, useContext } from 'react';
import type { AuthContextValue } from '@/config/types';

/**
 * Este archivo no exporta componentes a propósito: `react/only-export-components`
 * del oxlint se queja si un módulo mezcla un componente con otros exports. El
 * provider vive aparte, en AuthProvider.tsx.
 */
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth tiene que usarse adentro de <AuthProvider>.');
  }

  return context;
};
