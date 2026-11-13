import { useState } from 'react';
import { addMember, deleteMember, updateMember, useStore } from '../lib/store.js';
import { formatMoney } from '../lib/money.js';
import Avatar from './Avatar.jsx';
import Sheet from './Sheet.jsx';
import Icon from './Icon.jsx';

function EditPerson({ trip, member, canRename, onDone }) {
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email ?? '');
  const [error, setError] = useState('');

  function save(e) {
    e.preventDefault();
    setError('');
    const patch = {};
    const n = name.trim();
    if (canRename && n && n !== member.name) patch.name = n;
    const mail = email.trim().toLowerCase();
    if (mail !== (member.email ?? '')) patch.email = mail;
    if (!Object.keys(patch).length) return onDone();
    try {
      updateMember(trip.id, member.id, patch);
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="stack" onSubmit={save}>
      <label>Name
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canRename} required />
        {!canRename && <span className="hint">Turn on “Allow edit &amp; delete” in Settings to rename.</span>}
      </label>
      <label>Email <span className="hint">(to share this trip)</span>
        <input type="email" inputMode="email" autoCapitalize="none" placeholder="name@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <span className="hint">When {member.name} signs in with this email, they can view this trip.</span>
      </label>
      {error && <div className="alert error">{error}</div>}
      <button className="btn primary block">Save</button>
    </form>
  );
}

export default function PeopleTab({ trip, members, balances, setError, deleteTrip, readOnly, meId }) {
  const { settings } = useStore();
  const canEdit = settings.allowEdit;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [editing, setEditing] = useState(null);

  function add(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    try {
      addMember(trip.id, n, email);
      setName('');
      setEmail('');
    } catch (err) {
      setError(err.message);
    }
  }

  function remove(m) {
    if (!window.confirm(`Remove ${m.name} from this trip?`)) return;
    try {
      deleteMember(trip.id, m.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      {readOnly ? (
        <div className="share-note">
          <Icon name="users" size={16} />
          <span>Shared with you by <strong>{trip.owner_email || 'the trip admin'}</strong>. You can view everything; only the admin can make changes.</span>
        </div>
      ) : (
        <>
          <form className="card stack-sm" onSubmit={add}>
            <div className="section-title flush">Add a person</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoCapitalize="words" />
            <input type="email" inputMode="email" autoCapitalize="none" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional, to share the trip)" />
            <button className="btn primary block" disabled={!name.trim()}>Add person</button>
          </form>
          <p className="help">
            Add an email to share this trip. That person signs in with the same email and finds the trip under
            <strong> Shared with me</strong> (view only). Tap a person to add or change their email.
          </p>
        </>
      )}

      <h2 className="section-title">{members.length} {members.length === 1 ? 'person' : 'people'}</h2>
      <div className="list">
        {members.map((m) => {
          const b = balances.find((x) => x.member.id === m.id);
          const row = (
            <>
              <Avatar name={m.name} />
              <span className="grow">
                <span className="item-title">
                  {m.name}
                  {m.id === meId && <span className="tag">You</span>}
                  {m.email && <span className="tag share">Can view</span>}
                </span>
                <span className="muted small item-sub">
                  {!readOnly && (m.email ? `${m.email} · ` : 'No email · ')}
                  Paid {formatMoney(b?.paid ?? 0, trip.currency)} · Share {formatMoney(b?.share ?? 0, trip.currency)}
                </span>
              </span>
            </>
          );
          if (readOnly) return <div key={m.id} className="list-item">{row}</div>;
          return (
            <div key={m.id} className="list-item">
              <button className="row-btn" onClick={() => setEditing(m)} aria-label={`Edit ${m.name}`}>{row}</button>
              {canEdit ? (
                <button className="icon-btn" onClick={() => remove(m)} aria-label={`Remove ${m.name}`}><Icon name="trash" size={18} /></button>
              ) : (
                <span className="chev"><Icon name="chevron" size={16} /></span>
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <div className="danger-zone">
          {canEdit ? (
            <button className="btn danger ghost block" onClick={deleteTrip}>Delete this trip</button>
          ) : (
            <p className="lock-note"><Icon name="lock" size={16} /> Remove and delete are off. Turn them on in Settings.</p>
          )}
        </div>
      )}

      {editing && (
        <Sheet title={`Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <EditPerson trip={trip} member={editing} canRename={canEdit} onDone={() => setEditing(null)} />
        </Sheet>
      )}
    </>
  );
}
