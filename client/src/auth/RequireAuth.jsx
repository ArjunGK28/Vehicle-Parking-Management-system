import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import AccessDeniedPage from '../pages/AccessDeniedPage.jsx';

// Wraps pages that need a logged-in user; others are sent to the login page.
// With `roles`, only those roles may see the page and everyone else gets Access denied.
// The server checks roles again on every request; this only keeps the UI honest.
export default function RequireAuth({ roles, children }) {
  const { user, checking } = useAuth();
  if (checking) return <p className="loading">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <AccessDeniedPage />;
  return children;
}

// Wraps the login and register pages: a logged-in user goes straight to the dashboard.
export function GuestOnly({ children }) {
  const { user, checking } = useAuth();
  if (checking) return <p className="loading">Loading…</p>;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}
