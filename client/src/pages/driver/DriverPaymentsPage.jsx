import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import AppLayout from '../../components/AppLayout.jsx';
import PaymentForm from '../payments/PaymentForm.jsx';

// FR-10 / UC-10: the driver's stays whose exit is recorded but not paid yet, each with a
// Pay button that opens the payment form for that session (#42). Paying here completes
// the stay and frees the slot, the same as paying the attendant at the exit (UC-08).
export default function DriverPaymentsPage() {
  const [sessions, setSessions] = useState(null);
  const [payingId, setPayingId] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    api.unpaidSessions()
      .then((data) => setSessions(data.sessions))
      .catch((err) => {
        setSessions([]);
        setNotice({ error: true, text: err.message });
      });
  }, []);

  function startPaying(session) {
    setPayingId(session.id);
    setNotice(null);
  }

  function paid(data) {
    setSessions((current) => current.filter((s) => s.id !== data.session.id));
    setPayingId(null);
    setNotice({ text: data.message });
  }

  return (
    <AppLayout>
      <section className="panel">
        <p><Link to="/driver">← Driver dashboard</Link></p>
        <h2>Payments</h2>
        <p className="muted">Stays whose exit is recorded but not paid yet, newest first. Cash is paid to the attendant at the exit.</p>

        {notice && (
          <p className={`alert ${notice.error ? 'alert-error' : 'alert-success'}`} role={notice.error ? 'alert' : 'status'}>
            {notice.text}
          </p>
        )}

        <h3 className="section-title">Unpaid sessions</h3>
        {sessions === null && <p className="muted">Loading sessions…</p>}
        {sessions?.length === 0 && <p className="muted">Nothing to pay. All your sessions are paid.</p>}
        {sessions?.length > 0 && (
          <ul className="vehicle-list vehicle-cards">
            {sessions.map((s) => (
              <li key={s.id} className={payingId === s.id ? 'is-editing' : ''}>
                <span>
                  <strong>{s.registrationNumber}</strong>{' '}
                  <span className="muted">{s.slotCode}, left {s.exitTime}, ₹{s.fee}</span>
                </span>
                {payingId === s.id ? (
                  <button type="button" className="secondary small" onClick={() => setPayingId(null)}>Cancel</button>
                ) : (
                  <button type="button" className="small" onClick={() => startPaying(s)} aria-label={`Pay ₹${s.fee} for ${s.registrationNumber}`}>
                    Pay
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* One form at a time, so its field ids stay unique; key resets it per session. */}
        {sessions?.some((s) => s.id === payingId) && (
          <PaymentForm key={payingId} session={sessions.find((s) => s.id === payingId)} onPaid={paid} />
        )}
      </section>
    </AppLayout>
  );
}
