import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { SLOT_STATUS_LABELS, SLOT_TYPE_LABELS } from '../slots.js';
import './slotMap.css';

const REFRESH_MS = 5000;
const ROW_SIZE = 10; // bays per row; matches the 10 columns in slotMap.css

// Four-wheelers first, as on the lot.
const SECTIONS = [
  { type: 'four_wheeler', title: 'Four-wheeler bays' },
  { type: 'two_wheeler', title: 'Two-wheeler bays' },
];

// Green when a driver could park there now, red when a vehicle or a reservation holds it,
// grey when the administrator has taken the slot out of service.
const BAY_STATE = {
  available: 'free',
  occupied: 'taken',
  reserved: 'taken',
  unavailable: 'closed',
};

const byCode = (a, b) => a.code.localeCompare(b.code, undefined, { numeric: true });

function CarArt() {
  return (
    <svg className="bay-art" viewBox="0 0 48 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M3 16v-3.5C3 11 4 10 5.5 10H11l5-5h14l6 5h6.5C44 10 45 11 45 12.5V16c0 .6-.4 1-1 1h-3a4 4 0 0 0-8 0H15a4 4 0 0 0-8 0H4c-.6 0-1-.4-1-1z"
      />
      <path className="bay-art-cutout" d="M17 6.8h6v3.2h-9.2zM25 6.8h4.4l3.8 3.2H25z" />
      <circle fill="currentColor" cx="11" cy="17.5" r="3.2" />
      <circle fill="currentColor" cx="37" cy="17.5" r="3.2" />
    </svg>
  );
}

function ScooterArt() {
  return (
    <svg className="bay-art" viewBox="0 0 48 24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="18" r="3.6" />
        <circle cx="37" cy="18" r="3.6" />
        <path d="M31 14l4-10M32 4h6M35 9l2 9" />
      </g>
      <path fill="currentColor" d="M5 15c0-3.3 2.4-5.5 6-5.5h8l2.5 4H33l-1 2.5H6c-.6 0-1-.4-1-1z" />
      <rect fill="currentColor" x="8" y="6" width="11" height="2.6" rx="1.3" />
    </svg>
  );
}

function Bay({ slot }) {
  const state = BAY_STATE[slot.status] || 'closed';
  const status = SLOT_STATUS_LABELS[slot.status] || slot.status;
  const label = `${slot.code}, ${SLOT_TYPE_LABELS[slot.type] || slot.type}, ${status}`;
  return (
    <li className={`bay bay-${state}`} data-status={slot.status} aria-label={label} title={label}>
      {slot.type === 'two_wheeler' ? <ScooterArt /> : <CarArt />}
      <span className="bay-code">{slot.code}</span>
    </li>
  );
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// One block of the lot, laid out like aisles: rows of ROW_SIZE bays, and each pair of
// rows faces the other across a driving lane.
function LotSection({ title, slots }) {
  const free = slots.filter((s) => s.status === 'available').length;
  const aisles = chunk(chunk(slots, ROW_SIZE), 2);

  return (
    <section className="lot-section" aria-label={title}>
      <header className="lot-section-header">
        <h3>{title}</h3>
        <span className="lot-free"><strong>{free}</strong> of {slots.length} free</span>
      </header>
      <div className="lot">
        {aisles.map((rows, a) => (
          <div key={a} className="lot-aisle">
            {rows.map((row, r) => (
              <div key={r}>
                {r === 1 && <div className="lot-lane" aria-hidden="true" />}
                <ul className="lot-row">
                  {row.map((slot) => <Bay key={slot.id} slot={slot} />)}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

// FR-03 on the driver dashboard: a picture of the lot that refreshes itself every few
// seconds. The refreshes are marked as background, so an idle session still expires (NFR-14).
export default function SlotMap() {
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    let active = true;

    async function load(background) {
      try {
        const result = await api.listSlots({}, { background });
        if (!active) return;
        setSlots(result.slots);
        setError('');
        setUpdatedAt(new Date());
      } catch (err) {
        if (active) setError(err.message);
      }
    }

    load(false);
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const sections = slots
    ? SECTIONS.map((s) => ({ ...s, slots: slots.filter((slot) => slot.type === s.type).sort(byCode) }))
        .filter((s) => s.slots.length > 0)
    : [];

  return (
    <section className="panel slot-map" aria-labelledby="slot-map-title">
      <div className="slot-map-header">
        <div>
          <h2 id="slot-map-title">Live parking map</h2>
          <p className="muted">
            Updates every {REFRESH_MS / 1000} seconds{updatedAt && `. Last updated ${updatedAt.toLocaleTimeString()}`}.
          </p>
        </div>
        <ul className="lot-legend" aria-label="Legend">
          <li><span className="legend-swatch bay-free" />Free</li>
          <li><span className="legend-swatch bay-taken" />Occupied or reserved</li>
          <li><span className="legend-swatch bay-closed" />Out of service</li>
        </ul>
      </div>

      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {slots === null && !error && <p className="muted">Loading the parking map…</p>}
      {slots && sections.length === 0 && <p className="muted">There are no slots yet.</p>}
      {sections.map((s) => <LotSection key={s.type} title={s.title} slots={s.slots} />)}
    </section>
  );
}
