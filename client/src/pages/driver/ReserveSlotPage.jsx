import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { SLOT_TYPE_LABELS } from '../../slots.js';
import AppLayout from '../../components/AppLayout.jsx';
import Field from '../../components/Field.jsx';
import SelectField from '../../components/SelectField.jsx';

const pad = (n) => String(n).padStart(2, '0');
// Value for a datetime-local input, in the browser's local time.
const toInputValue = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function defaultWindow() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 2);
  return { startTime: toInputValue(start), endTime: toInputValue(end) };
}

const RESERVATION_STATUS = { reserved: 'Reserved', cancelled: 'Cancelled', completed: 'Completed' };

// '2027-01-10 14:00:00' -> '2027-01-10 14:00'
const shortTime = (value) => (value ? String(value).slice(0, 16).replace('T', ' ') : '');

// UC-04: the driver reserves an available slot of their vehicle's type for a time window (FR-04, #85).
export default function ReserveSlotPage() {
  const [vehicles, setVehicles] = useState(null);
  const [slots, setSlots] = useState([]);
  const [allSlots, setAllSlots] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [form, setForm] = useState({ vehicleId: '', slotId: '', ...defaultWindow() });
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.listVehicles(), api.listReservations(), api.listSlots()])
      .then(([v, r, s]) => {
        setVehicles(v.vehicles);
        setReservations(r.reservations);
        setAllSlots(s.slots);
        if (v.vehicles.length > 0) setForm((f) => ({ ...f, vehicleId: String(v.vehicles[0].id) }));
      })
      .catch((err) => {
        setVehicles([]);
        setNotice({ error: true, text: err.message });
      });
  }, []);

  const vehicle = vehicles?.find((v) => String(v.id) === form.vehicleId);

  // Only free slots of the chosen vehicle's type (DR-07).
  useEffect(() => {
    if (!vehicle) return;
    api.listSlots({ status: 'available', type: vehicle.type })
      .then((data) => {
        setSlots(data.slots);
        setForm((f) => ({ ...f, slotId: data.slots.some((s) => String(s.id) === f.slotId) ? f.slotId : String(data.slots[0]?.id ?? '') }));
      })
      .catch((err) => setNotice({ error: true, text: err.message }));
  }, [vehicle?.id, vehicle?.type]);

  const vehicleOptions = useMemo(
    () => Object.fromEntries((vehicles || []).map((v) => [v.id, `${v.registrationNumber} (${SLOT_TYPE_LABELS[v.type] || v.type})`])),
    [vehicles],
  );
  const slotOptions = Object.fromEntries(slots.map((s) => [s.id, s.code]));
  const slotCode = (id) => allSlots.find((s) => s.id === id)?.code || `#${id}`;
  const registration = (id) => vehicles?.find((v) => v.id === id)?.registrationNumber || `#${id}`;

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function reserve(e) {
    e.preventDefault();
    setNotice(null);
    setErrors({});
    setSaving(true);
    try {
      const data = await api.reserveSlot({
        vehicleId: Number(form.vehicleId),
        slotId: Number(form.slotId),
        startTime: form.startTime,
        endTime: form.endTime,
      });
      setReservations((current) => [data.reservation, ...current]);
      setNotice({ text: `Slot ${slotCode(data.reservation.slot_id)} reserved from ${shortTime(data.reservation.start_time)} to ${shortTime(data.reservation.end_time)}.` });
    } catch (err) {
      setErrors(err.fields || {});
      // IT-04_03: a taken slot comes back as 409; point the driver to another slot.
      const message = /[.!?]$/.test(err.message) ? err.message : `${err.message}.`;
      const hint = err.status === 409 ? ' Choose another slot or time.' : '';
      setNotice({ error: true, text: `${message}${hint}` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <section className="panel">
        <p><Link to="/driver">← Driver dashboard</Link></p>
        <h2>Reserve a slot</h2>

        {vehicles === null && <p className="muted">Loading…</p>}
        {vehicles?.length === 0 && !notice && (
          <p className="muted">
            Register a vehicle first in <Link to="/driver/vehicles">My vehicles</Link>, then come back to reserve a slot.
          </p>
        )}

        {vehicles?.length > 0 && (
          <form className="form-grid" onSubmit={reserve} noValidate>
            <SelectField label="Vehicle" name="vehicleId" value={form.vehicleId} onChange={update} error={errors.vehicleId} options={vehicleOptions} />
            {slots.length > 0 ? (
              <SelectField label="Slot" name="slotId" value={form.slotId} onChange={update} error={errors.slotId} options={slotOptions} />
            ) : (
              <div className="field">
                <span className="field-label">Slot</span>
                <p className="muted small-text">No free {SLOT_TYPE_LABELS[vehicle?.type]?.toLowerCase()} slots right now.</p>
              </div>
            )}
            <Field label="From" name="startTime" type="datetime-local" value={form.startTime} onChange={update} error={errors.startTime} />
            <Field label="Until" name="endTime" type="datetime-local" value={form.endTime} onChange={update} error={errors.endTime} />
            <button type="submit" disabled={saving || slots.length === 0}>{saving ? 'Reserving…' : 'Confirm reservation'}</button>
          </form>
        )}

        {notice && (
          <p className={`alert ${notice.error ? 'alert-error' : 'alert-success'}`} role={notice.error ? 'alert' : 'status'}>
            {notice.text}
          </p>
        )}

        <h3 className="section-title">My reservations</h3>
        {reservations.length === 0 ? (
          <p className="muted">No reservations yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Slot</th>
                  <th scope="col" className="hide-narrow">Vehicle</th>
                  <th scope="col">From</th>
                  <th scope="col">Until</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{slotCode(r.slot_id)}</strong>
                      <span className="muted small-text show-narrow">{registration(r.vehicle_id)}</span>
                    </td>
                    <td className="hide-narrow">{registration(r.vehicle_id)}</td>
                    <td>{shortTime(r.start_time)}</td>
                    <td>{shortTime(r.end_time)}</td>
                    <td><span className={`status ${r.status === 'reserved' ? 'status-available' : ''}`}>{RESERVATION_STATUS[r.status] || r.status}</span></td>
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
