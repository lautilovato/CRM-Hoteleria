import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/payment/form" element={<div>PaymentForm</div>} />
      </Routes>
    </Router>
  );
}

export default App;