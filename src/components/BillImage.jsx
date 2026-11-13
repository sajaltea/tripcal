import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { getBlob, putBlob } from '../lib/bills.js';
import Icon from './Icon.jsx';

// Shows a bill photo: from the phone if saved there, otherwise downloads it (and keeps a copy for offline).
export default function BillImage({ path, className = 'bill-thumb' }) {
  const [url, setUrl] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | offline | error
  const [full, setFull] = useState(false);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    (async () => {
      setState('loading');
      let blob = await getBlob(path);
      if (!blob) {
        if (!navigator.onLine) return !cancelled && setState('offline');
        const { data, error } = await supabase.storage.from('bills').download(path);
        if (error || !data) return !cancelled && setState(navigator.onLine ? 'error' : 'offline');
        blob = data;
        putBlob(path, blob);
      }
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
      setState('ok');
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (state !== 'ok') {
    return (
      <div className={`${className} bill-placeholder`}>
        {state === 'loading' ? 'Loading photo…' : state === 'offline' ? 'Photo shows when online' : 'Photo not available'}
      </div>
    );
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setFull(true)} aria-label="Open bill photo">
        <img src={url} alt="Bill" />
      </button>
      {full && (
        <div className="photo-viewer" onClick={() => setFull(false)}>
          <img src={url} alt="Bill" />
          <button className="photo-close" aria-label="Close"><Icon name="x" /></button>
        </div>
      )}
    </>
  );
}
