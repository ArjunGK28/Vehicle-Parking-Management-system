import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ROLES, ROLE_HOME } from '../../auth/roles.js';
import { SLOT_TYPE_LABELS } from '../../slots.js';
import AppLayout from '../../components/AppLayout.jsx';
import SelectField from '../../components/SelectField.jsx';

const PAGE_SIZE = 20;

// 8100 seconds -> "2 h 15 min"
function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '< 1 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// FR-11 / UC-11: completed parking sessions, newest first, 20 to a page.
// A driver sees their own history; an administrator picks a driver first.
// The table only shows records: past sessions cannot be edited (DR-10).
export default function ParkingHistoryPage() {
  const { user } = useAuth();
  const isAdmin = user.role === ROLES.ADMIN;

  const [drivers, setDrivers] = useState(null); // admin only
  const [selected, setSelected] = useState(''); // "u<id>" or ''
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin) return undefined;
    let active = true;
    api.listUsers({ role: ROLES.DRIVER })
      .then((result) => active && setDrivers(result.users))
      .catch((err) => {
        if (!active) return;
        setDrivers([]);
        setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const targetId = isAdmin ? Number(selected.slice(1)) || null : user.id;

  useEffect(() => {
    if (!targetId) return undefined;
    let active = true;
    setData(null);
    setError('');
    const request = isAdmin ? api.userHistory(targetId, page, PAGE_SIZE) : api.myHistory(page, PAGE_SIZE);
    request
      .then((result) => active && setData(result))
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [isAdmin, targetId, page]);

  function pickDriver(e) {
    setSelected(e.target.value);
    setPage(1);
    setData(null);
  }

  const driverOptions = { '': 'Choose a driver' };
  for (const d of drivers || []) driverOptions[`u${d.id}`] = `${d.name} (${d.email})`;

  return (
    <AppLayout>
      <section className="panel">
        <p><Link to={ROLE_HOME[user.role] || '/dashboard'}>← Dashboard</Link></p>
        <h2>Parking history</h2>
        <p className="muted">
          {isAdmin ? 'Completed sessions of the driver you choose.' : 'Your completed parking sessions, newest first.'}
        </p>

        {isAdmin && (
          <form onSubmit={(e) => e.preventDefault()} noValidate>
            <SelectField label="Driver" name="driver" options={driverOptions} value={selected} onChange={pickDriver} />
          </form>
        )}

        {error && <p className="alert alert-error" role="alert">{error}</p>}
        {isAdmin && !targetId && drivers && drivers.length === 0 && !error && <p className="muted">There are no drivers yet.</p>}
        {targetId && data === null && !error && <p className="muted">Loading history…</p>}

        {data && (
          <>
            {isAdmin && <p className="muted">{data.user.name} ({data.user.email})</p>}
            <p className="muted">
              {data.total} {data.total === 1 ? 'session' : 'sessions'}, total fees ₹{data.totalFee}
            </p>

            {data.total === 0 && (
              <p className="muted">{isAdmin ? 'This user has no parking history yet.' : 'No parking history yet. Your completed sessions will appear here.'}</p>
            )}

            {data.sessions.length > 0 && (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Vehicle</th>
                      <th scope="col">Slot</th>
                      <th scope="col">Entry</th>
                      <th scope="col">Exit</th>
                      <th scope="col">Duration</th>
                      <th scope="col">Fee</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessions.map((s) => (
                      <tr key={s.id}>
                        <td><strong>{s.registrationNumber}</strong></td>
                        <td>{s.slotCode} <span className="muted small-text">({SLOT_TYPE_LABELS[s.slotType] || s.slotType})</span></td>
                        <td>{s.entryTime}</td>
                        <td>{s.exitTime}</td>
                        <td>{formatDuration(s.durationSeconds)}</td>
                        <td>₹{s.fee}</td>
                        <td>
                          <span className="status">Completed</span>{' '}
                          <span className={`status ${s.paymentStatus === 'paid' ? 'status-available' : ''}`}>
                            {s.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.totalPages > 1 && (
              <nav className="pager" aria-label="History pages">
                <button type="button" className="secondary small" onClick={() => setPage(page - 1)} disabled={page <= 1}>Previous</button>
                <span className="muted">Page {data.page} of {data.totalPages}</span>
                <button type="button" className="secondary small" onClick={() => setPage(page + 1)} disabled={page >= data.totalPages}>Next</button>
              </nav>
            )}
          </>
        )}
      </section>
    </AppLayout>
  );
}