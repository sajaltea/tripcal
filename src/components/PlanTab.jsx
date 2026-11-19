import { useEffect, useState } from 'react';
import { addPlanItem, attachPlanPhoto, deletePlanItem, removePlanPhoto, updatePlanItem } from '../lib/store.js';
import { compressImage } from '../lib/bills.js';
import { today } from '../lib/money.js';
import Sheet from './Sheet.jsx';
import BillImage from './BillImage.jsx';
import Icon from './Icon.jsx';

const addDays = (d, n) => {
  const x = new Date(d + 'T00:00');
  x.setDate(x.getDate() + n);
  return x.toLocaleDateString('en-CA');
};
const dayLabel = (d) => new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const dayNum = (trip, d) =>
  trip.start_date && d >= trip.start_date ? Math.round((new Date(d) - new Date(trip.start_date)) / 86400000) + 1 : null;

// All days of the trip (start → end), plus any other days that already have plan items
function tripDays(trip) {
  const days = new Set();
  if (trip.start_date) {
    const end = trip.end_date && trip.end_date >= trip.start_date ? trip.end_date : trip.start_date;
    for (let d = trip.start_date, i = 0; d <= end && i < 60; d = addDays(d, 1), i++) days.add(d);
  }
  for (const it of trip.plan) days.add(it.day);
  return [...days].sort();
}

