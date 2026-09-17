import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import AuthProvider from '@/context/AuthProvider';
import LoginPage from '@/pages/auth/LoginPage';
import HomePage from '@/pages/HomePage';
import PaymentPage from '@/pages/payments/PaymentPage';
import PaymentSuccessPage from '@/pages/payments/PaymentSuccessPage';

function App() {
  return (
    // El provider va adentro del Router para que pueda navegar cuando la sesión caduque.
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/inicio" element={<HomePage />} />

          {/* rutas del huésped: llega por un link de Telegram y no tiene cuenta */}
          <Route path="/payment/form/:reservationId" element={<PaymentPage />} />
          {/* sin id de reserva no hay nada que mostrar: la pantalla avisa que falta el link */}
          <Route path="/payment/form" element={<PaymentPage />} />

          {/* vuelta de Mercado Pago; el back redirige acá después de confirmar el pago */}
          <Route path="/payment/success/:reservationId" element={<PaymentSuccessPage />} />
          <Route path="/payment/success" element={<PaymentSuccessPage />} />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
