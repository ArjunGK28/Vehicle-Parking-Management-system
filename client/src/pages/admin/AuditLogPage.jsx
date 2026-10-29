import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import AppLayout from '../../components/AppLayout.jsx';
import SelectField from '../../components/SelectField.jsx';

// Mirrors server/src/modules/audit/auditActions.js
const ACTION_LABELS = {
  slot_added: 'Slot added',
  slot_disabled: 'Slot disabled',
  slot_enabled: 'Slot enabled',
  rate_changed: 'Rate changed',
  user_added: 'User added',
  user_removed: 'User removed',
  vehicle_updated: 'Vehicle updated',
  vehicle_removed: 'Vehicle removed',
};
const ACTION_FILTERS = { '': 'All actions', ...ACTION_LABELS };
const PAGE_SIZE = 25;

// NFR-16 / NFR-17: who changed what, and when. Only administrators reach this page.
export default function AuditLogPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api.listAuditLog({ action, page, pageSize: PAGE_SIZE })
      .then(setData)
      .catch((err) => {
        setData({ entries: [], page: 1, pageSize: PAGE_SIZE, total: 0 });
        setError(err.message);
      });
  }, [action, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <AppLayout>
      <section className="panel">
        <p><Link to="/admin">← Administrator dashboard</Link></p>
        <h2>Audit log</h2>
        <p className="muted">Every slot, rate, user and vehicle change made by an administrator, newest first.</p>

        <div className="form-grid filters">
          <SelectField
            label="Action"
            name="action"
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            options={ACTION_FILTERS}
          />
        </div>

        {error && <p className="alert alert-error" role="alert">{error}</p>}
        {data === null && <p className="muted">Loading the audit log…</p>}
        {data?.entries.length === 0 && !error && <p className="muted">No actions recorded yet.</p>}
        {data?.entries.length > 0 && (
          <>
            <div className="table-scroll">
              <table className="data-table audit-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Administrator</th>
                    <th scope="col">Action</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{String(entry.createdAt).slice(0, 16)}</td>
                      <td>
                        {entry.adminName}
                        <span className="muted small-text show-narrow">{entry.adminEmail}</span>
                      </td>
                      <td><span className="badge">{ACTION_LABELS[entry.action] || entry.action}</span></td>
                      <td>{entry.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="pager" aria-label="Audit log pages">
              <button type="button" className="secondary small" onClick={() => setPage(page - 1)} disabled={page <= 1}>Previous</button>
              <span className="muted">Page {data.page} of {totalPages} ({data.total} actions)</span>
              <button type="button" className="secondary small" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>Next</button>
            </nav>
          </>
        )}
      </section>
    </AppLayout>
  );
}
