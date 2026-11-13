import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createTrip, useStore } from '../lib/store.js';
import SettingsSheet from './SettingsSheet.jsx';
import { hueFor } from './Avatar.jsx';
import { formatMoney, toCents } from '../lib/money.js';
import Sheet from './Sheet.jsx';
import SyncBar from './SyncBar.jsx';
import Icon from './Icon.jsx';

const fmtD = (d) => new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const fmtRange = (a, b) => (b ? `${fmtD(a)} – ${fmtD(b)}` : fmtD(a));

const EMPTY = { name: '', currency: 'INR', start_date: '', end_date: '', people: '' };

export default function TripsList() {
  const navigate = useNavigate();
  const { trips, loaded, status } = useStore();
  const [formError, setFormError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [form, setForm] = useState(EMPTY);

  function submit(e) {
    e.preventDefault();
    setFormError('');
    const names = [...new Set(form.people.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))];
    if (!form.name.trim()) return setFormError('Give the trip a name.');
    if (names.length === 0) return setFormError('Add at least one person on the trip.');
    const id = createTrip({
      name: form.name.trim(),
      currency: form.currency.trim().toUpperCase() || 'INR',
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      people: names,
    });
    setForm(EMPTY);
    setShowForm(false);
    navigate(`/trip/${id}`);
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const waiting = !loaded && trips.length === 0;

  return (
    <>
      <header className="appbar">
        <div className="appbar-title">My trips</div>
        <button className="icon-btn gear" onClick={() => setShowSettings(true)} aria-label="Settings"><Icon name="settings" /></button>
      </header>
      <SyncBar />

      <main className="page with-fab">
        {status.loadError && <div className="alert error">{status.loadError}</div>}

        {waiting ? (
          !status.loadError && (
            <p className="muted center">{status.online ? 'Loading…' : 'You are offline. Your trips will appear once you connect the first time.'}</p>
          )
        ) : trips.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><Icon name="map" size={28} /></div>
            <p>No trips yet.</p>
            <button className="btn primary" onClick={() => setShowForm(true)}>Create your first trip</button>
          </div>
        ) : (
          <div className="stack-sm">
            {trips.map((t) => {
              const total = t.expenses.reduce((s, e) => s + toCents(e.amount), 0);
              return (
                <Link key={t.id} to={`/trip/${t.id}`} className="card trip-card">
                  <span className="trip-tile" style={{ '--h': hueFor(t.name) }}>{t.name.trim().slice(0, 1).toUpperCase()}</span>
                  <div className="grow">
                    <div className="trip-name">
                      {t.name}
                      {status.pendingTrips.has(t.id) && <span className="pending-dot" title="Changes waiting to upload" />}
                    </div>
                    <div className="muted small">
                      {t.members.length} people
                      {t.start_date ? ` · ${fmtRange(t.start_date, t.end_date)}` : ''}
                    </div>
                  </div>
                  <div className="right">
                    <div className="amount">{formatMoney(total, t.currency)}</div>
                    <div className="muted small">spent</div>
                  </div>
                  <span className="chev"><Icon name="chevron" size={18} /></span>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      {!status.loadError && (
        <button className="fab" onClick={() => setShowForm(true)} aria-label="New trip"><Icon name="plus" size={26} stroke={2.2} /></button>
      )}

      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}

      {showForm && (
        <Sheet title="New trip" onClose={() => setShowForm(false)}>
          <form className="stack" onSubmit={submit}>
            <label>Trip name
              <input required value={form.name} onChange={set('name')} placeholder="Goa 2026" />
            </label>
            <label>People on the trip
              <textarea rows={3} value={form.people} onChange={set('people')} placeholder="Sajal, Rahul, Priya" />
              <span className="hint">Separate names with commas or new lines</span>
            </label>
            <div className="grid2">
              <label>Start date
                <input type="date" value={form.start_date} onChange={set('start_date')} />
              </label>
              <label>End date
                <input type="date" value={form.end_date} onChange={set('end_date')} />
              </label>
            </div>
            <label>Currency
              <input value={form.currency} onChange={set('currency')} maxLength={3} placeholder="INR" autoCapitalize="characters" />
            </label>
            {formError && <div className="alert error">{formError}</div>}
            <button className="btn primary block">Create trip</button>
          </form>
        </Sheet>
      )}
    </>
  );
}
