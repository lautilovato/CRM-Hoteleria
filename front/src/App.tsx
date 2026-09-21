import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import AuthProvider from '@/context/AuthProvider';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import LoginPage from '@/pages/auth/LoginPage';
import PaymentPage from '@/pages/payments/PaymentPage';
import PaymentSuccessPage from '@/pages/payments/PaymentSuccessPage';
import ReservationsPage from '@/pages/admin/ReservationsPage';
import RoomsPage from '@/pages/admin/RoomsPage';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* rutas del huésped: llega por un link de Telegram y no tiene cuenta */}
          <Route path="/payment/form/:reservationId" element={<PaymentPage />} />
          {/* sin id de reserva no hay nada que mostrar: la pantalla avisa que falta el link */}
          <Route path="/payment/form" element={<PaymentPage />} />

          {/* vuelta de Mercado Pago; el back redirige acá después de confirmar el pago */}
          <Route path="/payment/success/:reservationId" element={<PaymentSuccessPage />} />
          <Route path="/payment/success" element={<PaymentSuccessPage />} />
          {/* rutas de admin/empleado: requieren login */}
          <Route element={<ProtectedRoute />}>
            <Route path="/admin/reservations" element={<ReservationsPage />} />
            <Route path="/admin/rooms" element={<RoomsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
