import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

// Wraps pages that need a logged-in user; others are sent to the login page.
export default function RequireAuth({ children }) {
  const { user, checking } = useAuth();
  if (checking) return <p className="loading">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Wraps the login and register pages: a logged-in user goes straight to the dashboard.
export function GuestOnly({ children }) {
  const { user, checking } = useAuth();
  if (checking) return <p className="loading">Loading…</p>;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}
