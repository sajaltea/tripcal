import { dismissFailed, retryFailed, syncNow, useStore } from '../lib/store.js';
import Icon from './Icon.jsx';

function ago(iso) {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString();
}

// Thin bar under the top bar showing offline / waiting-to-upload state.
export default function SyncBar() {
  const { status } = useStore();
  const { online, syncing, pending, failed, lastSynced } = status;

  return (
    <>
      {!online ? (
        <div className="syncbar offline">
          <span className="row gap-xs"><Icon name="offline" size={16} /> Offline</span>
          <span>{pending ? `${pending} change${pending > 1 ? 's' : ''} saved on this phone` : `Last updated ${ago(lastSynced)}`}</span>
        </div>
      ) : pending > 0 ? (
        <button className="syncbar pending" onClick={() => syncNow()}>
          <span className="row gap-xs"><Icon name="cloud" size={16} /> {syncing ? 'Uploading…' : 'Waiting to upload'}</span>
          <span>{pending} change{pending > 1 ? 's' : ''}{syncing ? '' : ' · tap to retry'}</span>
        </button>
      ) : null}

      {failed.length > 0 && (
        <div className="syncbar failed">
          <div className="grow">
            <strong>{failed.length} change{failed.length > 1 ? 's' : ''} could not be saved:</strong>
            {failed.slice(-3).map((f) => (
              <div key={f.id} className="small">{f.label}: {f.message}</div>
            ))}
          </div>
          <div className="row gap-sm">
            {failed.some((f) => f.op) && <button className="btn small" onClick={retryFailed}>Retry</button>}
            <button className="icon-btn" onClick={() => window.confirm('Throw away these changes?') && dismissFailed()} aria-label="Dismiss"><Icon name="x" size={18} /></button>
          </div>
        </div>
      )}
    </>
  );
}
