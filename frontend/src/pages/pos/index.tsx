import React from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import POSDashboard from './dashboard';
import POSBookingDetail from './booking-detail';
import POSMenuManagement from './menu-management';

/**
 * POS Routes
 * Requires authenticated user with ADMIN, STAFF, or SALES role
 */
export default function POSRoutes() {
  const { user, isLoading } = useAuth();

  // Wait for auth to finish loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-300">Loading...</p>
      </div>
    );
  }

  // Require authentication and ADMIN, STAFF, or SALES role
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'ADMIN' && user.role !== 'STAFF' && user.role !== 'SALES') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-600 mb-4">You need staff or admin privileges to access the POS system.</p>
          <button
            onClick={() => window.history.back()}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="dashboard" element={<POSDashboard />} />
      <Route path="booking/:id" element={<BookingDetailWrapper />} />
      <Route path="menu" element={<MenuManagementWrapper />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
}

// Wrapper to extract route param and provide onBack navigation
function BookingDetailWrapper() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return <Navigate to="/pos/dashboard" replace />;
  return <POSBookingDetail bookingId={id} onBack={() => navigate('/pos/dashboard')} />;
}

// Wrapper to provide onBack navigation
function MenuManagementWrapper() {
  const navigate = useNavigate();
  const { user } = useAuth();
  if (user?.role === 'SALES') return <Navigate to="/pos/dashboard" replace />;
  return <POSMenuManagement onBack={() => navigate('/pos/dashboard')} />;
}
