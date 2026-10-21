import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const ROLE_LABELS = { driver: 'Driver', attendant: 'Parking Attendant', admin: 'Administrator' };

// Landing page after login (UC-01 step 4). Role-specific screens go in
// pages/driver, pages/attendant and pages/admin as their stories are built.
export default function DashboardPage() {
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
      <section className="panel">
        <h2>Dashboard</h2>
        <p className="muted">Parking features will appear here as they are added.</p>
      </section>
    </main>
  );
}
