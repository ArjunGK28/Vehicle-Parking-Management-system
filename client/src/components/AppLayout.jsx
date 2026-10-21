import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { ROLE_LABELS } from '../auth/roles.js';

// Page frame for logged-in users: greeting, role badge and logout.
export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Welcome, {user.name}</h1>
          <p className="muted">
            Logged in as {user.email} <span className="badge">{ROLE_LABELS[user.role] || user.role}</span>
          </p>
        </div>
        <button type="button" className="secondary" onClick={handleLogout}>Log out</button>
      </header>
      {children}
    </main>
  );
}
