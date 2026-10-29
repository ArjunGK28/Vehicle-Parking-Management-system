import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { SLOT_STATUS_LABELS, SLOT_STATUS_ORDER, SLOT_TYPE_LABELS } from '../../slots.js';
import AppLayout from '../../components/AppLayout.jsx';
import Field from '../../components/Field.jsx';

const pad = (n) => String(n).padStart(2, '0');
const dateText = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateText(d);
};

const PRESETS = [
  { label: 'Today', range: () => ({ from: daysAgo(0), to: daysAgo(0) }) },
  { label: 'Last 7 days', range: () => ({ from: daysAgo(6), to: daysAgo(0) }) },
  {
    label: 'This month',
    range: () => {
      const d = new Date();
      return { from: dateText(new Date(d.getFullYear(), d.getMonth(), 1)), to: dateText(d) };
    },
  },
];

const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

function stayText(minutes) {
  if (minutes === null) return '–';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

// The day-by-day table as a CSV file the admin can open in a spreadsheet.
function downloadCsv(report) {
  const rows = [['Date', 'Entries', 'Exits', 'Reservations', 'Revenue (INR)']]
    .concat(report.days.map((d) => [d.date, d.entries, d.exits, d.reservations, d.revenue]));
  const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `occupancy-${report.from}-to-${report.to}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// UC-12: the administrator generates an occupancy report for a date range (FR-12, UT-12_01).
export default function ReportsPage() {
  const [range, setRange] = useState(PRESETS[0].range());
  const [report, setReport] = useState(null);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  async function generate(next = range) {
    setNotice('');
    setErrors({});
    setLoading(true);
    try {
      setReport(await api.occupancyReport(next));
    } catch (err) {
      setErrors(err.fields || {});
      setNotice(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Today's report is ready as soon as the page opens.
  useEffect(() => {
    generate();
  }, []);

  function update(e) {
    setRange({ ...range, [e.target.name]: e.target.value });
  }

  function usePreset(preset) {
    const next = preset.range();
    setRange(next);
    generate(next);
  }

  const current = report?.current;
  const period = report?.period;

  return (
    <AppLayout>
      <section className="panel">
        <p><Link to="/admin">← Administrator dashboard</Link></p>
        <h2>Occupancy report</h2>

        <form className="form-grid" onSubmit={(e) => { e.preventDefault(); generate(); }} noValidate>
          <Field label="From" name="from" type="date" value={range.from} onChange={update} error={errors.from} />
          <Field label="To" name="to" type="date" value={range.to} onChange={update} error={errors.to} />
          <button type="submit" disabled={loading}>{loading ? 'Generating…' : 'Generate'}</button>
        </form>
        <div className="preset-row">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="secondary small" onClick={() => usePreset(p)} disabled={loading}>{p.label}</button>
          ))}
        </div>

        {notice && <p className="alert alert-error" role="alert">{notice}</p>}

        {current && (
          <>
            <h3 className="section-title">Right now</h3>
            <div className="stat-grid">
              <div className="stat stat-main">
                <span className="stat-value">{current.occupancyPercent}%</span>
                <span className="muted">occupied or reserved</span>
              </div>
              {SLOT_STATUS_ORDER.map((status) => (
                <div key={status} className="stat">
                  <span className="stat-value">{current[status]}</span>
                  <span className={`status status-${status}`}>{SLOT_STATUS_LABELS[status]}</span>
                </div>
              ))}
            </div>
            <p className="muted small-text">
              {Object.entries(current.byType).map(([type, c]) => (
                `${SLOT_TYPE_LABELS[type]}: ${c.occupied + c.reserved} of ${c.total - c.unavailable} usable slots taken (${c.occupancyPercent}%)`
              )).join(' · ')}
            </p>

            <h3 className="section-title">
              {report.from === report.to ? report.from : `${report.from} to ${report.to}`}
            </h3>
            <div className="stat-grid">
              <div className="stat"><span className="stat-value">{period.entries}</span><span className="muted">entries</span></div>
              <div className="stat"><span className="stat-value">{period.exits}</span><span className="muted">exits</span></div>
              <div className="stat"><span className="stat-value">{stayText(period.averageStayMinutes)}</span><span className="muted">average stay</span></div>
              <div className="stat"><span className="stat-value">{period.reservations}</span><span className="muted">reservations</span></div>
              <div className="stat"><span className="stat-value">{rupees(period.revenue)}</span><span className="muted">collected ({period.payments} payments)</span></div>
              <div className="stat"><span className="stat-value">{rupees(period.unpaidFees)}</span><span className="muted">fees not yet paid</span></div>
            </div>

            <div className="section-head">
              <h3 className="section-title">Day by day</h3>
              <button type="button" className="secondary small" onClick={() => downloadCsv(report)}>Download CSV</button>
            </div>
            <div className="table-scroll">
              <table className="data-table numbers-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Entries</th>
                    <th scope="col">Exits</th>
                    <th scope="col" title="Reservations"><span className="hide-narrow">Reservations</span><span className="show-narrow">Res.</span></th>
                    <th scope="col">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {report.days.map((d) => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td>{d.entries}</td>
                      <td>{d.exits}</td>
                      <td>{d.reservations}</td>
                      <td>{rupees(d.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </AppLayout>
  );
}
