import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { SLOT_TYPE_LABELS } from '../../slots.js';
import AppLayout from '../../components/AppLayout.jsx';
import Field from '../../components/Field.jsx';
import SelectField from '../../components/SelectField.jsx';

const EMPTY_FORM = { registrationNumber: '', type: 'four_wheeler', model: '', colour: '' };
const TYPE_OPTIONS = { four_wheeler: `${SLOT_TYPE_LABELS.four_wheeler} (car)`, two_wheeler: `${SLOT_TYPE_LABELS.two_wheeler} (bike, scooter)` };

// UC-02: the driver registers, edits and removes their vehicles (FR-02, #85).
export default function MyVehiclesPage() {
  const [vehicles, setVehicles] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api.listVehicles()
      .then((data) => setVehicles(data.vehicles))
      .catch((err) => {
        setVehicles([]);
        setNotice({ error: true, text: err.message });
      });
  }, []);

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function startEdit(vehicle) {
    setEditingId(vehicle.id);
    setForm({
      registrationNumber: vehicle.registrationNumber,
      type: vehicle.type,
      model: vehicle.model,
      colour: vehicle.colour,
    });
    setErrors({});
    setNotice(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
  }

  async function save(e) {
    e.preventDefault();
    setNotice(null);
    setErrors({});
    setSaving(true);
    try {
      if (editingId) {
        const data = await api.updateVehicle(editingId, form);
        setVehicles((current) => current.map((v) => (v.id === editingId ? data.vehicle : v)));
        setNotice({ text: `${data.vehicle.registrationNumber} updated.` });
      } else {
        const data = await api.addVehicle(form);
        setVehicles((current) => [data.vehicle, ...current]);
        setNotice({ text: `${data.vehicle.registrationNumber} registered.` });
      }
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      setErrors(err.fields || {});
      setNotice({ error: true, text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function remove(vehicle) {
    if (!window.confirm(`Remove ${vehicle.registrationNumber} from your vehicles?`)) return;
    setNotice(null);
    setBusyId(vehicle.id);
    try {
      await api.removeVehicle(vehicle.id);
      setVehicles((current) => current.filter((v) => v.id !== vehicle.id));
      if (editingId === vehicle.id) cancelEdit();
      setNotice({ text: `${vehicle.registrationNumber} removed.` });
    } catch (err) {
      setNotice({ error: true, text: err.message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppLayout>
      <section className="panel">
        <p><Link to="/driver">← Driver dashboard</Link></p>
        <h2>My vehicles</h2>

        <h3 className="section-title">{editingId ? 'Edit vehicle' : 'Register a vehicle'}</h3>
        <form className="form-grid" onSubmit={save} noValidate>
          <Field label="Registration number" name="registrationNumber" value={form.registrationNumber} onChange={update}
            error={errors.registrationNumber} placeholder="KA01AB1234" maxLength={20} autoComplete="off" />
          <SelectField label="Type" name="type" value={form.type} onChange={update} error={errors.type} options={TYPE_OPTIONS} />
          <Field label="Model" name="model" value={form.model} onChange={update} error={errors.model} placeholder="Swift" maxLength={100} />
          <Field label="Colour" name="colour" value={form.colour} onChange={update} error={errors.colour} placeholder="Red" maxLength={50} />
          <div className="form-actions">
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Register vehicle'}</button>
            {editingId && <button type="button" className="secondary" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>

        {notice && (
          <p className={`alert ${notice.error ? 'alert-error' : 'alert-success'}`} role={notice.error ? 'alert' : 'status'}>
            {notice.text}
          </p>
        )}

        <h3 className="section-title">Registered vehicles</h3>
        {vehicles === null && <p className="muted">Loading vehicles…</p>}
        {vehicles?.length === 0 && <p className="muted">No vehicles yet. Register one above to park or reserve.</p>}
        {vehicles?.length > 0 && (
          <ul className="vehicle-list vehicle-cards">
            {vehicles.map((v) => (
              <li key={v.id} className={editingId === v.id ? 'is-editing' : ''}>
                <span>
                  <strong>{v.registrationNumber}</strong>{' '}
                  <span className="muted">{SLOT_TYPE_LABELS[v.type] || v.type}, {v.model}, {v.colour}</span>
                </span>
                <span className="row-actions">
                  <button type="button" className="secondary small" onClick={() => startEdit(v)} aria-label={`Edit ${v.registrationNumber}`}>
                    Edit
                  </button>
                  <button type="button" className="secondary small" onClick={() => remove(v)} disabled={busyId === v.id}
                    aria-label={`Remove ${v.registrationNumber}`}>
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppLayout>
  );
}
