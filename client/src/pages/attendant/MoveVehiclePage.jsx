import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { SLOT_TYPE_LABELS } from '../../slots.js';
import AppLayout from '../../components/AppLayout.jsx';
import Field from '../../components/Field.jsx';
import SelectField from '../../components/SelectField.jsx';

// #102: the attendant finds a parked vehicle and moves it to another free slot of its
// type. The same session continues, so the fee is not affected.
export default function MoveVehiclePage() {
  const [registration, setRegistration] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [notice, setNotice] = useState('');
  const [found, setFound] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotId, setSlotId] = useState('');
  const [slotError, setSlotError] = useState('');
  const [moved, setMoved] = useState(null);
  const [busy, setBusy] = useState(false);

  // Only free slots of the vehicle's type (DR-03, DR-07, DR-08).
  async function loadSlots(type) {
    const data = await api.listSlots({ status: 'available', type });
    setSlots(data.slots);
    setSlotId(String(data.slots[0]?.id ?? ''));
  }

  async function search(e) {
    e.preventDefault();
    setFound(null);
    setMoved(null);
    setNotice('');
    setSlotError('');

    const value = registration.trim();
    if (!value) {
      setFieldError('Enter a registration number');
      return;
    }
    setFieldError('');

    setBusy(true);
    try {
      const data = await api.locateVehicle(value);
      await loadSlots(data.vehicle.type);
      setFound(data);
    } catch (err) {
      if (err.fields && err.fields.registrationNumber) setFieldError(err.fields.registrationNumber);
      else setNotice(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function move(e) {
    e.preventDefault();
    setNotice('');
    setSlotError('');

    setBusy(true);
    try {
      const data = await api.moveVehicle(found.vehicle.registrationNumber, Number(slotId));
      setMoved(data.session);
      setFound(null);
      setRegistration('');
    } catch (err) {
      if (err.fields && err.fields.slotId) {
        setSlotError(err.fields.slotId);
      } else {
        setNotice(err.message);
        // The slot may have just been taken, so offer what is free now.
        await loadSlots(found.vehicle.type).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }

  const waitingToPay = found?.session.status === 'awaiting_payment';
  const slotOptions = Object.fromEntries(slots.map((s) => [s.id, s.code]));

  return (
    <AppLayout>
      <section className="panel">
        <p><Link to="/attendant">← Attendant dashboard</Link></p>
        <h2>Move vehicle</h2>
        <p className="muted">Find a parked vehicle, then choose a free slot of its type.</p>

        <form onSubmit={search} noValidate>
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
          />
          <button type="submit" disabled={busy}>{busy && !found ? 'Finding…' : 'Find vehicle'}</button>
        </form>

        {notice && <p className="alert alert-error" role="alert">{notice}</p>}

        {found && (
          <>
            <h3 className="section-title">{found.vehicle.registrationNumber} is in slot {found.slot.code}</h3>
            {waitingToPay && (
              <p className="muted">
                Exit is already recorded for this vehicle, so it cannot be moved. <Link to="/attendant/exit">Take payment</Link>
              </p>
            )}
            {!waitingToPay && slots.length === 0 && (
              <p className="muted">No free {SLOT_TYPE_LABELS[found.vehicle.type]?.toLowerCase()} slots right now.</p>
            )}
            {!waitingToPay && slots.length > 0 && (
              <form onSubmit={move} noValidate>
                <SelectField
                  label="Move to slot"
                  name="slotId"
                  value={slotId}
                  onChange={(e) => setSlotId(e.target.value)}
                  error={slotError}
                  options={slotOptions}
                />
                <button type="submit" disabled={busy}>{busy ? 'Moving…' : 'Confirm move'}</button>
              </form>
            )}
          </>
        )}

        {moved && (
          <div className="slot-callout" role="status">
            <p className="muted">{moved.registrationNumber} moved from {moved.fromSlotCode}</p>
            <p className="slot-callout-code">Go to {moved.slotCode}</p>
            <p className="muted">{SLOT_TYPE_LABELS[moved.slotType] || moved.slotType} slot</p>
          </div>
        )}
      </section>
    </AppLayout>
  );
}
