import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import HomePage from './pages/home'
import AdminPage from './pages/admin'
import CustomerManagementPage from './pages/admin/customers'
import ReceiptAnalysisPage from './pages/admin/receipt-analysis'
import BookingPage from './pages/booking'
import BookingConfirmationPage from './pages/booking-confirmation'
import DashboardPage from './pages/dashboard'
import LoginPage from './pages/login'
import SignUpPage from './pages/signup'
import VerifyPage from './pages/verify'
import ForgotPasswordPage from './pages/forgot-password'
import ResetPasswordPage from './pages/reset-password'
import CouponPage from './pages/coupon'
import POSRoutes from './pages/pos'
import ReceiptTestPage from './pages/receipt-test'
import { AuthProvider } from '../hooks/use-auth'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '../components/theme-provider'

function AppRoutes() {
  const navigate = useNavigate();
  // redirect to home on auth-expired
  React.useEffect(() => {
    const onExpired = () => navigate('/', { replace: true });
    window.addEventListener('auth-expired', onExpired as EventListener);
    return () => window.removeEventListener('auth-expired', onExpired as EventListener);
  }, [navigate]);
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/customers" element={<CustomerManagementPage />} />
        <Route path="/admin/receipt-analysis" element={<ReceiptAnalysisPage />} />
        <Route path="/booking" element={<BookingPage />} />
        <Route path="/booking/confirmation/:id" element={<BookingConfirmationPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/pos/*" element={<POSRoutes />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/receipt-test" element={<ReceiptTestPage />} />
        <Route path="/coupon/:code" element={<CouponPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default function App() {
  console.log(process.env.REACT_APP_API_BASE);
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
