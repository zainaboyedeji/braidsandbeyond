import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PaymentCallback from './pages/PaymentCallback';
import Policies from './pages/Policies';
import Book from './pages/Book';
import ManageBooking from './pages/ManageBooking';
import MyAppointments from './pages/MyAppointments';
import AdminDashboard from './pages/AdminDashboard';
import AdminServices from './pages/AdminServices';
import AdminHours from './pages/AdminHours';
import AdminPickup from './pages/AdminPickup';
import { useApp } from './context/AppContext';

export default function App() {
  const { loading } = useApp();

  if (loading) {
    return <div className="page-loading">Loading…</div>;
  }

  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/book" element={<Book />} />
          <Route path="/manage/:token" element={<ManageBooking />} />
          <Route path="/payment/callback" element={<PaymentCallback />} />
          <Route path="/policies" element={<Policies />} />
          <Route
            path="/my-appointments"
            element={
              <ProtectedRoute>
                <MyAppointments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/services"
            element={
              <ProtectedRoute adminOnly>
                <AdminServices />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/hours"
            element={
              <ProtectedRoute adminOnly>
                <AdminHours />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pickup"
            element={
              <ProtectedRoute adminOnly>
                <AdminPickup />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
