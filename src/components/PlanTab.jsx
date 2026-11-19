import { useState } from 'react';
import { addPlanItem, deletePlanItem, updatePlanItem, useStore } from '../lib/store.js';
import { today } from '../lib/money.js';
import Sheet from './Sheet.jsx';
import Icon from './Icon.jsx';

const addDays = (d, n) => {
  const x = new Date(d + 'T00:00');
  x.setDate(x.getDate() + n);
  return x.toLocaleDateString('en-CA');
};
const dayLabel = (d) => new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

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

function PlanForm({ trip, days, item, defaultDay, onDone, onDelete, canDelete }) {
  const [f, setF] = useState({
    day: item?.day ?? defaultDay ?? days[0] ?? today(),
    time: item?.time ?? '',
    title: item?.title ?? '',
    notes: item?.notes ?? '',
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function save(e) {
    e.preventDefault();
    if (!f.title.trim()) return setError('Write what you plan to do.');
    if (!f.day) return setError('Choose a day.');
    const data = { day: f.day, time: f.time || null, title: f.title.trim(), notes: f.notes.trim() || null };
    if (item) updatePlanItem(trip.id, item.id, data);
    else addPlanItem({ trip_id: trip.id, ...data });
    onDone();
  }

  const hasRange = Boolean(trip.start_date);
  return (
    <form className="stack" onSubmit={save}>
      <label>What’s the plan?
        <input autoFocus value={f.title} onChange={set('title')} placeholder="Tiger Hill sunrise, check-in, lunch…" required />
      </label>
      <div className="grid2">
        <label>Day
          {hasRange ? (
            <select value={f.day} onChange={set('day')}>
              {[...new Set([...days, f.day])].sort().map((d) => (
                <option key={d} value={d}>
                  {days.indexOf(d) >= 0 && trip.start_date && d >= trip.start_date
                    ? `Day ${Math.round((new Date(d) - new Date(trip.start_date)) / 86400000) + 1} · ${dayLabel(d)}`
                    : dayLabel(d)}
                </option>
              ))}
            </select>
          ) : (
            <input type="date" value={f.day} onChange={set('day')} required />
          )}
        </label>
        <label>Time <span className="hint">(optional)</span>
          <input type="time" value={f.time} onChange={set('time')} />
        </label>
      </div>
      <label>Notes / place <span className="hint">(optional)</span>
        <textarea rows={3} value={f.notes} onChange={set('notes')} placeholder="Address, booking number, what to carry…" />
      </label>
      {error && <div className="alert error">{error}</div>}
      <button className="btn primary block">{item ? 'Save changes' : 'Add to plan'}</button>
      {item && canDelete && (
        <button type="button" className="btn danger ghost block" onClick={onDelete}>
          <Icon name="trash" size={16} /> Delete from plan
        </button>
      )}
    </form>
  );
}

export default function PlanTab({ trip, readOnly }) {
  const { settings } = useStore();
  const [sheet, setSheet] = useState(null); // null | { day } | { item }
  const days = tripDays(trip);
  const canEdit = !readOnly && settings.allowEdit;
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

  if (days.length === 0) {
    return (
      <>
        <div className="empty">
          <div className="empty-icon"><Icon name="calendar" size={28} /></div>
          <p>No plan yet.</p>
          {!readOnly && (
            <>
              <p className="small muted">Add trip dates to see every day here, or just add a plan item.</p>
              <button className="btn primary" onClick={() => setSheet({ day: today() })}>Add a plan item</button>
            </>
          )}
        </div>
        {sheet && (
          <Sheet title="Add to plan" onClose={() => setSheet(null)}>
            <PlanForm trip={trip} days={[]} defaultDay={sheet.day} onDone={() => setSheet(null)} />
          </Sheet>
        )}
      </>
    );
  }

  const total = trip.plan.length;
  const done = trip.plan.filter((i) => i.done).length;

  return (
    <>
      {total > 0 && (
        <div className="plan-progress">
          <span>{done} of {total} done</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(done / total) * 100}%` }} /></div>
        </div>
      )}

      {days.map((d) => {
        const items = trip.plan.filter((i) => i.day === d);
        const n = trip.start_date && d >= trip.start_date ? Math.round((new Date(d) - new Date(trip.start_date)) / 86400000) + 1 : null;
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
                    <button className="row-btn" onClick={() => !readOnly && setSheet({ item: it })} disabled={readOnly}>
                      <span className="plan-time">{it.time ? fmtTime(it.time) : ''}</span>
                      <span className="grow">
                        <span className="item-title">{it.title}</span>
                        {it.notes && <span className="muted small plan-notes">{it.notes}</span>}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {!readOnly && (
        <button className="fab" onClick={() => setSheet({ day: days.includes(todayStr) ? todayStr : days[0] })} aria-label="Add to plan">
          <Icon name="plus" size={26} stroke={2.2} />
        </button>
      )}

      {sheet && (
        <Sheet title={sheet.item ? 'Edit plan' : 'Add to plan'} onClose={() => setSheet(null)}>
          <PlanForm
            key={sheet.item?.id ?? sheet.day}
            trip={trip}
            days={days}
            item={sheet.item}
            defaultDay={sheet.day}
            canDelete={canEdit}
            onDelete={() => remove(sheet.item)}
            onDone={() => setSheet(null)}
          />
        </Sheet>
      )}
    </>
  );
}
