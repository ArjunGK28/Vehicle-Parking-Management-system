import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { SLOT_TYPE_LABELS } from '../../slots.js';
import AppLayout from '../../components/AppLayout.jsx';
import Field from '../../components/Field.jsx';
import PaymentForm from '../payments/PaymentForm.jsx';

// How often the waiting list refreshes, so waiting times stay current.
const REFRESH_MS = 30000;

// "135" -> "2 h 15 min"
function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// "ka 01 ab-1234" -> "KA01AB1234", the same cleaning the server does.
const cleanPlate = (value) => value.replace(/[\s-]/g, '').toUpperCase();

// UC-08: the attendant types the registration number at the gate, the exit is recorded
// and the fee is shown straight away (FR-08, FR-09, NFR-02). The session then waits for
// payment; paying completes it and releases the slot. If payment fails (say UPI is down)
// the vehicle stays in "Waiting for payment" below, so when the driver comes back the
// attendant picks it from the list and takes cash.
// Laid out like the Vehicle entry page so the two gate screens work the same way.
export default function VehicleExitPage() {
  const inputRef = useRef(null);
  const [registration, setRegistration] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [notice, setNotice] = useState('');
  const [exit, setExit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [paidMessage, setPaidMessage] = useState('');
  const [failedHint, setFailedHint] = useState(false);
  const [waiting, setWaiting] = useState(null);
  const [waitingError, setWaitingError] = useState('');
  // The one session whose payment form is open (only one form, so field ids stay unique).
  const [paying, setPaying] = useState(null);

  const loadWaiting = useCallback(async () => {
    try {
      const data = await api.awaitingPayments();
      setWaiting(data.sessions);
      setWaitingError('');
      return data.sessions;
    } catch (err) {
      setWaitingError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    loadWaiting();
    const timer = setInterval(loadWaiting, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadWaiting]);

  function resetMessages() {
    setNotice('');
    setPaidMessage('');
    setFailedHint(false);
  }

  async function confirm(e) {
    e.preventDefault();
    setExit(null);
    setPaying(null);
    resetMessages();

    if (!registration.trim()) {
      setFieldError('Enter a registration number');
      inputRef.current?.focus();
      return;
    }
    setFieldError('');

    setSaving(true);
    try {
      const data = await api.exitVehicle(registration);
      setExit(data.session);
      setPaying(data.session);
      setRegistration('');
      loadWaiting();
    } catch (err) {
      if (err.fields && err.fields.registrationNumber) {
        setFieldError(err.fields.registrationNumber);
      } else {
        setNotice(err.message);
        // 409: the exit is already recorded and waiting for payment, so open its payment.
        if (err.status === 409) {
          const sessions = await loadWaiting();
          const match = sessions?.find((s) => s.registrationNumber === cleanPlate(registration));
          if (match) {
            setPaying(match);
            setRegistration('');
          }
        }
      }
    } finally {
      setSaving(false);
      inputRef.current?.focus();
    }
  }

  function startPaying(session) {
    setExit(null);
    resetMessages();
    setPaying(session);
  }

  function paid(data) {
    setPaidMessage(`${data.message} Slot ${data.session.slotCode} is now free.`);
    setFailedHint(false);
    if (exit && exit.id === data.session.id) setExit({ ...exit, paymentStatus: 'paid', status: 'completed' });
    setPaying(null);
    loadWaiting();
  }

  function failed() {
    setFailedHint(true);
    loadWaiting();
  }

  return (
    <AppLayout>
      <section className="panel">
        <p><Link to="/attendant">← Attendant dashboard</Link></p>
        <h2>Vehicle exit</h2>
        <p className="muted">
          Type the registration number and confirm. The fee is shown, and the slot is released once the stay is paid.
        </p>

        <form onSubmit={confirm} noValidate>
          <Field
            label="Registration number"
            name="registrationNumber"
            value={registration}
            onChange={(e) => setRegistration(e.target.value)}
            error={fieldError}
            placeholder="KA01AB1234"
            maxLength={20}
            autoComplete="off"
            autoFocus
            ref={inputRef}
          />
          <button type="submit" disabled={saving}>{saving ? 'Recording exit…' : 'Confirm exit'}</button>
        </form>

        {notice && <p className="alert alert-error" role="alert">{notice}</p>}

        {exit && (
          <>
            <div className="slot-callout" role="status">
              <p className="muted">Exit recorded for {exit.registrationNumber} from {exit.slotCode}</p>
              <p className="slot-callout-code">Fee ₹{exit.fee}</p>
              <p className="muted">
                {exit.paymentStatus === 'paid' ? 'Paid. The slot is free.' : 'Waiting for payment. The slot is released once paid.'}
              </p>
            </div>

            <h3 className="section-title">Exit summary</h3>
            <table className="data-table">
              <tbody>
                <tr><th scope="row">Slot</th><td>{exit.slotCode} ({SLOT_TYPE_LABELS[exit.slotType] || exit.slotType})</td></tr>
                <tr><th scope="row">Entry time</th><td>{exit.entryTime}</td></tr>
                <tr><th scope="row">Exit time</th><td>{exit.exitTime}</td></tr>
                <tr><th scope="row">Billed time</th><td>{formatMinutes(exit.billedMinutes)}</td></tr>
                <tr><th scope="row">Fee</th><td>₹{exit.fee}</td></tr>
                <tr><th scope="row">Payment</th><td>{exit.paymentStatus === 'paid' ? 'Paid' : 'Waiting for payment'}</td></tr>
              </tbody>
            </table>
          </>
        )}

        {/* #42 / FR-10: the attendant takes payment at the gate, cash included. */}
        {paying && (
          <PaymentForm key={paying.id} session={paying} onPaid={paid} onFailed={failed} />
        )}
        {failedHint && (
          <p className="alert alert-error" role="status">
            The vehicle stays in Waiting for payment below. Try again, or take cash when the driver comes back.
          </p>
        )}
        {paidMessage && <p className="alert alert-success" role="status">{paidMessage}</p>}
      </section>

      <section className="panel">
        <h2>Waiting for payment</h2>
        <p className="muted">
          Vehicles whose exit is recorded but not paid, longest wait first. The fee was fixed at exit, so waiting costs nothing extra.
        </p>
        {waitingError && <p className="alert alert-error" role="alert">{waitingError}</p>}
        {waiting === null && !waitingError && <p className="muted">Loading…</p>}
        {waiting?.length === 0 && <p className="muted">No vehicles are waiting to pay.</p>}
        {waiting?.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Vehicle</th>
                  <th scope="col">Slot</th>
                  <th scope="col">Fee</th>
                  <th scope="col">Waiting</th>
                  <th scope="col" className="hide-narrow">Failed tries</th>
                  <th scope="col"><span className="visually-hidden">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((s) => (
                  <tr key={s.id}>
                    <td>{s.registrationNumber}</td>
                    <td>{s.slotCode}</td>
                    <td>₹{s.fee}</td>
                    <td>{formatMinutes(s.waitingMinutes)}</td>
                    <td className="hide-narrow">{s.failedAttempts}</td>
                    <td className="cell-action">
                      {paying?.id === s.id ? (
                        <span className="muted">Paying…</span>
                      ) : (
                        <button type="button" className="small" onClick={() => startPaying(s)}
                          aria-label={`Take payment of ₹${s.fee} for ${s.registrationNumber}`}>
                          Take payment
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppLayout>
  );
}
