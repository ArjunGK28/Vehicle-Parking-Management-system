import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ROLE_LABELS, ROLES } from '../../auth/roles.js';
import { SLOT_TYPE_LABELS } from '../../slots.js';
import AppLayout from '../../components/AppLayout.jsx';
import Field from '../../components/Field.jsx';
import SelectField from '../../components/SelectField.jsx';

const EMPTY_FORM = { name: '', email: '', password: '', role: ROLES.ATTENDANT };
const ROLE_FILTERS = { '': 'All roles', ...ROLE_LABELS };

// UC-12: the administrator adds and removes users and manages their vehicles (FR-12).
export default function UsersPage() {
  const { user: me } = useAuth();
  const [filter, setFilter] = useState({ role: '', search: '' });
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);
  const [openUserId, setOpenUserId] = useState(null);
  const [vehicles, setVehicles] = useState([]);

  // Wait a moment after typing in the search box before asking the server.
  useEffect(() => {
    const timer = setTimeout(() => {
      api.listUsers(filter)
        .then((data) => setUsers(data.users))
        .catch((err) => {
          setUsers([]);
          setNotice({ error: true, text: err.message });
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [filter]);

  function updateFilter(e) {
    setFilter({ ...filter, [e.target.name]: e.target.value });
  }

  function updateForm(e) {
    setForm({ ...form, [e.target.name.replace('new-', '')]: e.target.value });
  }

  async function reload() {
    setUsers((await api.listUsers(filter)).users);
  }

  async function addUser(e) {
    e.preventDefault();
    setNotice(null);
    setErrors({});
    setAdding(true);
    try {
      const data = await api.addUser(form);
      setForm(EMPTY_FORM);
      setNotice({ text: data.message });
      await reload();
    } catch (err) {
      setErrors(err.fields || {});
      setNotice({ error: true, text: err.message });
    } finally {
      setAdding(false);
    }
  }

  async function removeUser(user) {
    if (!window.confirm(`Remove ${user.name} (${user.email})? Their vehicles are removed too.`)) return;
    setNotice(null);
    setBusy(`user-${user.id}`);
    try {
      await api.removeUser(user.id);
      setNotice({ text: `${user.name} was removed.` });
      if (openUserId === user.id) setOpenUserId(null);
      await reload();
    } catch (err) {
      setNotice({ error: true, text: err.message });
    } finally {
      setBusy(null);
    }
  }

  async function toggleVehicles(user) {
    if (openUserId === user.id) {
      setOpenUserId(null);
      return;
    }
    setNotice(null);
    setBusy(`vehicles-${user.id}`);
    try {
      setVehicles((await api.listUserVehicles(user.id)).vehicles);
      setOpenUserId(user.id);
    } catch (err) {
      setNotice({ error: true, text: err.message });
    } finally {
      setBusy(null);
    }
  }

  async function removeVehicle(vehicle) {
    if (!window.confirm(`Remove vehicle ${vehicle.registrationNumber}?`)) return;
    setNotice(null);
    setBusy(`vehicle-${vehicle.id}`);
    try {
      await api.adminRemoveVehicle(vehicle.id);
      setVehicles((current) => current.filter((v) => v.id !== vehicle.id));
      setNotice({ text: `Vehicle ${vehicle.registrationNumber} was removed.` });
      await reload();
    } catch (err) {
      setNotice({ error: true, text: err.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppLayout>
      <section className="panel">
        <p><Link to="/admin">← Administrator dashboard</Link></p>
        <h2>Users and vehicles</h2>

        <h3 className="section-title">Add a user</h3>
        <form className="form-grid" onSubmit={addUser} noValidate>
          <Field label="Name" name="new-name" value={form.name} onChange={updateForm} error={errors.name} autoComplete="off" />
          <Field label="Email" name="new-email" type="email" value={form.email} onChange={updateForm} error={errors.email} autoComplete="off" />
          <Field label="Password" name="new-password" type="password" value={form.password} onChange={updateForm} error={errors.password} autoComplete="new-password" />
          <SelectField label="Role" name="new-role" value={form.role} onChange={updateForm} error={errors.role} options={ROLE_LABELS} />
          <button type="submit" disabled={adding}>{adding ? 'Adding…' : 'Add user'}</button>
        </form>

        {notice && (
          <p className={`alert ${notice.error ? 'alert-error' : 'alert-success'}`} role={notice.error ? 'alert' : 'status'}>
            {notice.text}
          </p>
        )}

        <h3 className="section-title">All users</h3>
        <div className="form-grid filters">
          <SelectField label="Role" name="role" value={filter.role} onChange={updateFilter} options={ROLE_FILTERS} />
          <Field label="Search name or email" name="search" type="search" value={filter.search} onChange={updateFilter} autoComplete="off" />
        </div>

        {users === null && <p className="muted">Loading users…</p>}
        {users?.length === 0 && <p className="muted">No users match.</p>}
        {users?.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Vehicles</th>
                  <th scope="col"><span className="visually-hidden">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <Fragment key={user.id}>
                    <tr>
                      <td><strong>{user.name}</strong></td>
                      <td>{user.email}</td>
                      <td><span className="badge">{ROLE_LABELS[user.role] || user.role}</span></td>
                      <td>
                        {user.role === ROLES.DRIVER ? (
                          <button
                            type="button"
                            className="secondary small"
                            onClick={() => toggleVehicles(user)}
                            disabled={busy === `vehicles-${user.id}`}
                            aria-expanded={openUserId === user.id}
                          >
                            {user.vehicleCount} {openUserId === user.id ? '▴' : '▾'}
                          </button>
                        ) : <span className="muted">–</span>}
                      </td>
                      <td className="cell-action">
                        {user.id === me.id ? (
                          <span className="muted small-text">You</span>
                        ) : (
                          <button
                            type="button"
                            className="secondary small"
                            onClick={() => removeUser(user)}
                            disabled={busy === `user-${user.id}`}
                            aria-label={`Remove ${user.name}`}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                    {openUserId === user.id && (
                      <tr className="detail-row">
                        <td colSpan={5}>
                          {vehicles.length === 0 ? (
                            <p className="muted small-text">No vehicles registered.</p>
                          ) : (
                            <ul className="vehicle-list">
                              {vehicles.map((v) => (
                                <li key={v.id}>
                                  <span>
                                    <strong>{v.registrationNumber}</strong>{' '}
                                    <span className="muted">{SLOT_TYPE_LABELS[v.type] || v.type}, {v.model}, {v.colour}</span>
                                  </span>
                                  <button
                                    type="button"
                                    className="secondary small"
                                    onClick={() => removeVehicle(v)}
                                    disabled={busy === `vehicle-${v.id}`}
                                    aria-label={`Remove vehicle ${v.registrationNumber}`}
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppLayout>
  );
}
