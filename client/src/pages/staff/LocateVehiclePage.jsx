import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ROLE_HOME } from '../../auth/roles.js';
import { SLOT_STATUS_LABELS, SLOT_TYPE_LABELS } from '../../slots.js';
import AppLayout from '../../components/AppLayout.jsx';
import Field from '../../components/Field.jsx';

// UC-07: an attendant or administrator enters a registration number
// and the system shows the vehicle's slot and status (FR-07).
export default function LocateVehiclePage() {
  const { user } = useAuth();
  const [registration, setRegistration] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState(null);
  const [searching, setSearching] = useState(false);

  async function search(e) {
    e.preventDefault();
    setResult(null);
    setNotice('');

    const value = registration.trim();
    if (!value) {
      setFieldError('Enter a registration number');
      return;
    }
    setFieldError('');

    setSearching(true);
    try {
      setResult(await api.locateVehicle(value));
    } catch (err) {
      if (err.fields && err.fields.registrationNumber) setFieldError(err.fields.registrationNumber);
      else setNotice(err.message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <AppLayout>
      <section className="panel">
        <p><Link to={ROLE_HOME[user.role] || '/dashboard'}>← Dashboard</Link></p>
        <h2>Track vehicle</h2>
        <p className="muted">Enter a registration number to see which slot the vehicle is in.</p>

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
          />
          <button type="submit" disabled={searching}>{searching ? 'Searching…' : 'Find vehicle'}</button>
        </form>

        {notice && <p className="alert alert-error" role="alert">{notice}</p>}

        {result && (
          <>
            <p className="alert alert-success" role="status">{result.message}</p>
            <table className="data-table">
              <tbody>
                <tr>
                  <th scope="row">Vehicle</th>
                  <td>{result.vehicle.registrationNumber} ({result.vehicle.model}, {result.vehicle.colour})</td>
                </tr>
                <tr>
                  <th scope="row">Slot</th>
                  <td><strong>{result.slot.code}</strong> ({SLOT_TYPE_LABELS[result.slot.type] || result.slot.type})</td>
                </tr>
                <tr>
                  <th scope="row">Status</th>
                  <td>
                    <span className={`status status-${result.slot.status}`}>
                      {SLOT_STATUS_LABELS[result.slot.status] || result.slot.status}
                    </span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Entered at</th>
                  <td>{result.session.entryTime}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </section>
    </AppLayout>
  );
}