import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import RequireAuth, { GuestOnly } from './auth/RequireAuth.jsx';
import { ROLES, ROLE_HOME } from './auth/roles.js';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';
import DriverHome from './pages/driver/DriverHome.jsx';
import AttendantHome from './pages/attendant/AttendantHome.jsx';
import AdminHome from './pages/admin/AdminHome.jsx';
import SlotsPage from './pages/admin/SlotsPage.jsx';
import RatesPage from './pages/admin/RatesPage.jsx';
import SlotAvailabilityPage from './pages/slots/SlotAvailabilityPage.jsx';
import LocateVehiclePage from './pages/staff/LocateVehiclePage.jsx';

// /dashboard sends each user to their own role's home page.
function RoleHome() {
  const { user } = useAuth();
  return <Navigate to={ROLE_HOME[user.role] || '/login'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
          <Route path="/dashboard" element={<RequireAuth><RoleHome /></RequireAuth>} />
          <Route path="/driver" element={<RequireAuth roles={[ROLES.DRIVER]}><DriverHome /></RequireAuth>} />
          <Route path="/attendant" element={<RequireAuth roles={[ROLES.ATTENDANT]}><AttendantHome /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth roles={[ROLES.ADMIN]}><AdminHome /></RequireAuth>} />
          <Route path="/admin/slots" element={<RequireAuth roles={[ROLES.ADMIN]}><SlotsPage /></RequireAuth>} />
          <Route path="/admin/rates" element={<RequireAuth roles={[ROLES.ADMIN]}><RatesPage /></RequireAuth>} />
          <Route path="/slots" element={<RequireAuth><SlotAvailabilityPage /></RequireAuth>} />
          <Route path="/track" element={<RequireAuth roles={[ROLES.ATTENDANT, ROLES.ADMIN]}><LocateVehiclePage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}