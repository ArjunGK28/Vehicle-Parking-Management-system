import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { SLOT_TYPE_LABELS } from '../../slots.js';
import AppLayout from '../../components/AppLayout.jsx';
import Field from '../../components/Field.jsx';
import SelectField from '../../components/SelectField.jsx';

const BILLING_STEPS = { 15: '15 minutes', 30: '30 minutes', 60: '1 hour' };

// UC-12: the administrator sets the rate for each vehicle type.
// Fees worked out after a change use the new rate (FR-09).
export default function RatesPage() {
  const [rates, setRates] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api.listRates()
      .then((data) => setRates(data.rates))
      .catch((err) => {
        setRates([]);
        setLoadError(err.message);
      });
  }, []);

  return (
    <AppLayout>
      <section className="panel">
        <p><Link to="/admin">← Administrator dashboard</Link></p>
        <h2>Parking rates</h2>
        <p className="muted">
          Fee = time parked × hourly rate. Time is rounded up to the billing step, and no stay
          costs less than the minimum fee. Changes apply to fees worked out from now on.
        </p>

        {loadError && <p className="alert alert-error" role="alert">{loadError}</p>}
        {rates === null && <p className="muted">Loading rates…</p>}
        {rates && (
          <div className="rate-grid">
            {Object.keys(SLOT_TYPE_LABELS).reverse().map((type) => (
              <RateCard key={type} type={type} saved={rates.find((r) => r.type === type)} />
            ))}
          </div>
        )}
      </section>
    </AppLayout>
  );
}

function toForm(rate) {
  return {
    hourlyRate: rate ? String(rate.hourlyRate) : '',
    minimumFee: rate ? String(rate.minimumFee) : '',
    billingStepMinutes: rate ? String(rate.billingStepMinutes) : '15',
  };
}

function RateCard({ type, saved }) {
  const [rate, setRate] = useState(saved);
  const [form, setForm] = useState(() => toForm(saved));
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);

  // Inputs are named "<type>.<field>" so ids stay unique across the cards.
  function update(e) {
    const field = e.target.name.split('.')[1];
    setForm({ ...form, [field]: e.target.value });
  }

  async function save(e) {
    e.preventDefault();
    setNotice(null);
    setErrors({});
    setSaving(true);
    try {
      const data = await api.saveRate(type, form);
      setRate(data.rate);
      setForm(toForm(data.rate));
      setNotice({ text: data.message });
    } catch (err) {
      setErrors(err.fields || {});
      setNotice({ error: true, text: err.message });
    } finally {
      setSaving(false);
    }
  }

  const label = SLOT_TYPE_LABELS[type];
  return (
    <form className="rate-card" onSubmit={save} noValidate aria-label={`${label} rate`}>
      <h3>{label}</h3>
      {!rate && <p className="alert alert-error">No rate set. Fees cannot be worked out for {label.toLowerCase()}s.</p>}
      <Field label="Hourly rate (₹)" name={`${type}.hourlyRate`} type="number" min="1" step="1" inputMode="numeric"
        value={form.hourlyRate} onChange={update} error={errors.hourlyRate} />
      <Field label="Minimum fee (₹)" name={`${type}.minimumFee`} type="number" min="0" step="1" inputMode="numeric"
        value={form.minimumFee} onChange={update} error={errors.minimumFee} />
      <SelectField label="Billing step" name={`${type}.billingStepMinutes`} options={BILLING_STEPS}
        value={form.billingStepMinutes} onChange={update} error={errors.billingStepMinutes} />
      <button type="submit" disabled={saving}>{saving ? 'Saving…' : `Save ${label.toLowerCase()} rate`}</button>
      {notice && (
        <p className={`alert ${notice.error ? 'alert-error' : 'alert-success'}`} role={notice.error ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}
      {rate && <p className="muted small-text">Last changed {rate.updatedAt}</p>}
    </form>
  );
}
