import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PaymentPage from '@/pages/payments/PaymentPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/payment/form/:reservationId" element={<PaymentPage />} />
        {/* sin id de reserva no hay nada que mostrar: la pantalla avisa que falta el link */}
        <Route path="/payment/form" element={<PaymentPage />} />
        <Route path="*" element={<Navigate to="/payment/form" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
