import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { validateRegistration } from '../../auth/validation.js';
import Field from '../../components/Field.jsx';

// UC-01 steps 1-2: the user enters their details and the system creates the account.
export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setFormError('');
    const fieldErrors = validateRegistration(form);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setSubmitting(true);
    try {
      const data = await api.register(form);
      navigate('/login', { state: { message: data.message, email: data.user.email } });
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-card">
      <h1>Create an account</h1>
      <p className="muted">Register as a driver to reserve and pay for parking.</p>
      {formError && <p className="alert alert-error" role="alert">{formError}</p>}
      <form onSubmit={submit} noValidate>
        <Field label="Full name" name="name" value={form.name} onChange={update} error={errors.name} autoComplete="name" />
        <Field label="Email" name="email" type="email" value={form.email} onChange={update} error={errors.email} autoComplete="email" />
        <Field label="Password" name="password" type="password" value={form.password} onChange={update} error={errors.password} autoComplete="new-password" />
        <button type="submit" disabled={submitting}>{submitting ? 'Creating account…' : 'Register'}</button>
      </form>
      <p className="muted">
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </main>
  );
}
