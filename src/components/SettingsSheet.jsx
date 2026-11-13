import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { clearStore, hasPendingChanges, setSetting, syncNow, useStore } from '../lib/store.js';
import Sheet from './Sheet.jsx';
import Icon from './Icon.jsx';

function ChangePassword({ email, online }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  function reset() {
    setCurrent(''); setNext(''); setAgain(''); setError('');
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!online) return setError('You are offline. Connect to the internet to change your password.');
    if (next.length < 6) return setError('New password must be at least 6 characters.');
    if (next !== again) return setError('The two new passwords do not match.');
    if (next === current) return setError('New password is the same as the current one.');

    setBusy(true);
    // Check the current password first
    const check = await supabase.auth.signInWithPassword({ email, password: current });
    if (check.error) {
      setBusy(false);
      return setError('Current password is wrong.');
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) return setError(error.message);
    reset();
    setOpen(false);
    setDone(true);
  }

  if (!open) {
    return (
      <div className="stack-sm">
        {done && <div className="alert info"><Icon name="check" size={14} className="inline" /> Password changed.</div>}
        <button className="btn block" onClick={() => { setDone(false); setOpen(true); }}>
          <Icon name="lock" size={16} /> Change password
        </button>
      </div>
    );
  }

  return (
    <form className="settings-group stack-sm pw-form" onSubmit={submit}>
      <div className="settings-row"><span className="item-title">Change password</span></div>
      <label>Current password
        <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label>New password
        <input type="password" autoComplete="new-password" required minLength={6} value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label>New password again
        <input type="password" autoComplete="new-password" required minLength={6} value={again} onChange={(e) => setAgain(e.target.value)} />
      </label>
      {error && <div className="alert error">{error}</div>}
      <div className="grid2">
        <button type="button" className="btn" onClick={() => { reset(); setOpen(false); }}>Cancel</button>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

export default function SettingsSheet({ onClose }) {
  const { settings, status } = useStore();
  const [email, setEmail] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? ''));
  }, []);

  async function signOut() {
    if (hasPendingChanges()) {
      window.alert('Some changes are still waiting to upload. Connect to the internet first, then sign out.');
      return;
    }
    await supabase.auth.signOut();
    clearStore();
  }

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="stack">
        <label className="switch-row">
          <span className="grow">
            <span className="item-title">Allow edit &amp; delete</span>
            <span className="muted small item-sub">
              {settings.allowEdit
                ? 'On: you can change and delete expenses, payments, people and trips.'
                : 'Off: you can only add. Nothing can be changed or deleted by mistake.'}
            </span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={settings.allowEdit}
            onChange={(e) => setSetting('allowEdit', e.target.checked)}
          />
        </label>

        <div className="settings-group">
          <div className="settings-row">
            <span>Connection</span>
            <span className={status.online ? 'get' : 'muted'}>{status.online ? '● Online' : '● Offline'}</span>
          </div>
          <div className="settings-row">
            <span>Waiting to upload</span>
            <span>{status.pending} change{status.pending === 1 ? '' : 's'}</span>
          </div>
          <div className="settings-row">
            <span>Last updated</span>
            <span className="muted">{status.lastSynced ? new Date(status.lastSynced).toLocaleString() : 'never'}</span>
          </div>
          <button className="btn small block" onClick={() => syncNow()} disabled={!status.online || status.syncing}>
            {status.syncing ? 'Updating…' : <><Icon name="refresh" size={16} /> Update now</>}
          </button>
        </div>

        <div>
          <h2 className="section-title">Account</h2>
          <div className="settings-group mb-sm">
            <div className="settings-row">
              <span>Signed in as</span>
              <span className="muted account-email">{email}</span>
            </div>
          </div>
          <ChangePassword email={email} online={status.online} />
        </div>

        <button className="btn danger ghost block" onClick={signOut}>Sign out</button>
      </div>
    </Sheet>
  );
}
