import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/auth.context';

/**
 * Aterrizaje mínimo del login. Es un placeholder hasta que exista el dashboard:
 * sirve para ver que la sesión quedó activa y para poder cerrarla.
 */
export default function HomePage() {
  const { user, status, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-shell px-4">
        <p className="text-sm text-textMuted">Cargando tu sesión…</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-shell px-4 py-10">
      <div
        className="pointer-events-none absolute h-72 w-72 rounded-full bg-gold/20 blur-3xl"
        aria-hidden
      />

      <div className="relative w-full max-w-md rounded-3xl border border-goldLight/25 bg-card p-7 shadow-2xl shadow-black/40 sm:p-9">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-poppins text-sm font-semibold text-goldLight/80">OmniDesk</p>
            <h1 className="mt-1 font-poppins text-2xl font-bold text-goldLight">
              Hola, {user.fullName}
            </h1>
          </div>
          <span className="whitespace-nowrap rounded-full bg-gold/15 px-3 py-1 text-xs font-medium text-goldLight">
            {user.role === 'ADMIN' ? 'Administrador' : 'Empleado'}
          </span>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-textMuted">
          Tu sesión está activa. El panel de gestión todavía está en construcción.
        </p>

        <dl className="mt-6 divide-y divide-goldLight/10 border-y border-goldLight/10">
          <div className="flex items-center justify-between py-3">
            <dt className="text-sm text-textMuted">Email</dt>
            <dd className="text-sm font-medium text-text">{user.email}</dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-6 w-full rounded-full border border-goldLight/30 py-3 text-sm font-semibold text-goldLight transition hover:bg-goldLight/10 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
