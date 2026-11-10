import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { SLOT_STATUS_LABELS, SLOT_TYPE_LABELS } from '../slots.js';
import Field from './Field.jsx';
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

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// The code after the highest one in this block (P-37 → P-38), skipping codes already
// used anywhere on the lot. Only a suggestion: the admin can type any valid code.
function suggestCode(sectionSlots, allSlots) {
  const last = [...sectionSlots].sort(byCode).pop();
  const match = last && last.code.match(/^(.*?)(\d+)$/);
  if (!match) return '';
  const [, prefix, digits] = match;
  const used = new Set(allSlots.map((s) => s.code));
  for (let n = Number(digits) + 1; n < Number(digits) + 1000; n += 1) {
    const code = `${prefix}${String(n).padStart(digits.length, '0')}`;
    if (!used.has(code)) return code;
  }
  return '';
}

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

function bayLabel(slot) {
  const status = SLOT_STATUS_LABELS[slot.status] || slot.status;
  return `${slot.code}, ${SLOT_TYPE_LABELS[slot.type] || slot.type}, ${status}`;
}

function Bay({ slot, editable, selected, onSelect }) {
  const state = BAY_STATE[slot.status] || 'closed';
  const label = bayLabel(slot);
  const content = (
    <>
      {slot.type === 'two_wheeler' ? <ScooterArt /> : <CarArt />}
      <span className="bay-code">{slot.code}</span>
    </>
  );
  return (
    <li
      className={`bay bay-${state}${selected ? ' bay-selected' : ''}`}
      data-status={slot.status}
      aria-label={label}
      title={label}
    >
      {editable ? (
        <button type="button" className="bay-button" aria-pressed={selected} aria-label={label} onClick={() => onSelect(slot)}>
          {content}
        </button>
      ) : content}
    </li>
  );
}

// Admin only: add a bay of this block's type. The code starts as a suggestion.
function AddBayForm({ type, suggestion, onAdded, onCancel }) {
  const [code, setCode] = useState(suggestion);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = await api.addSlot({ code, type });
      onAdded(data.message);
    } catch (err) {
      setError(err.fields?.code || err.message);
      setSaving(false);
    }
  }

  return (
    <form className="inline-form add-bay-form" onSubmit={submit} noValidate>
      <Field
        label={`New ${SLOT_TYPE_LABELS[type].toLowerCase()} bay code`}
        name={`new-bay-${type}`}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={error}
        placeholder="P-30"
        maxLength={10}
        autoFocus
      />
      <button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add bay'}</button>
      <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
    </form>
  );
}

// One block of the lot, laid out like aisles: rows of ROW_SIZE bays, and each pair of
// rows faces the other across a driving lane.
function LotSection({ title, type, slots, allSlots, editable, selectedId, onSelect, onChanged }) {
  const [adding, setAdding] = useState(false);
  const free = slots.filter((s) => s.status === 'available').length;
  const aisles = chunk(chunk(slots, ROW_SIZE), 2);

  return (
    <section className="lot-section" aria-label={title}>
      <header className="lot-section-header">
        <h3>{title}</h3>
        <span className="lot-free"><strong>{free}</strong> of {slots.length} free</span>
        {editable && !adding && (
          <button type="button" className="secondary small" onClick={() => setAdding(true)}>
            + Add {SLOT_TYPE_LABELS[type].toLowerCase()} bay
          </button>
        )}
      </header>
      {adding && (
        <AddBayForm
          type={type}
          suggestion={suggestCode(slots, allSlots)}
          onCancel={() => setAdding(false)}
          onAdded={(message) => {
            setAdding(false);
            onChanged(message);
          }}
        />
      )}
      {slots.length === 0 ? (
        <p className="muted">No {SLOT_TYPE_LABELS[type].toLowerCase()} bays yet.</p>
      ) : (
        <div className="lot">
          {aisles.map((rows, a) => (
            <div key={a} className="lot-aisle">
              {rows.map((row, r) => (
                <div key={r}>
                  {r === 1 && <div className="lot-lane" aria-hidden="true" />}
                  <ul className="lot-row">
                    {row.map((slot) => (
                      <Bay key={slot.id} slot={slot} editable={editable} selected={slot.id === selectedId} onSelect={onSelect} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Admin only: what can be changed about the selected bay. Occupied and reserved come
// from real parking sessions and reservations, so the map never sets them by hand.
function BayActions({ slot, onChanged, onClose }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const closed = slot.status === 'unavailable';

  async function toggle() {
    setSaving(true);
    setError('');
    try {
      const data = await api.setSlotDisabled(slot.id, !closed);
      onChanged(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bay-actions" role="group" aria-label={`Edit ${slot.code}`}>
      <p>
        <strong>{slot.code}</strong>{' '}
        <span className="muted">{SLOT_TYPE_LABELS[slot.type]} · {SLOT_STATUS_LABELS[slot.status] || slot.status}</span>
      </p>
      {slot.status === 'occupied' && <p className="muted">A vehicle is parked here. Taking the bay out of service keeps it from being assigned again.</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="bay-actions-buttons">
        <button type="button" onClick={toggle} disabled={saving}>
          {closed ? 'Put back in service' : 'Take out of service'}
        </button>
        <button type="button" className="secondary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

// FR-03: a picture of the lot that refreshes itself every few seconds. The refreshes are
// marked as background, so an idle session still expires (NFR-14).
// editable (administrators, UC-12): select a bay to take it out of service or back, and
// add bays to either block.
export default function SlotMap({ editable = false }) {
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState('');

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
  }, [refreshKey]);

  function changed(message) {
    setNotice(message);
    setRefreshKey((k) => k + 1);
  }

  function select(slot) {
    setNotice('');
    setSelectedId((current) => (current === slot.id ? null : slot.id));
  }

  // Editors see both blocks even when one is empty, so they can add its first bay.
  const sections = slots
    ? SECTIONS.map((s) => ({ ...s, slots: slots.filter((slot) => slot.type === s.type).sort(byCode) }))
        .filter((s) => editable || s.slots.length > 0)
    : [];
  const selected = slots && slots.find((s) => s.id === selectedId);

  return (
    <section className="panel slot-map" aria-labelledby="slot-map-title">
      <div className="slot-map-header">
        <div>
          <h2 id="slot-map-title">Live parking map</h2>
          <p className="muted">
            Updates every {REFRESH_MS / 1000} seconds{updatedAt && `. Last updated ${updatedAt.toLocaleTimeString()}`}.
            {editable && ' Select a bay to edit it.'}
          </p>
        </div>
        <ul className="lot-legend" aria-label="Legend">
          <li><span className="legend-swatch bay-free" />Free</li>
          <li><span className="legend-swatch bay-taken" />Occupied or reserved</li>
          <li><span className="legend-swatch bay-closed" />Out of service</li>
        </ul>
      </div>

      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {notice && <p className="alert alert-success" role="status">{notice}</p>}
      {editable && selected && <BayActions key={selected.id} slot={selected} onChanged={changed} onClose={() => setSelectedId(null)} />}
      {slots === null && !error && <p className="muted">Loading the parking map…</p>}
      {slots && sections.length === 0 && <p className="muted">There are no slots yet.</p>}
      {sections.map((s) => (
        <LotSection
          key={s.type}
          title={s.title}
          type={s.type}
          slots={s.slots}
          allSlots={slots}
          editable={editable}
          selectedId={selectedId}
          onSelect={select}
          onChanged={changed}
        />
      ))}
    </section>
  );
}
