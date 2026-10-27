import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { SLOT_TYPE_LABELS } from '../../slots.js';
import AppLayout from '../../components/AppLayout.jsx';
import Field from '../../components/Field.jsx';

// "135" -> "2 h 15 min"
function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// UC-08: the attendant types the registration number at the gate, the session is
// completed, the slot is released, and the fee is shown straight away (FR-08, FR-09, NFR-02).
// Laid out like the Vehicle entry page so the two gate screens work the same way.
export default function VehicleExitPage() {
  const inputRef = useRef(null);
  const [registration, setRegistration] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [notice, setNotice] = useState('');
  const [exit, setExit] = useState(null);
  const [saving, setSaving] = useState(false);

  async function confirm(e) {
    e.preventDefault();
    setExit(null);
    setNotice('');

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
      setRegistration('');
    } catch (err) {
      if (err.fields && err.fields.registrationNumber) setFieldError(err.fields.registrationNumber);
      else setNotice(err.message);
    } finally {
      setSaving(false);
      inputRef.current?.focus();
    }
  }

  return (
    <AppLayout>
      <section className="panel">
        <p><Link to="/attendant">← Attendant dashboard</Link></p>
        <h2>Vehicle exit</h2>
        <p className="muted">Type the registration number and confirm. The slot is released and the fee is shown.</p>

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
              <p className="muted">{exit.registrationNumber} has left {exit.slotCode}</p>
              <p className="slot-callout-code">Fee ₹{exit.fee}</p>
              <p className="muted">{exit.paymentStatus === 'paid' ? 'Paid' : 'Not paid yet'}</p>
            </div>

            <h3 className="section-title">Exit summary</h3>
            <table className="data-table">
              <tbody>
                <tr><th scope="row">Slot</th><td>{exit.slotCode} ({SLOT_TYPE_LABELS[exit.slotType] || exit.slotType})</td></tr>
                <tr><th scope="row">Entry time</th><td>{exit.entryTime}</td></tr>
                <tr><th scope="row">Exit time</th><td>{exit.exitTime}</td></tr>
                <tr><th scope="row">Billed time</th><td>{formatMinutes(exit.billedMinutes)}</td></tr>
                <tr><th scope="row">Fee</th><td>₹{exit.fee}</td></tr>
                <tr><th scope="row">Payment</th><td>{exit.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}</td></tr>
              </tbody>
            </table>

            {/* #42: the "Take payment" form goes here. */}
          </>
        )}
      </section>
    </AppLayout>
  );
}