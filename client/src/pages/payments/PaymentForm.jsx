import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import Field from '../../components/Field.jsx';
import SelectField from '../../components/SelectField.jsx';

const EMPTY_DETAILS = { cardNumber: '', cardExpiry: '', upiId: '' };

// FR-10 / UC-10: pay for one session whose exit is recorded. Shared by the attendant's
// exit page and the driver's Payments page; the server decides which methods each role
// may use (drivers do not get cash) and always charges the session's own fee.
// A failed attempt leaves the session waiting, so the form stays open to try again or
// switch to another method (UC-08).
// session: { id, registrationNumber, fee }. onPaid(data) gets the POST /payments response.
export default function PaymentForm({ session, onPaid, onFailed }) {
  const [methods, setMethods] = useState(null);
  const [method, setMethod] = useState('');
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.paymentMethods()
      .then((data) => {
        if (!active) return;
        setMethods(data.methods);
        setMethod(data.methods[0]?.id || '');
      })
      .catch((err) => {
        if (!active) return;
        setMethods([]);
        setNotice(err.message);
      });
    return () => {
      active = false;
    };
  }, []);

  function updateDetails(e) {
    setDetails({ ...details, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setErrors({});
    setNotice('');
    setSaving(true);
    try {
      const payment = { sessionId: session.id, method };
      if (method === 'card') Object.assign(payment, { cardNumber: details.cardNumber, cardExpiry: details.cardExpiry });
      if (method === 'upi') payment.upiId = details.upiId;
      const data = await api.pay(payment);
      setDetails(EMPTY_DETAILS);
      onPaid(data);
    } catch (err) {
      // 400 marks the fields; 402 (declined), 404 and 409 come back as one message.
      const fields = err.fields || {};
      setErrors(fields);
      setNotice(fields.sessionId || err.message);
      if (err.status === 402 && onFailed) onFailed(err);
    } finally {
      setSaving(false);
    }
  }

  const methodOptions = {};
  for (const m of methods || []) methodOptions[m.id] = m.label;

  return (
    <>
      <h3 className="section-title">Take payment of ₹{session.fee} for {session.registrationNumber}</h3>
      {methods === null && <p className="muted">Loading payment methods…</p>}
      {methods?.length > 0 && (
        <form className="form-grid" onSubmit={submit} noValidate>
          <SelectField label="Payment method" name="method" value={method} onChange={(e) => setMethod(e.target.value)}
            error={errors.method} options={methodOptions} />
          {method === 'upi' && (
            <Field label="UPI ID" name="upiId" value={details.upiId} onChange={updateDetails}
              error={errors.upiId} placeholder="name@bank" maxLength={320} autoComplete="off" />
          )}
          {method === 'card' && (
            <>
              <Field label="Card number" name="cardNumber" value={details.cardNumber} onChange={updateDetails}
                error={errors.cardNumber} placeholder="4111 1111 1111 1111" inputMode="numeric" maxLength={23} autoComplete="cc-number" />
              <Field label="Expiry (MM/YY)" name="cardExpiry" value={details.cardExpiry} onChange={updateDetails}
                error={errors.cardExpiry} placeholder="MM/YY" inputMode="numeric" maxLength={5} autoComplete="cc-exp" />
            </>
          )}
          <div className="form-actions">
            <button type="submit" disabled={saving}>{saving ? 'Processing payment…' : `Pay ₹${session.fee}`}</button>
          </div>
        </form>
      )}

      {notice && <p className="alert alert-error" role="alert">{notice}</p>}
    </>
  );
}
