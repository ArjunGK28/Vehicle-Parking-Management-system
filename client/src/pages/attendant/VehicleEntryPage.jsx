import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { SLOT_TYPE_LABELS } from '../../slots.js';
import AppLayout from '../../components/AppLayout.jsx';
import Field from '../../components/Field.jsx';

// UC-05: the attendant types the registration number at the gate and the system
// starts a session in a free slot of the right type (FR-05, FR-06).
// Built for speed (NFR-05): the field keeps focus and clears after each entry.
export default function VehicleEntryPage() {
  const inputRef = useRef(null);
  const [registration, setRegistration] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [notice, setNotice] = useState('');
  const [entry, setEntry] = useState(null);
  const [saving, setSaving] = useState(false);

  async function confirm(e) {
    e.preventDefault();
    setEntry(null);
    setNotice('');

    if (!registration.trim()) {
      setFieldError('Enter a registration number');
      inputRef.current?.focus();
      return;
    }
    setFieldError('');

    setSaving(true);
    try {
      const data = await api.enterVehicle(registration);
      setEntry(data.session);
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
        <h2>Vehicle entry</h2>
        <p className="muted">Type the registration number and confirm. The system picks a free slot of the right type.</p>

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
          <button type="submit" disabled={saving}>{saving ? 'Recording entry…' : 'Confirm entry'}</button>
        </form>

        {notice && <p className="alert alert-error" role="alert">{notice}</p>}

        {entry && (
          <div className="slot-callout" role="status">
            <p className="muted">{entry.registrationNumber} entered at {entry.entryTime}</p>
            <p className="slot-callout-code">Go to {entry.slotCode}</p>
            <p className="muted">{SLOT_TYPE_LABELS[entry.slotType] || entry.slotType} slot</p>
          </div>
        )}
      </section>
    </AppLayout>
  );
}