function PlanForm({ trip, days, item, defaultDay, onDone, onDelete }) {
  const [f, setF] = useState({
    day: item?.day ?? defaultDay ?? days[0] ?? today(),
    title: item?.title ?? '',
    notes: item?.notes ?? '',
  });
  const [photo, setPhoto] = useState(null); // new photo: { blob, url }
  const [dropOld, setDropOld] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const oldPath = item?.photo_path && !dropOld ? item.photo_path : null;

  useEffect(() => () => photo && URL.revokeObjectURL(photo.url), [photo]);

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusyPhoto(true);
    setError('');
    try {
      const blob = await compressImage(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyPhoto(false);
    }
  }

  function save(e) {
    e.preventDefault();
    if (!f.title.trim()) return setError('Give this plan a name.');
    if (!f.day) return setError('Choose a day.');
    const data = { day: f.day, title: f.title.trim(), notes: f.notes.trim() || null };
    let id = item?.id;
    if (item) updatePlanItem(trip.id, item.id, data);
    else id = addPlanItem({ trip_id: trip.id, ...data });
    // Photo removed or replaced
    if (item?.photo_path && (dropOld || photo)) removePlanPhoto(trip.id, id, item.photo_path);
    if (photo) attachPlanPhoto(trip.id, id, photo.blob);
    onDone();
  }

  const hasRange = Boolean(trip.start_date);
  return (
    <form className="stack" onSubmit={save}>
      <label>Day
        {hasRange ? (
          <select value={f.day} onChange={set('day')}>
            {[...new Set([...days, f.day])].sort().map((d) => (
              <option key={d} value={d}>{dayNum(trip, d) ? `Day ${dayNum(trip, d)} · ${dayLabel(d)}` : dayLabel(d)}</option>
            ))}
          </select>
        ) : (
          <input type="date" value={f.day} onChange={set('day')} required />
        )}
      </label>
      <label>Name
        <input value={f.title} onChange={set('title')} placeholder="Tiger Hill sunrise, hotel check-in…" required />
      </label>
      <label>Notes <span className="hint">(optional)</span>
        <textarea rows={3} value={f.notes} onChange={set('notes')} placeholder="Address, booking number, what to carry…" />
      </label>

      <div>
        <div className="field-label">Photo <span className="hint">(optional)</span></div>
        {photo ? (
          <div className="bill-edit">
            <img src={photo.url} alt="New plan photo" className="bill-thumb" />
            <button type="button" className="btn small ghost" onClick={() => setPhoto(null)}>Remove</button>
          </div>
        ) : oldPath ? (
          <div className="bill-edit">
            <BillImage path={oldPath} />
            <button type="button" className="btn small ghost" onClick={() => setDropOld(true)}>Remove</button>
          </div>
        ) : (
          <label className="photo-pick">
            <input type="file" accept="image/*" onChange={pickPhoto} />
            <Icon name="camera" size={20} />
            <span>{busyPhoto ? 'Preparing photo…' : 'Add photo'}</span>
            <span className="hint">Ticket, place, map or booking</span>
          </label>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}
      <button className="btn primary block" disabled={busyPhoto}>{item ? 'Save changes' : 'Add to plan'}</button>
      {item && (
        <button type="button" className="btn danger ghost block" onClick={onDelete}>
          <Icon name="trash" size={16} /> Delete from plan
        </button>
      )}
    </form>
  );
}

export default function PlanTab({ trip, readOnly }) {
  const [sheet, setSheet] = useState(null); // null | { day } | { item } | { view }
  const days = tripDays(trip);
  const todayStr = today();

  function toggle(it) {
    if (readOnly) return;
    updatePlanItem(trip.id, it.id, { done: !it.done });
  }

  function remove(it) {
    if (!window.confirm(`Delete "${it.title}" from the plan?`)) return;
    deletePlanItem(trip.id, it);
    setSheet(null);
  }

  const total = trip.plan.length;
  const done = trip.plan.filter((i) => i.done).length;

  return (
    <>
      {days.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="calendar" size={28} /></div>
          <p>No plan yet.</p>
          {!readOnly && (
            <>
              <p className="small muted">Add trip dates to see every day here, or just add a plan.</p>
              <button className="btn primary" onClick={() => setSheet({ day: todayStr })}>Add a plan</button>
            </>
          )}
        </div>
      ) : (
        <>
          {total > 0 && (
            <div className="plan-progress">
              <span>{done} of {total} done</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(done / total) * 100}%` }} /></div>
            </div>
          )}

          {days.map((d) => {
            const items = trip.plan.filter((i) => i.day === d);
            const n = dayNum(trip, d);
            return (
              <section key={d} className={`plan-day${d === todayStr ? ' is-today' : ''}`}>
                <div className="plan-day-head">
                  <div>
                    {n && <span className="plan-day-num">Day {n}</span>}
                    <span className="plan-day-date">{dayLabel(d)}</span>
                    {d === todayStr && <span className="tag share">Today</span>}
                  </div>
                  {!readOnly && (
                    <button className="btn small ghost" onClick={() => setSheet({ day: d })}>
                      <Icon name="plus" size={14} /> Add
                    </button>
                  )}
                </div>

                {items.length === 0 ? (
                  <p className="plan-empty">Nothing planned{readOnly ? '' : ' yet'}.</p>
                ) : (
                  <div className="list">
                    {items.map((it) => (
                      <div key={it.id} className={`list-item plan-item${it.done ? ' done' : ''}`}>
                        <button
                          className={`check${it.done ? ' on' : ''}`}
                          onClick={() => toggle(it)}
                          disabled={readOnly}
                          aria-label={it.done ? `Mark "${it.title}" not done` : `Mark "${it.title}" done`}
                        >
                          {it.done && <Icon name="check" size={14} stroke={2.6} />}
                        </button>
                        <button className="row-btn" onClick={() => setSheet(readOnly ? { view: it } : { item: it })}>
                          <span className="grow">
                            <span className="item-title">{it.title}</span>
                            {it.notes && <span className="muted small plan-notes">{it.notes}</span>}
                          </span>
                        </button>
                        {it.photo_path && <BillImage path={it.photo_path} className="plan-thumb" compact />}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}

      {!readOnly && days.length > 0 && (
        <button className="fab" onClick={() => setSheet({ day: days.includes(todayStr) ? todayStr : days[0] })} aria-label="Add to plan">
          <Icon name="plus" size={26} stroke={2.2} />
        </button>
      )}

      {/* Shared people: read-only view with the photo */}
      {sheet?.view && (
        <Sheet title={sheet.view.title} onClose={() => setSheet(null)}>
          <div className="stack">
            <div className="muted small">
              {dayNum(trip, sheet.view.day) ? `Day ${dayNum(trip, sheet.view.day)} · ` : ''}{dayLabel(sheet.view.day)}
              {sheet.view.done ? ' · Done' : ''}
            </div>
            {sheet.view.notes && <p className="plan-view-notes">{sheet.view.notes}</p>}
            {sheet.view.photo_path && <BillImage path={sheet.view.photo_path} className="bill-large" />}
          </div>
        </Sheet>
      )}

      {/* Admin: add or edit (any time) */}
      {sheet && !sheet.view && !readOnly && (
        <Sheet title={sheet.item ? 'Edit plan' : 'Add to plan'} onClose={() => setSheet(null)}>
          <PlanForm
            key={sheet.item?.id ?? sheet.day}
            trip={trip}
            days={days}
            item={sheet.item}
            defaultDay={sheet.day}
            onDelete={() => remove(sheet.item)}
            onDone={() => setSheet(null)}
          />
        </Sheet>
      )}
    </>
  );
}
