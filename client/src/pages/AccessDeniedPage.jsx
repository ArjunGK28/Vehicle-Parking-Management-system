import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { ROLE_HOME, ROLE_LABELS } from '../auth/roles.js';

// Shown when a logged-in user opens a page their role may not use (NFR-11).
export default function AccessDeniedPage() {
  const { user } = useAuth();
  return (
    <main className="auth-card">
      <h1>Access denied</h1>
      <p className="alert alert-error" role="alert">
        This page is not available to the {ROLE_LABELS[user.role] || user.role} role.
      </p>
      <p className="muted">
        <Link to={ROLE_HOME[user.role] || '/login'}>Go to your dashboard</Link>
      </p>
    </main>
  );
}
