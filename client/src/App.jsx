import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import RequireAuth, { GuestOnly } from './auth/RequireAuth.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
          <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
