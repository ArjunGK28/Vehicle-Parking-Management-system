import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { validateLogin } from '../../auth/validation.js';
import Field from '../../components/Field.jsx';

// UC-01 steps 3-4: the user logs in and the system opens their dashboard.
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const registered = location.state || {};

  const [form, setForm] = useState({ email: registered.email || '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setFormError('');
    const fieldErrors = validateLogin(form);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setSubmitting(true);
    try {
      await login(form);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-card">
      <h1>Log in</h1>
      {registered.message && !formError && (
        <p
          className={`alert ${registered.expired ? 'alert-error' : 'alert-success'}`}
          role={registered.expired ? 'alert' : 'status'}
        >
          {registered.message}
        </p>
      )}
      {formError && <p className="alert alert-error" role="alert">{formError}</p>}
      <form onSubmit={submit} noValidate>
        <Field label="Email" name="email" type="email" value={form.email} onChange={update} error={errors.email} autoComplete="email" />
        <Field label="Password" name="password" type="password" value={form.password} onChange={update} error={errors.password} autoComplete="current-password" />
        <button type="submit" disabled={submitting}>{submitting ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="muted">
        New here? <Link to="/register">Create an account</Link>
      </p>
    </main>
  );
}