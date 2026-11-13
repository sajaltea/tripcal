import { supabase } from '../lib/supabase.js';
import { clearStore, hasPendingChanges, setSetting, syncNow, useStore } from '../lib/store.js';
import Sheet from './Sheet.jsx';
import Icon from './Icon.jsx';

export default function SettingsSheet({ onClose }) {
  const { settings, status } = useStore();

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

        <button className="btn danger ghost block" onClick={signOut}>Sign out</button>
      </div>
    </Sheet>
  );
}
