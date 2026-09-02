import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import Navbar from './components/ui/Navbar';
import ProtectedRoute from './components/ui/ProtectedRoute';

// Pages
import LandingPage from './pages/public/LandingPage';
import LoginPage from './pages/public/LoginPage';
import OrgVisitorPage from './pages/public/OrgVisitorPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import MapEditor from './pages/admin/MapEditor';
import QRPrintLayout from './pages/admin/QRPrintLayout';
import SuperAdminDashboard from './pages/super-admin/SuperAdminDashboard';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Navbar />
        <Routes>
          {/* Public routes (no login required) */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Super Admin routes (protected, super_admin only) */}
          <Route
            path="/super-admin"
            element={
              <ProtectedRoute requiredRole="super_admin">
                <SuperAdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Org Admin routes (protected, org_admin only) */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="org_admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/buildings/:buildingId/floors/:floorId/editor"
            element={
              <ProtectedRoute requiredRole="org_admin">
                <MapEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/buildings/:buildingId/floors/:floorId/print-qrs"
            element={
              <ProtectedRoute requiredRole="org_admin">
                <QRPrintLayout />
              </ProtectedRoute>
            }
          />

          {/* Public visitor app (no login, loaded by org slug) */}
          <Route path="/:orgSlug" element={<OrgVisitorPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
