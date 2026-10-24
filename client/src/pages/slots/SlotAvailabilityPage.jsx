import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ROLE_HOME } from '../../auth/roles.js';
import { SLOT_STATUS_LABELS, SLOT_STATUS_ORDER, SLOT_TYPE_LABELS } from '../../slots.js';
import AppLayout from '../../components/AppLayout.jsx';
import SelectField from '../../components/SelectField.jsx';
import './slots.css';

const REFRESH_MS = 5000;
const STATUS_OPTIONS = { '': 'All statuses', ...SLOT_STATUS_LABELS };
const TYPE_OPTIONS = { '': 'All types', ...SLOT_TYPE_LABELS };

// FR-03: every role sees the live status of each slot and can filter by status.
// The list refreshes itself every few seconds. Those refreshes are marked as background,
// so an idle session still expires after 15 minutes (NFR-14).
export default function SlotAvailabilityPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({ status: '', type: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load(background) {
      try {
        const result = await api.listSlots(filters, { background });
        if (!active) return;
        setData(result);
        setError('');
        setUpdatedAt(new Date());
      } catch (err) {
        if (active) setError(err.message);
      }
    }

    load(false);
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [filters, refreshKey]);

  function update(e) {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  }

  const filtering = Boolean(filters.status || filters.type);

  return (
    <AppLayout>
      <section className="panel">
        <p><Link to={ROLE_HOME[user.role] || '/dashboard'}>← Dashboard</Link></p>
        <h2>Slot availability</h2>
        <p className="muted">
          Updates every {REFRESH_MS / 1000} seconds{updatedAt && `. Last updated ${updatedAt.toLocaleTimeString()}`}.
        </p>

        {error && <p className="alert alert-error" role="alert">{error}</p>}

        {data && (
          <ul className="slot-summary" aria-label="Slots by status">
            {SLOT_STATUS_ORDER.map((status) => (
              <li key={status}>
                <span className={`status status-${status}`}>{SLOT_STATUS_LABELS[status]}</span>
                <strong>{data.counts[status]}</strong>
              </li>
            ))}
          </ul>
        )}

        <form className="inline-form" onSubmit={(e) => e.preventDefault()} noValidate>
          <SelectField label="Status" name="status" options={STATUS_OPTIONS} value={filters.status} onChange={update} />
          <SelectField label="Slot type" name="type" options={TYPE_OPTIONS} value={filters.type} onChange={update} />
          <button type="button" className="secondary" onClick={() => setRefreshKey((k) => k + 1)}>Refresh now</button>
        </form>

        {data === null && !error && <p className="muted">Loading slots…</p>}
        {data && data.slots.length === 0 && (
          <p className="muted">{filtering ? 'No slots match these filters.' : 'There are no slots yet.'}</p>
        )}
        {data && data.slots.length > 0 && (
          <ul className="slot-grid">
            {data.slots.map((slot) => (
              <li key={slot.id} className="slot-tile">
                <strong>{slot.code}</strong>
                <span className="muted">{SLOT_TYPE_LABELS[slot.type] || slot.type}</span>
                <span className={`status status-${slot.status}`}>{SLOT_STATUS_LABELS[slot.status] || slot.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppLayout>
  );
}