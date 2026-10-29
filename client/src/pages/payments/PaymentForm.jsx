import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import Field from '../../components/Field.jsx';
import SelectField from '../../components/SelectField.jsx';

const EMPTY_CARD = { cardNumber: '', cardExpiry: '' };

// FR-10 / UC-10: pay for one completed session. Shared by the attendant's exit page and
// the driver's Payments page; the server decides which methods each role may use
// (drivers do not get cash) and always charges the session's own fee.
// session: { id, registrationNumber, fee }. onPaid(data) gets the POST /payments response.
export default function PaymentForm({ session, onPaid }) {
  const [methods, setMethods] = useState(null);
  const [method, setMethod] = useState('');
  const [card, setCard] = useState(EMPTY_CARD);
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

  function updateCard(e) {
    setCard({ ...card, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setErrors({});
    setNotice('');
    setSaving(true);
    try {
      const payment = { sessionId: session.id, method };
      if (method === 'card') Object.assign(payment, card);
      const data = await api.pay(payment);
      setCard(EMPTY_CARD);
      onPaid(data);
    } catch (err) {
      // 400 marks the fields; 402 (declined), 404 and 409 come back as one message.
      const fields = err.fields || {};
      setErrors(fields);
      setNotice(fields.sessionId || err.message);
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
          {method === 'card' && (
            <>
              <Field label="Card number" name="cardNumber" value={card.cardNumber} onChange={updateCard}
                error={errors.cardNumber} placeholder="4111 1111 1111 1111" inputMode="numeric" maxLength={23} autoComplete="cc-number" />
              <Field label="Expiry (MM/YY)" name="cardExpiry" value={card.cardExpiry} onChange={updateCard}
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
