import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PaymentPage from '@/pages/payments/PaymentPage';
import PaymentSuccessPage from '@/pages/payments/PaymentSuccessPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/payment/form/:reservationId" element={<PaymentPage />} />
        {/* sin id de reserva no hay nada que mostrar: la pantalla avisa que falta el link */}
        <Route path="/payment/form" element={<PaymentPage />} />

        {/* vuelta de Mercado Pago; el back redirige acá después de confirmar el pago */}
        <Route path="/payment/success/:reservationId" element={<PaymentSuccessPage />} />
        <Route path="/payment/success" element={<PaymentSuccessPage />} />

        <Route path="*" element={<Navigate to="/payment/form" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
