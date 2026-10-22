import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { SLOT_STATUS_LABELS, SLOT_TYPE_LABELS } from '../../slots.js';
import AppLayout from '../../components/AppLayout.jsx';
import Field from '../../components/Field.jsx';
import SelectField from '../../components/SelectField.jsx';

const EMPTY_FORM = { code: '', type: 'four_wheeler' };

// Same order as the server: P-2 before P-10.
const byCode = (a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code);

// UC-12: the administrator adds parking slots and disables or re-enables them.
// A disabled slot shows Unavailable and is never assigned to a vehicle.
export default function SlotsPage() {
  const [slots, setSlots] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api.listSlots()
      .then((data) => setSlots(data.slots))
      .catch((err) => {
        setSlots([]);
        setNotice({ error: true, text: err.message });
      });
  }, []);

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function addSlot(e) {
    e.preventDefault();
    setNotice(null);
    setErrors({});
    setAdding(true);
    try {
      const data = await api.addSlot(form);
      setSlots((current) => [...current, data.slot].sort(byCode));
      setForm({ ...EMPTY_FORM, type: form.type });
      setNotice({ text: data.message });
    } catch (err) {
      setErrors(err.fields || {});
      setNotice({ error: true, text: err.message });
    } finally {
      setAdding(false);
    }
  }

  async function toggle(slot) {
    setNotice(null);
    setBusyId(slot.id);
    try {
      const data = await api.setSlotDisabled(slot.id, slot.status !== 'unavailable');
      setSlots((current) => current.map((s) => (s.id === slot.id ? data.slot : s)));
      setNotice({ text: data.message });
    } catch (err) {
      setNotice({ error: true, text: err.message });
    } finally {
      setBusyId(null);
    }
  }

  const unavailable = slots ? slots.filter((s) => s.status === 'unavailable').length : 0;

  return (
    <AppLayout>
      <section className="panel">
        <p><Link to="/admin">← Administrator dashboard</Link></p>
        <h2>Parking slots</h2>
        {slots && (
          <p className="muted">
            {slots.length} {slots.length === 1 ? 'slot' : 'slots'}, {unavailable} unavailable
          </p>
        )}

        <form className="inline-form" onSubmit={addSlot} noValidate>
          <Field label="Slot code" name="code" value={form.code} onChange={update} error={errors.code} placeholder="P-30" maxLength={10} />
          <SelectField label="Slot type" name="type" value={form.type} onChange={update} error={errors.type} options={SLOT_TYPE_LABELS} />
          <button type="submit" disabled={adding}>{adding ? 'Adding…' : 'Add slot'}</button>
        </form>

        {notice && (
          <p className={`alert ${notice.error ? 'alert-error' : 'alert-success'}`} role={notice.error ? 'alert' : 'status'}>
            {notice.text}
          </p>
        )}

        {slots === null && <p className="muted">Loading slots…</p>}
        {slots?.length === 0 && <p className="muted">No slots yet. Add the first one above.</p>}
        {slots?.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="visually-hidden">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => {
                const disabled = slot.status === 'unavailable';
                return (
                  <tr key={slot.id}>
                    <td><strong>{slot.code}</strong></td>
                    <td>{SLOT_TYPE_LABELS[slot.type] || slot.type}</td>
                    <td><span className={`status status-${slot.status}`}>{SLOT_STATUS_LABELS[slot.status] || slot.status}</span></td>
                    <td className="cell-action">
                      <button
                        type="button"
                        className="secondary small"
                        onClick={() => toggle(slot)}
                        disabled={busyId === slot.id}
                        aria-label={`${disabled ? 'Enable' : 'Disable'} slot ${slot.code}`}
                      >
                        {disabled ? 'Enable' : 'Disable'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </AppLayout>
  );
}
