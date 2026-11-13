import { useState } from 'react';
import { addMember, deleteMember, renameMember, useStore } from '../lib/store.js';
import Avatar from './Avatar.jsx';
import { formatMoney } from '../lib/money.js';
import Icon from './Icon.jsx';

export default function PeopleTab({ trip, members, balances, setError, deleteTrip }) {
  const { settings } = useStore();
  const canEdit = settings.allowEdit;
  const [name, setName] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');

  function attempt(fn) {
    try {
      fn();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  function add(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (attempt(() => addMember(trip.id, n))) setName('');
  }

  function rename(m) {
    const n = editName.trim();
    if (!n || n === m.name) return setEditId(null);
    if (attempt(() => renameMember(trip.id, m.id, n))) setEditId(null);
  }

  function remove(m) {
    if (!window.confirm(`Remove ${m.name} from this trip?`)) return;
    attempt(() => deleteMember(trip.id, m.id));
  }

  return (
    <>
      <form className="add-row mb" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a person" autoCapitalize="words" />
        <button className="btn primary" disabled={!name.trim()}>Add</button>
      </form>

      <div className="list">
        {members.map((m) => {
          const b = balances.find((x) => x.member.id === m.id);
          return (
            <div key={m.id} className="list-item">
              {editId === m.id ? (
                <form className="add-row grow" onSubmit={(e) => { e.preventDefault(); rename(m); }}>
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <button className="btn primary small">Save</button>
                  <button type="button" className="btn ghost small" onClick={() => setEditId(null)} aria-label="Cancel"><Icon name="x" size={18} /></button>
                </form>
              ) : (
                <>
                  <Avatar name={m.name} />
                  <span className="grow">
                    <span className="item-title">{m.name}</span>
                    <span className="muted small item-sub">
                      Paid {formatMoney(b?.paid ?? 0, trip.currency)} · Share {formatMoney(b?.share ?? 0, trip.currency)}
                    </span>
                  </span>
                  {canEdit && (
                    <>
                      <button className="icon-btn" onClick={() => { setEditId(m.id); setEditName(m.name); }} aria-label={`Rename ${m.name}`}><Icon name="edit" size={18} /></button>
                      <button className="icon-btn" onClick={() => remove(m)} aria-label={`Remove ${m.name}`}><Icon name="trash" size={18} /></button>
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="danger-zone">
        {canEdit ? (
          <button className="btn danger ghost block" onClick={deleteTrip}>Delete this trip</button>
        ) : (
          <p className="lock-note"><Icon name="lock" size={16} /> Rename, remove and delete are off. Turn them on in Settings.</p>
        )}
      </div>
    </>
  );
}
